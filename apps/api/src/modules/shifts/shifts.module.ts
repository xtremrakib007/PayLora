import { Body, Controller, Delete, Get, Injectable, Module, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { and, asc, between, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { Ctx, CurrentCtx, RequireModule, Roles } from '../../common/context';
import { AccessService, NotifyService } from '../../common/core';
import { addDays, todayIn } from '../../common/dates';
import { ids, must } from '../../common/util';
import { optStr, parse, zDate } from '../../common/validate';
import { DB, InjectDb } from '../../db/db';
import { employees, shifts, shiftTemplates } from '../../db/schema';

const TplDto = z.object({ name: z.string().trim().min(1).max(40), startTime: z.string().regex(/^\d{2}:\d{2}$/), endTime: z.string().regex(/^\d{2}:\d{2}$/), color: z.string().regex(/^#[0-9a-fA-F]{6}$/) });
const AssignDto = z.object({ items: z.array(z.object({ employeeId: z.uuid(), date: zDate, templateId: z.uuid().nullable(), note: optStr })).max(2000) });

@Injectable()
export class ShiftsService {
  constructor(@InjectDb() private db: DB, private access: AccessService, private notify: NotifyService) {}

  templates(c: Ctx) { return this.db.select().from(shiftTemplates).where(eq(shiftTemplates.companyId, c.companyId)).orderBy(asc(shiftTemplates.startTime)); }
  async addTemplate(c: Ctx, b: unknown) { const [r] = await this.db.insert(shiftTemplates).values({ ...parse(TplDto, b), companyId: c.companyId }).returning(); return r; }
  async updateTemplate(c: Ctx, id: string, b: unknown) { const [r] = await this.db.update(shiftTemplates).set(parse(TplDto.partial(), b)).where(and(eq(shiftTemplates.id, id), eq(shiftTemplates.companyId, c.companyId))).returning(); return must(r, 'Shift'); }
  async removeTemplate(c: Ctx, id: string) { await this.db.delete(shiftTemplates).where(and(eq(shiftTemplates.id, id), eq(shiftTemplates.companyId, c.companyId))); return { ok: true }; }

  /** Roster for a date range: employees × days. */
  async roster(c: Ctx, from: string, days = 7, mine = false) {
    const to = addDays(from, Math.min(Math.max(days, 1), 42) - 1);
    const vis = mine ? [this.access.self(c)] : await this.access.visibleEmployeeIds(c);
    const emps = await this.db.select({ id: employees.id, name: employees.name, code: employees.code, designation: employees.designation }).from(employees)
      .where(and(eq(employees.companyId, c.companyId), eq(employees.status, 'ACTIVE'), vis ? inArray(employees.id, ids(vis)) : undefined)).orderBy(asc(employees.name));
    const rows = await this.db.select({ s: shifts, t: shiftTemplates }).from(shifts).innerJoin(shiftTemplates, eq(shiftTemplates.id, shifts.templateId))
      .where(and(eq(shifts.companyId, c.companyId), between(shifts.date, from, to), inArray(shifts.employeeId, ids(emps.map((e) => e.id)))));
    return {
      from, to, employees: emps, templates: await this.templates(c),
      assignments: rows.map((r) => ({ id: r.s.id, employeeId: r.s.employeeId, date: r.s.date, note: r.s.note, templateId: r.t.id, name: r.t.name, startTime: r.t.startTime, endTime: r.t.endTime, color: r.t.color })),
    };
  }

  async assign(c: Ctx, body: unknown) {
    const d = parse(AssignDto, body);
    const vis = await this.access.visibleEmployeeIds(c);
    const items = d.items.filter((i) => !vis || vis.includes(i.employeeId));
    const valid = new Set((await this.db.select({ id: employees.id }).from(employees).where(and(eq(employees.companyId, c.companyId), inArray(employees.id, ids(items.map((i) => i.employeeId)))))).map((r) => r.id));
    const tpls = new Set((await this.templates(c)).map((t) => t.id));
    const touched = new Set<string>();
    for (const i of items.filter((x) => valid.has(x.employeeId))) {
      if (!i.templateId) { await this.db.delete(shifts).where(and(eq(shifts.employeeId, i.employeeId), eq(shifts.date, i.date))); continue; }
      if (!tpls.has(i.templateId)) continue;
      await this.db.insert(shifts).values({ companyId: c.companyId, employeeId: i.employeeId, templateId: i.templateId, date: i.date, note: i.note ?? null })
        .onConflictDoUpdate({ target: [shifts.employeeId, shifts.date], set: { templateId: i.templateId, note: i.note ?? null } });
      touched.add(i.employeeId);
    }
    if (touched.size) await this.notify.send(c.companyId, await this.access.userIdsForEmployees(c.companyId, [...touched]), { type: 'shift.updated', title: 'Your shift schedule changed', body: 'Open the app to see your updated roster.', link: '/me/shifts' }, c.userId);
    return { updated: items.length };
  }
}

@Controller('shifts')
@RequireModule('shifts')
export class ShiftsController {
  constructor(private s: ShiftsService) {}
  @Get('templates') tpls(@CurrentCtx() c: Ctx) { return this.s.templates(c); }
  @Roles('OWNER', 'HR') @Post('templates') add(@CurrentCtx() c: Ctx, @Body() b: unknown) { return this.s.addTemplate(c, b); }
  @Roles('OWNER', 'HR') @Patch('templates/:id') upd(@CurrentCtx() c: Ctx, @Param('id') id: string, @Body() b: unknown) { return this.s.updateTemplate(c, id, b); }
  @Roles('OWNER', 'HR') @Delete('templates/:id') del(@CurrentCtx() c: Ctx, @Param('id') id: string) { return this.s.removeTemplate(c, id); }
  @Get('roster') roster(@CurrentCtx() c: Ctx, @Query('from') from?: string, @Query('days') days?: string, @Query('mine') mine?: string) {
    return this.s.roster(c, parse(zDate, from || todayIn()), Number(days) || 7, !!mine);
  }
  @Roles('OWNER', 'HR', 'MANAGER') @Put('assign') assign(@CurrentCtx() c: Ctx, @Body() b: unknown) { return this.s.assign(c, b); }
}

@Module({ controllers: [ShiftsController], providers: [ShiftsService] })
export class ShiftsModule {}
