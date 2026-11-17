import { Body, Controller, Delete, Get, Injectable, Module, Param, Patch, Post, Query } from '@nestjs/common';
import { and, between, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { Ctx, CurrentCtx, isAdmin, RequireModule } from '../../common/context';
import { AccessService, NotifyService } from '../../common/core';
import { addDays, todayIn } from '../../common/dates';
import { deny, ids, must } from '../../common/util';
import { optStr, parse, zDate } from '../../common/validate';
import { DB, InjectDb } from '../../db/db';
import { employees, timesheets } from '../../db/schema';

const EntryDto = z.object({ employeeId: z.uuid().nullish(), date: zDate, project: z.string().trim().min(1).max(80), task: optStr, hours: z.coerce.number().positive().max(24), notes: optStr });

@Injectable()
export class TimesheetsService {
  constructor(@InjectDb() private db: DB, private access: AccessService, private notify: NotifyService) {}

  async list(c: Ctx, q: { from?: string; to?: string; status?: string; mine?: string }) {
    const to = q.to || todayIn(), from = q.from || addDays(to, -30);
    const vis = q.mine ? [this.access.self(c)] : await this.access.visibleEmployeeIds(c);
    const rows = await this.db.select({ t: timesheets, employeeName: employees.name }).from(timesheets).innerJoin(employees, eq(employees.id, timesheets.employeeId))
      .where(and(eq(timesheets.companyId, c.companyId), between(timesheets.date, from, to), vis ? inArray(timesheets.employeeId, ids(vis)) : undefined, q.status ? eq(timesheets.status, q.status as any) : undefined))
      .orderBy(desc(timesheets.date)).limit(1000);
    return rows.map((r) => ({ ...r.t, employeeName: r.employeeName }));
  }

  async create(c: Ctx, body: unknown) {
    const d = parse(EntryDto, body);
    const empId = await this.access.actingFor(c, d.employeeId);
    const [r] = await this.db.insert(timesheets).values({ companyId: c.companyId, employeeId: empId, date: d.date, project: d.project, task: d.task ?? null, hours: d.hours, notes: d.notes ?? null }).returning();
    return r;
  }

  async decide(c: Ctx, body: unknown) {
    const d = parse(z.object({ ids: z.array(z.uuid()).min(1).max(500), status: z.enum(['APPROVED', 'REJECTED']) }), body);
    const rows = await this.db.select().from(timesheets).where(and(eq(timesheets.companyId, c.companyId), inArray(timesheets.id, d.ids)));
    const ok: string[] = [];
    for (const r of rows) if (await this.access.canApprove(c, r.employeeId)) ok.push(r.id);
    if (!ok.length) deny('You cannot approve these entries');
    await this.db.update(timesheets).set({ status: d.status, decidedAt: new Date() }).where(inArray(timesheets.id, ok));
    const emps = [...new Set(rows.filter((r) => ok.includes(r.id)).map((r) => r.employeeId))];
    await this.notify.send(c.companyId, await this.access.userIdsForEmployees(c.companyId, emps), { type: 'timesheet.decided', title: `Timesheet ${d.status.toLowerCase()}`, body: `${ok.length} entr${ok.length === 1 ? 'y' : 'ies'} reviewed`, link: '/me/timesheets' });
    return { updated: ok.length };
  }

  async remove(c: Ctx, id: string) {
    const r = must(await this.db.query.timesheets.findFirst({ where: and(eq(timesheets.id, id), eq(timesheets.companyId, c.companyId)) }), 'Entry');
    if (!(isAdmin(c) || (r.employeeId === c.employeeId && r.status === 'PENDING'))) deny();
    await this.db.delete(timesheets).where(eq(timesheets.id, id));
    return { ok: true };
  }
}

@Controller('timesheets')
@RequireModule('timesheets')
export class TimesheetsController {
  constructor(private s: TimesheetsService) {}
  @Get() list(@CurrentCtx() c: Ctx, @Query() q: any) { return this.s.list(c, q); }
  @Post() create(@CurrentCtx() c: Ctx, @Body() b: unknown) { return this.s.create(c, b); }
  @Patch('decision') decide(@CurrentCtx() c: Ctx, @Body() b: unknown) { return this.s.decide(c, b); }
  @Delete(':id') remove(@CurrentCtx() c: Ctx, @Param('id') id: string) { return this.s.remove(c, id); }
}

@Module({ controllers: [TimesheetsController], providers: [TimesheetsService] })
export class TimesheetsModule {}
