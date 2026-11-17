import { BadRequestException, Body, Controller, Get, Injectable, Module, Post, Put, Query } from '@nestjs/common';
import { and, asc, between, eq, gte, inArray, lte } from 'drizzle-orm';
import { z } from 'zod';
import { Ctx, CurrentCtx, RequireModule, Roles } from '../../common/context';
import { AccessService } from '../../common/core';
import { distanceMeters, earlyMinutes, lateMinutes, monthEnd, monthStart, roundUpMinutes, timeIn, todayIn, workDays } from '../../common/dates';
import { r2 } from '../../common/util';
import { parse, zDate, zPeriod } from '../../common/validate';
import { DB, InjectDb } from '../../db/db';
import { attendance, employees, leaveRequests, leaveTypes, shifts, shiftTemplates } from '../../db/schema';

const MarkDto = z.object({
  date: zDate,
  entries: z.array(z.object({
    employeeId: z.uuid(), status: z.enum(['PRESENT', 'ABSENT', 'HALF_DAY', 'LEAVE']).nullable(), otHours: z.coerce.number().min(0).max(24).optional(),
    lateMinutes: z.coerce.number().int().min(0).max(1440).optional(), lateWaived: z.boolean().optional(),
    earlyMinutes: z.coerce.number().int().min(0).max(1440).optional(), earlyWaived: z.boolean().optional(),
  })).max(2000),
});
const ClockDto = z.object({ action: z.enum(['in', 'out']), lat: z.number().min(-90).max(90).optional(), lng: z.number().min(-180).max(180).optional(), accuracy: z.number().min(0).optional() });

/** lateMinutes / earlyMinutes = minutes counted for pay (after grace, rounding and waivers). */
export type AttSummary = { present: number; absent: number; half: number; leave: number; late: number; lateMinutes: number; early: number; earlyMinutes: number; otHours: number; unpaidLeaveDays: number; unpaidDays: number };
const EMPTY: AttSummary = { present: 0, absent: 0, half: 0, leave: 0, late: 0, lateMinutes: 0, early: 0, earlyMinutes: 0, otHours: 0, unpaidLeaveDays: 0, unpaidDays: 0 };

@Injectable()
export class AttendanceService {
  constructor(@InjectDb() private db: DB, private access: AccessService) {}

  /** Per-employee monthly totals. Unpaid days = absent + ½ half-days + approved unpaid leave (working days in the month). */
  async summary(companyId: string, period: string, empIds?: string[] | null): Promise<Map<string, AttSummary>> {
    const from = monthStart(period), to = monthEnd(period);
    const co = await this.access.company(companyId);
    const hol = await this.access.holidaySet(companyId);
    const rows = await this.db.select().from(attendance).where(and(eq(attendance.companyId, companyId), between(attendance.date, from, to), empIds ? inArray(attendance.employeeId, empIds.length ? empIds : ['00000000-0000-0000-0000-000000000000']) : undefined));
    const lv = await this.db.select({ employeeId: leaveRequests.employeeId, fromDate: leaveRequests.fromDate, toDate: leaveRequests.toDate })
      .from(leaveRequests).innerJoin(leaveTypes, eq(leaveTypes.id, leaveRequests.leaveTypeId))
      .where(and(eq(leaveRequests.companyId, companyId), eq(leaveRequests.status, 'APPROVED'), eq(leaveTypes.paid, false), lte(leaveRequests.fromDate, to), gte(leaveRequests.toDate, from)));
    const out = new Map<string, AttSummary>();
    const get = (id: string) => { if (!out.has(id)) out.set(id, { ...EMPTY }); return out.get(id)!; };
    for (const r of rows) {
      const s = get(r.employeeId);
      if (r.status === 'PRESENT') s.present++; else if (r.status === 'ABSENT') s.absent++; else if (r.status === 'HALF_DAY') s.half++; else if (r.status === 'LEAVE') s.leave++;
      if (r.late || r.lateMinutes > 0) s.late++;
      if (r.lateMinutes > 0 && !r.lateWaived && (r.status === 'PRESENT' || r.status === 'HALF_DAY')) s.lateMinutes += roundUpMinutes(r.lateMinutes, co.lateRoundMinutes);
      if (r.earlyMinutes > 0) s.early++;
      if (r.earlyMinutes > 0 && !r.earlyWaived && (r.status === 'PRESENT' || r.status === 'HALF_DAY')) s.earlyMinutes += roundUpMinutes(r.earlyMinutes, co.lateRoundMinutes);
      s.otHours += Number(r.otHours) || 0;
    }
    for (const l of lv) get(l.employeeId).unpaidLeaveDays += workDays(l.fromDate, l.toDate, co.restDays, hol, period);
    for (const s of out.values()) { s.otHours = r2(s.otHours); s.unpaidDays = r2(s.absent + s.half * 0.5 + s.unpaidLeaveDays); }
    return out;
  }

  async day(c: Ctx, date: string) {
    const vis = await this.access.visibleEmployeeIds(c);
    const emps = await this.db.select({ id: employees.id, name: employees.name, code: employees.code, designation: employees.designation })
      .from(employees).where(and(eq(employees.companyId, c.companyId), eq(employees.status, 'ACTIVE'), vis ? inArray(employees.id, vis.length ? vis : ['00000000-0000-0000-0000-000000000000']) : undefined)).orderBy(asc(employees.name));
    const ids = emps.map((e) => e.id);
    if (!ids.length) return { date, rows: [] };
    const [att, lv, sh] = await Promise.all([
      this.db.select().from(attendance).where(and(eq(attendance.companyId, c.companyId), eq(attendance.date, date), inArray(attendance.employeeId, ids))),
      this.db.select({ employeeId: leaveRequests.employeeId, type: leaveTypes.name }).from(leaveRequests).innerJoin(leaveTypes, eq(leaveTypes.id, leaveRequests.leaveTypeId))
        .where(and(eq(leaveRequests.companyId, c.companyId), eq(leaveRequests.status, 'APPROVED'), lte(leaveRequests.fromDate, date), gte(leaveRequests.toDate, date))),
      this.db.select({ employeeId: shifts.employeeId, name: shiftTemplates.name, start: shiftTemplates.startTime, end: shiftTemplates.endTime, color: shiftTemplates.color })
        .from(shifts).innerJoin(shiftTemplates, eq(shiftTemplates.id, shifts.templateId)).where(and(eq(shifts.companyId, c.companyId), eq(shifts.date, date))),
    ]);
    const a = new Map(att.map((r) => [r.employeeId, r])), l = new Map(lv.map((r) => [r.employeeId, r.type])), s = new Map(sh.map((r) => [r.employeeId, r]));
    return { date, rows: emps.map((e) => ({ employee: e, record: a.get(e.id) ?? null, leave: l.get(e.id) ?? null, shift: s.get(e.id) ?? null })) };
  }

  async mark(c: Ctx, body: unknown) {
    const d = parse(MarkDto, body);
    const vis = await this.access.visibleEmployeeIds(c);
    const allowed = d.entries.filter((e) => !vis || vis.includes(e.employeeId));
    const own = await this.db.select({ id: employees.id }).from(employees).where(and(eq(employees.companyId, c.companyId), inArray(employees.id, allowed.map((e) => e.employeeId).concat('00000000-0000-0000-0000-000000000000'))));
    const ok = new Set(own.map((o) => o.id));
    for (const e of allowed.filter((x) => ok.has(x.employeeId))) {
      const set: Record<string, unknown> = { status: e.status };
      if (e.otHours !== undefined) set.otHours = e.otHours;
      if (e.lateMinutes !== undefined) { set.lateMinutes = e.lateMinutes; set.late = e.lateMinutes > 0; }
      if (e.lateWaived !== undefined) set.lateWaived = e.lateWaived;
      if (e.earlyMinutes !== undefined) set.earlyMinutes = e.earlyMinutes;
      if (e.earlyWaived !== undefined) set.earlyWaived = e.earlyWaived;
      await this.db.insert(attendance).values({
        companyId: c.companyId, employeeId: e.employeeId, date: d.date, status: e.status, otHours: e.otHours ?? 0,
        lateMinutes: e.lateMinutes ?? 0, late: (e.lateMinutes ?? 0) > 0, lateWaived: e.lateWaived ?? false,
        earlyMinutes: e.earlyMinutes ?? 0, earlyWaived: e.earlyWaived ?? false,
      })
        .onConflictDoUpdate({ target: [attendance.employeeId, attendance.date], set });
    }
    return { updated: ok.size };
  }

  async monthly(c: Ctx, period: string) {
    const vis = await this.access.visibleEmployeeIds(c);
    const emps = await this.db.select({ id: employees.id, name: employees.name, code: employees.code }).from(employees)
      .where(and(eq(employees.companyId, c.companyId), eq(employees.status, 'ACTIVE'), vis ? inArray(employees.id, vis.length ? vis : ['00000000-0000-0000-0000-000000000000']) : undefined)).orderBy(asc(employees.name));
    const sum = await this.summary(c.companyId, period, emps.map((e) => e.id));
    return emps.map((e) => ({ employee: e, ...(sum.get(e.id) ?? EMPTY) }));
  }

  /** Staff self clock-in / clock-out with optional GPS geofence. */
  async clock(c: Ctx, body: unknown) {
    const d = parse(ClockDto, body);
    const empId = this.access.self(c);
    const co = await this.access.company(c.companyId);
    const date = todayIn();
    let loc: { lat: number; lng: number; accuracy?: number; distance?: number } | null = null;
    if (d.lat !== undefined && d.lng !== undefined) loc = { lat: d.lat, lng: d.lng, accuracy: d.accuracy };
    if (co.geofenceMeters > 0 && co.officeLat != null && co.officeLng != null) {
      if (!loc) throw new BadRequestException('Location is required to clock in at this company. Allow location access and try again.');
      loc.distance = Math.round(distanceMeters(loc, { lat: co.officeLat, lng: co.officeLng }));
      if (loc.distance > co.geofenceMeters + Math.min(loc.accuracy ?? 0, 100)) {
        throw new BadRequestException(`You are ${loc.distance} m from the office. Clock-in is allowed within ${co.geofenceMeters} m.`);
      }
    }
    const existing = await this.db.query.attendance.findFirst({ where: and(eq(attendance.employeeId, empId), eq(attendance.date, date)) });
    const now = new Date();
    if (d.action === 'in') {
      if (existing?.clockIn) throw new BadRequestException('You already clocked in today');
      // Late against today's shift start if rostered, otherwise the company's work start time
      const [shift] = await this.db.select({ start: shiftTemplates.startTime }).from(shifts).innerJoin(shiftTemplates, eq(shiftTemplates.id, shifts.templateId))
        .where(and(eq(shifts.employeeId, empId), eq(shifts.date, date)));
      const mins = lateMinutes(timeIn(), shift?.start ?? co.workStart, co.lateGraceMinutes);
      const set = { status: 'PRESENT' as const, clockIn: now, clockInLoc: loc, late: mins > 0, lateMinutes: mins, lateWaived: false };
      const [r] = await this.db.insert(attendance).values({ companyId: c.companyId, employeeId: empId, date, ...set })
        .onConflictDoUpdate({ target: [attendance.employeeId, attendance.date], set }).returning();
      return r;
    }
    if (!existing?.clockIn) throw new BadRequestException('Clock in first');
    if (existing.clockOut) throw new BadRequestException('You already clocked out today');
    // Early leave against today's shift end if rostered, otherwise the company's work end time
    const [shiftOut] = await this.db.select({ end: shiftTemplates.endTime }).from(shifts).innerJoin(shiftTemplates, eq(shiftTemplates.id, shifts.templateId))
      .where(and(eq(shifts.employeeId, empId), eq(shifts.date, date)));
    const early = existing.status === 'HALF_DAY' ? 0 : earlyMinutes(timeIn(), shiftOut?.end ?? co.workEnd, co.lateGraceMinutes);
    const [r] = await this.db.update(attendance).set({ clockOut: now, clockOutLoc: loc, earlyMinutes: early, earlyWaived: false }).where(eq(attendance.id, existing.id)).returning();
    return r;
  }

  async mine(c: Ctx, period: string) {
    const empId = this.access.self(c);
    const rows = await this.db.select().from(attendance).where(and(eq(attendance.employeeId, empId), between(attendance.date, monthStart(period), monthEnd(period)))).orderBy(asc(attendance.date));
    const today = await this.db.query.attendance.findFirst({ where: and(eq(attendance.employeeId, empId), eq(attendance.date, todayIn())) });
    const summary = (await this.summary(c.companyId, period, [empId])).get(empId) ?? null;
    return { today: today ?? null, records: rows, summary };
  }
}

@Controller('attendance')
@RequireModule('attendance')
export class AttendanceController {
  constructor(private s: AttendanceService) {}
  @Roles('OWNER', 'HR', 'MANAGER') @Get() day(@CurrentCtx() c: Ctx, @Query('date') date?: string) { return this.s.day(c, parse(zDate, date || todayIn())); }
  @Roles('OWNER', 'HR', 'MANAGER') @Put() mark(@CurrentCtx() c: Ctx, @Body() b: unknown) { return this.s.mark(c, b); }
  @Roles('OWNER', 'HR', 'MANAGER') @Get('summary') summary(@CurrentCtx() c: Ctx, @Query('period') p?: string) { return this.s.monthly(c, parse(zPeriod, p || todayIn().slice(0, 7))); }
}

@Controller('me/attendance')
@RequireModule('attendance')
export class MyAttendanceController {
  constructor(private s: AttendanceService) {}
  @Get() mine(@CurrentCtx() c: Ctx, @Query('period') p?: string) { return this.s.mine(c, parse(zPeriod, p || todayIn().slice(0, 7))); }
  @Post('clock') clock(@CurrentCtx() c: Ctx, @Body() b: unknown) { return this.s.clock(c, b); }
}

@Module({ controllers: [AttendanceController, MyAttendanceController], providers: [AttendanceService], exports: [AttendanceService] })
export class AttendanceModule {}
