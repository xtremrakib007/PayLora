import { BadRequestException, Body, Controller, Delete, Get, Injectable, Module, Param, Patch, Post } from '@nestjs/common';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { Ctx, CurrentCtx, isAdmin, RequireModule, Roles } from '../../common/context';
import { AccessService, NotifyService } from '../../common/core';
import { addDays, todayIn } from '../../common/dates';
import { deny, ids, must } from '../../common/util';
import { parse, zDate } from '../../common/validate';
import { DB, InjectDb } from '../../db/db';
import { employees, onboardings, onboardingTasks, onboardingTemplates } from '../../db/schema';

const TplTask = z.object({ title: z.string().trim().min(1).max(160), assignee: z.enum(['HR', 'EMPLOYEE', 'MANAGER']), dueDays: z.coerce.number().int().min(0).max(365) });
const TplDto = z.object({ name: z.string().trim().min(1).max(80), tasks: z.array(TplTask).max(60) });
const StartDto = z.object({ employeeId: z.uuid(), templateId: z.uuid(), startDate: zDate.optional() });

@Injectable()
export class OnboardingService {
  constructor(@InjectDb() private db: DB, private access: AccessService, private notify: NotifyService) {}

  templates(c: Ctx) { return this.db.select().from(onboardingTemplates).where(eq(onboardingTemplates.companyId, c.companyId)); }
  async addTemplate(c: Ctx, b: unknown) { const [r] = await this.db.insert(onboardingTemplates).values({ ...parse(TplDto, b), companyId: c.companyId }).returning(); return r; }
  async updateTemplate(c: Ctx, id: string, b: unknown) { const [r] = await this.db.update(onboardingTemplates).set(parse(TplDto.partial(), b)).where(and(eq(onboardingTemplates.id, id), eq(onboardingTemplates.companyId, c.companyId))).returning(); return must(r, 'Template'); }
  async removeTemplate(c: Ctx, id: string) { await this.db.delete(onboardingTemplates).where(and(eq(onboardingTemplates.id, id), eq(onboardingTemplates.companyId, c.companyId))); return { ok: true }; }

  /** Start an onboarding checklist for an employee from a template. */
  async start(c: Ctx, body: unknown) {
    const d = parse(StartDto, body);
    return this.startFor(c, d.employeeId, d.templateId, d.startDate);
  }

  async startFor(c: Ctx, employeeId: string, templateId?: string, startDate?: string) {
    const emp = await this.access.employee(c.companyId, employeeId);
    const tpl = templateId
      ? must(await this.db.query.onboardingTemplates.findFirst({ where: and(eq(onboardingTemplates.id, templateId), eq(onboardingTemplates.companyId, c.companyId)) }), 'Template')
      : await this.db.query.onboardingTemplates.findFirst({ where: eq(onboardingTemplates.companyId, c.companyId) });
    if (!tpl) throw new BadRequestException('Create an onboarding template first');
    const start = startDate || emp.joinDate || todayIn();
    const ob = await this.db.transaction(async (tx) => {
      const [ob] = await tx.insert(onboardings).values({ companyId: c.companyId, employeeId, title: tpl.name, startDate: start }).returning();
      if (tpl.tasks.length) await tx.insert(onboardingTasks).values(tpl.tasks.map((t, i) => ({ onboardingId: ob.id, title: t.title, assignee: t.assignee, dueDate: addDays(start, t.dueDays), sortOrder: i })));
      return ob;
    });
    await this.notify.send(c.companyId, await this.access.userIdsForEmployees(c.companyId, [employeeId]), { type: 'onboarding.started', title: `Welcome aboard, ${emp.name.split(' ')[0]}!`, body: 'Your onboarding checklist is ready.', link: '/me/onboarding' });
    return ob;
  }

  async list(c: Ctx, mine = false) {
    const vis = mine ? [this.access.self(c)] : await this.access.visibleEmployeeIds(c);
    const obs = await this.db.select({ o: onboardings, employeeName: employees.name, designation: employees.designation }).from(onboardings).innerJoin(employees, eq(employees.id, onboardings.employeeId))
      .where(and(eq(onboardings.companyId, c.companyId), vis ? inArray(onboardings.employeeId, ids(vis)) : undefined)).orderBy(desc(onboardings.startDate));
    const tasks = obs.length ? await this.db.select().from(onboardingTasks).where(inArray(onboardingTasks.onboardingId, obs.map((o) => o.o.id))).orderBy(asc(onboardingTasks.sortOrder)) : [];
    return obs.map((o) => ({ ...o.o, employeeName: o.employeeName, designation: o.designation, tasks: tasks.filter((t) => t.onboardingId === o.o.id) }));
  }

  async toggle(c: Ctx, taskId: string, done: boolean) {
    const [row] = await this.db.select({ t: onboardingTasks, o: onboardings }).from(onboardingTasks).innerJoin(onboardings, eq(onboardings.id, onboardingTasks.onboardingId))
      .where(and(eq(onboardingTasks.id, taskId), eq(onboardings.companyId, c.companyId)));
    if (!row) must(null, 'Task');
    const isOwn = row.o.employeeId === c.employeeId && row.t.assignee === 'EMPLOYEE';
    const isMgr = row.t.assignee === 'MANAGER' && (await this.access.canApprove(c, row.o.employeeId));
    if (!(isAdmin(c) || isOwn || isMgr)) deny('This task is assigned to someone else');
    const [u] = await this.db.update(onboardingTasks).set({ done, doneAt: done ? new Date() : null }).where(eq(onboardingTasks.id, taskId)).returning();
    return u;
  }

  async remove(c: Ctx, id: string) { await this.db.delete(onboardings).where(and(eq(onboardings.id, id), eq(onboardings.companyId, c.companyId))); return { ok: true }; }
}

@Controller('onboarding')
@RequireModule('onboarding')
export class OnboardingController {
  constructor(private s: OnboardingService) {}
  @Get() list(@CurrentCtx() c: Ctx) { return this.s.list(c); }
  @Get('mine') mine(@CurrentCtx() c: Ctx) { return this.s.list(c, true); }
  @Roles('OWNER', 'HR') @Post() start(@CurrentCtx() c: Ctx, @Body() b: unknown) { return this.s.start(c, b); }
  @Roles('OWNER', 'HR') @Delete(':id') remove(@CurrentCtx() c: Ctx, @Param('id') id: string) { return this.s.remove(c, id); }
  @Patch('tasks/:id') toggle(@CurrentCtx() c: Ctx, @Param('id') id: string, @Body() b: { done: boolean }) { return this.s.toggle(c, id, !!b?.done); }
  @Get('templates') tpls(@CurrentCtx() c: Ctx) { return this.s.templates(c); }
  @Roles('OWNER', 'HR') @Post('templates') addTpl(@CurrentCtx() c: Ctx, @Body() b: unknown) { return this.s.addTemplate(c, b); }
  @Roles('OWNER', 'HR') @Patch('templates/:id') updTpl(@CurrentCtx() c: Ctx, @Param('id') id: string, @Body() b: unknown) { return this.s.updateTemplate(c, id, b); }
  @Roles('OWNER', 'HR') @Delete('templates/:id') delTpl(@CurrentCtx() c: Ctx, @Param('id') id: string) { return this.s.removeTemplate(c, id); }
}

@Module({ controllers: [OnboardingController], providers: [OnboardingService], exports: [OnboardingService] })
export class OnboardingModule {}
