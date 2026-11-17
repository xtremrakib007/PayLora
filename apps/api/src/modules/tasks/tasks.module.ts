import { Body, Controller, Delete, Get, Injectable, Module, Param, Patch, Post, Query } from '@nestjs/common';
import { and, asc, desc, eq, inArray, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { Ctx, CurrentCtx, isAdmin, RequireModule } from '../../common/context';
import { AccessService, NotifyService } from '../../common/core';
import { deny, ids, must } from '../../common/util';
import { optStr, parse, zDate } from '../../common/validate';
import { DB, InjectDb } from '../../db/db';
import { employees, tasks, users } from '../../db/schema';

const TaskDto = z.object({
  title: z.string().trim().min(1).max(200), description: optStr, assigneeId: z.uuid().nullish().or(z.literal('').transform(() => null)),
  dueDate: zDate.nullish().or(z.literal('').transform(() => null)), priority: z.enum(['LOW', 'MEDIUM', 'HIGH']).default('MEDIUM'), status: z.enum(['TODO', 'IN_PROGRESS', 'DONE']).default('TODO'),
});

@Injectable()
export class TasksService {
  constructor(@InjectDb() private db: DB, private access: AccessService, private notify: NotifyService) {}

  async list(c: Ctx, q: { scope?: string; status?: string; assigneeId?: string }) {
    const conds = [eq(tasks.companyId, c.companyId)];
    if (q.scope === 'mine' || !q.scope && !isAdmin(c)) {
      conds.push(or(c.employeeId ? eq(tasks.assigneeId, c.employeeId) : sql`false`, eq(tasks.createdById, c.userId))!);
    } else if (!isAdmin(c)) {
      const vis = await this.access.visibleEmployeeIds(c);
      conds.push(or(inArray(tasks.assigneeId, ids(vis ?? [])), eq(tasks.createdById, c.userId))!);
    }
    if (q.status) conds.push(eq(tasks.status, q.status as any));
    if (q.assigneeId) conds.push(eq(tasks.assigneeId, q.assigneeId));
    const rows = await this.db.select({ t: tasks, assigneeName: employees.name, createdByName: users.name }).from(tasks)
      .leftJoin(employees, eq(employees.id, tasks.assigneeId)).leftJoin(users, eq(users.id, tasks.createdById))
      .where(and(...conds)).orderBy(asc(tasks.status), sql`${tasks.dueDate} asc nulls last`, desc(tasks.createdAt)).limit(500);
    return rows.map((r) => ({ ...r.t, assigneeName: r.assigneeName, createdByName: r.createdByName }));
  }

  private async checkAssign(c: Ctx, assigneeId?: string | null) {
    if (!assigneeId || assigneeId === c.employeeId) return;
    if (!(await this.access.canApprove(c, assigneeId))) deny('You can assign tasks to yourself or your team only');
  }

  async create(c: Ctx, b: unknown) {
    const d = parse(TaskDto, b);
    const assigneeId = d.assigneeId ?? c.employeeId;
    await this.checkAssign(c, assigneeId);
    const [t] = await this.db.insert(tasks).values({ ...d, assigneeId, companyId: c.companyId, createdById: c.userId, completedAt: d.status === 'DONE' ? new Date() : null }).returning();
    if (assigneeId && assigneeId !== c.employeeId) {
      await this.notify.send(c.companyId, await this.access.userIdsForEmployees(c.companyId, [assigneeId]), { type: 'task.assigned', title: 'New task assigned', body: `${d.title}${d.dueDate ? ` · due ${d.dueDate}` : ''}`, link: '/tasks' }, c.userId);
    }
    return t;
  }

  async update(c: Ctx, id: string, b: unknown) {
    const d = parse(TaskDto.partial(), b);
    const t = must(await this.db.query.tasks.findFirst({ where: and(eq(tasks.id, id), eq(tasks.companyId, c.companyId)) }), 'Task');
    const isAssignee = t.assigneeId != null && t.assigneeId === c.employeeId;
    const isOwner = t.createdById === c.userId || isAdmin(c) || (t.assigneeId ? await this.access.canApprove(c, t.assigneeId) : false);
    if (!isOwner && !isAssignee) deny();
    // Assignees may only move the status
    const patch = isOwner ? d : { status: d.status };
    if (isOwner && d.assigneeId !== undefined) await this.checkAssign(c, d.assigneeId);
    const [u] = await this.db.update(tasks).set({ ...patch, completedAt: patch.status ? (patch.status === 'DONE' ? new Date() : null) : t.completedAt }).where(eq(tasks.id, id)).returning();
    if (patch.status === 'DONE' && t.status !== 'DONE' && t.createdById !== c.userId) {
      await this.notify.send(c.companyId, [t.createdById], { type: 'task.done', title: 'Task completed', body: `${c.name} completed "${t.title}"`, link: '/tasks' });
    }
    if (isOwner && d.assigneeId && d.assigneeId !== t.assigneeId && d.assigneeId !== c.employeeId) {
      await this.notify.send(c.companyId, await this.access.userIdsForEmployees(c.companyId, [d.assigneeId]), { type: 'task.assigned', title: 'Task assigned to you', body: u.title, link: '/tasks' });
    }
    return u;
  }

  async remove(c: Ctx, id: string) {
    const t = must(await this.db.query.tasks.findFirst({ where: and(eq(tasks.id, id), eq(tasks.companyId, c.companyId)) }), 'Task');
    if (t.createdById !== c.userId && !isAdmin(c)) deny();
    await this.db.delete(tasks).where(eq(tasks.id, id));
    return { ok: true };
  }
}

@Controller('tasks')
@RequireModule('tasks')
export class TasksController {
  constructor(private s: TasksService) {}
  @Get() list(@CurrentCtx() c: Ctx, @Query() q: any) { return this.s.list(c, q); }
  @Post() create(@CurrentCtx() c: Ctx, @Body() b: unknown) { return this.s.create(c, b); }
  @Patch(':id') update(@CurrentCtx() c: Ctx, @Param('id') id: string, @Body() b: unknown) { return this.s.update(c, id, b); }
  @Delete(':id') remove(@CurrentCtx() c: Ctx, @Param('id') id: string) { return this.s.remove(c, id); }
}

@Module({ controllers: [TasksController], providers: [TasksService] })
export class TasksModule {}
