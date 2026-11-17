import { BadRequestException, Body, Controller, Get, Injectable, Module, Param, Patch, Post, Query } from '@nestjs/common';
import { and, asc, between, desc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { Ctx, CurrentCtx, isAdmin, RequireModule } from '../../common/context';
import { AccessService, NotifyService } from '../../common/core';
import { todayIn, workDays } from '../../common/dates';
import { deny, ids, must } from '../../common/util';
import { optStr, parse, zDate } from '../../common/validate';
import { DB, InjectDb } from '../../db/db';
import { employees, leaveRequests, leaveTypes } from '../../db/schema';

const RequestDto = z.object({ employeeId: z.uuid().nullish(), leaveTypeId: z.uuid(), fromDate: zDate, toDate: zDate, reason: optStr, halfDay: z.boolean().optional() });

@Injectable()
export class LeaveService {
  constructor(@InjectDb() private db: DB, private access: AccessService, private notify: NotifyService) {}

  async list(c: Ctx, q: { status?: string; mine?: string; employeeId?: string }) {
    const vis = q.mine ? [this.access.self(c)] : await this.access.visibleEmployeeIds(c);
    return this.db.select({
      id: leaveRequests.id, employeeId: leaveRequests.employeeId, employeeName: employees.name, employeeCode: employees.code,
      leaveTypeId: leaveRequests.leaveTypeId, leaveType: leaveTypes.name, paid: leaveTypes.paid, fromDate: leaveRequests.fromDate, toDate: leaveRequests.toDate,
      days: leaveRequests.days, reason: leaveRequests.reason, status: leaveRequests.status, decidedAt: leaveRequests.decidedAt, createdAt: leaveRequests.createdAt,
    }).from(leaveRequests).innerJoin(employees, eq(employees.id, leaveRequests.employeeId)).innerJoin(leaveTypes, eq(leaveTypes.id, leaveRequests.leaveTypeId))
      .where(and(eq(leaveRequests.companyId, c.companyId), vis ? inArray(leaveRequests.employeeId, ids(vis)) : undefined,
        q.status ? eq(leaveRequests.status, q.status as any) : undefined, q.employeeId ? eq(leaveRequests.employeeId, q.employeeId) : undefined))
      .orderBy(desc(leaveRequests.fromDate)).limit(500);
  }

  async used(companyId: string, employeeId: string, year: string) {
    const rows = await this.db.select({ typeId: leaveRequests.leaveTypeId, days: sql<number>`coalesce(sum(${leaveRequests.days}),0)`.mapWith(Number) })
      .from(leaveRequests).where(and(eq(leaveRequests.companyId, companyId), eq(leaveRequests.employeeId, employeeId), inArray(leaveRequests.status, ['APPROVED', 'PENDING']), between(leaveRequests.fromDate, `${year}-01-01`, `${year}-12-31`)))
      .groupBy(leaveRequests.leaveTypeId);
    return new Map(rows.map((r) => [r.typeId, r.days]));
  }

  async balances(c: Ctx, year: string, employeeId?: string) {
    const vis = employeeId ? [employeeId] : await this.access.visibleEmployeeIds(c);
    if (employeeId && !(isAdmin(c) || (await this.access.visibleEmployeeIds(c))?.includes(employeeId))) deny();
    const types = await this.db.select().from(leaveTypes).where(and(eq(leaveTypes.companyId, c.companyId), eq(leaveTypes.active, true))).orderBy(asc(leaveTypes.name));
    const emps = await this.db.select({ id: employees.id, name: employees.name, code: employees.code }).from(employees)
      .where(and(eq(employees.companyId, c.companyId), eq(employees.status, 'ACTIVE'), vis ? inArray(employees.id, ids(vis)) : undefined)).orderBy(asc(employees.name));
    const approved = await this.db.select({ emp: leaveRequests.employeeId, typeId: leaveRequests.leaveTypeId, status: leaveRequests.status, days: sql<number>`sum(${leaveRequests.days})`.mapWith(Number) })
      .from(leaveRequests).where(and(eq(leaveRequests.companyId, c.companyId), inArray(leaveRequests.status, ['APPROVED', 'PENDING']), between(leaveRequests.fromDate, `${year}-01-01`, `${year}-12-31`)))
      .groupBy(leaveRequests.employeeId, leaveRequests.leaveTypeId, leaveRequests.status);
    const key = (e: string, t: string) => e + ':' + t;
    const taken = new Map<string, { approved: number; pending: number }>();
    for (const a of approved) { const k = key(a.emp, a.typeId); const v = taken.get(k) ?? { approved: 0, pending: 0 }; if (a.status === 'APPROVED') v.approved += a.days; else v.pending += a.days; taken.set(k, v); }
    return {
      year, types,
      rows: emps.map((e) => ({ employee: e, balances: types.map((t) => { const v = taken.get(key(e.id, t.id)) ?? { approved: 0, pending: 0 }; return { leaveTypeId: t.id, entitled: t.daysPerYear, taken: v.approved, pending: v.pending, remaining: t.daysPerYear ? t.daysPerYear - v.approved - v.pending : null }; }) })),
    };
  }

  async create(c: Ctx, body: unknown) {
    const d = parse(RequestDto, body);
    if (d.toDate < d.fromDate) throw new BadRequestException('End date is before start date');
    const empId = await this.access.actingFor(c, d.employeeId);
    const type = must(await this.db.query.leaveTypes.findFirst({ where: and(eq(leaveTypes.id, d.leaveTypeId), eq(leaveTypes.companyId, c.companyId), eq(leaveTypes.active, true)) }), 'Leave type');
    const co = await this.access.company(c.companyId);
    let days = workDays(d.fromDate, d.toDate, co.restDays, await this.access.holidaySet(c.companyId));
    if (d.halfDay && d.fromDate === d.toDate && days === 1) days = 0.5;
    if (!days) throw new BadRequestException('There are no working days in that range');
    const overlap = await this.db.select({ id: leaveRequests.id }).from(leaveRequests).where(and(eq(leaveRequests.employeeId, empId), inArray(leaveRequests.status, ['PENDING', 'APPROVED']),
      sql`${leaveRequests.fromDate} <= ${d.toDate} and ${leaveRequests.toDate} >= ${d.fromDate}`));
    if (overlap.length) throw new BadRequestException('This overlaps another leave request');
    if (type.daysPerYear > 0 && !isAdmin(c)) {
      const used = (await this.used(c.companyId, empId, d.fromDate.slice(0, 4))).get(type.id) ?? 0;
      if (used + days > type.daysPerYear) throw new BadRequestException(`Not enough ${type.name} balance: ${type.daysPerYear - used} day(s) left`);
    }
    const autoApprove = isAdmin(c) && !!d.employeeId && d.employeeId !== c.employeeId;
    const [r] = await this.db.insert(leaveRequests).values({
      companyId: c.companyId, employeeId: empId, leaveTypeId: type.id, fromDate: d.fromDate, toDate: d.toDate, days, reason: d.reason ?? null,
      status: autoApprove ? 'APPROVED' : 'PENDING', decidedById: autoApprove ? c.userId : null, decidedAt: autoApprove ? new Date() : null,
    }).returning();
    if (!autoApprove) {
      const emp = await this.access.employee(c.companyId, empId);
      await this.notify.send(c.companyId, await this.access.approverUserIds(c.companyId, empId),
        { type: 'leave.requested', title: `Leave request from ${emp.name}`, body: `${type.name}: ${d.fromDate} → ${d.toDate} (${days} day${days === 1 ? '' : 's'})`, link: '/leave' }, c.userId);
    }
    return r;
  }

  async decide(c: Ctx, id: string, body: unknown) {
    const { status } = parse(z.object({ status: z.enum(['APPROVED', 'REJECTED']) }), body);
    const r = must(await this.db.query.leaveRequests.findFirst({ where: and(eq(leaveRequests.id, id), eq(leaveRequests.companyId, c.companyId)) }), 'Leave request');
    if (!(await this.access.canApprove(c, r.employeeId))) deny('You cannot approve this request');
    if (r.status !== 'PENDING' && !isAdmin(c)) throw new BadRequestException('This request was already decided');
    const [u] = await this.db.update(leaveRequests).set({ status, decidedById: c.userId, decidedAt: new Date() }).where(eq(leaveRequests.id, id)).returning();
    const type = await this.db.query.leaveTypes.findFirst({ where: eq(leaveTypes.id, r.leaveTypeId) });
    await this.notify.send(c.companyId, await this.access.userIdsForEmployees(c.companyId, [r.employeeId]),
      { type: 'leave.decided', title: `Leave ${status === 'APPROVED' ? 'approved' : 'rejected'}`, body: `${type?.name}: ${r.fromDate} → ${r.toDate}`, link: '/me/leave' });
    return u;
  }

  async cancel(c: Ctx, id: string) {
    const r = must(await this.db.query.leaveRequests.findFirst({ where: and(eq(leaveRequests.id, id), eq(leaveRequests.companyId, c.companyId)) }), 'Leave request');
    const own = r.employeeId === c.employeeId;
    if (!isAdmin(c) && !(own && (r.status === 'PENDING' || (r.status === 'APPROVED' && r.fromDate > todayIn())))) deny('You can only cancel your own pending or upcoming leave');
    const [u] = await this.db.update(leaveRequests).set({ status: 'CANCELLED' }).where(eq(leaveRequests.id, id)).returning();
    return u;
  }
}

@Controller('leave')
@RequireModule('leave')
export class LeaveController {
  constructor(private s: LeaveService, private access: AccessService) {}
  @Get('requests') list(@CurrentCtx() c: Ctx, @Query() q: any) { return this.s.list(c, q); }
  @Post('requests') create(@CurrentCtx() c: Ctx, @Body() b: unknown) { return this.s.create(c, b); }
  @Patch('requests/:id/decision') decide(@CurrentCtx() c: Ctx, @Param('id') id: string, @Body() b: unknown) { return this.s.decide(c, id, b); }
  @Post('requests/:id/cancel') cancel(@CurrentCtx() c: Ctx, @Param('id') id: string) { return this.s.cancel(c, id); }
  @Get('balances') balances(@CurrentCtx() c: Ctx, @Query('year') y?: string, @Query('employeeId') e?: string) { return this.s.balances(c, y || todayIn().slice(0, 4), e); }
  @Get('my-balances') mine(@CurrentCtx() c: Ctx, @Query('year') y?: string) { return this.s.balances(c, y || todayIn().slice(0, 4), this.access.self(c)); }
}

@Module({ controllers: [LeaveController], providers: [LeaveService], exports: [LeaveService] })
export class LeaveModule {}
