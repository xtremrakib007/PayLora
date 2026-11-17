import { Controller, Get, Injectable, Module } from '@nestjs/common';
import { and, asc, count, desc, eq, gte, inArray, isNull, lte, ne, or, sql } from 'drizzle-orm';
import { Ctx, CurrentCtx, isAdmin } from '../../common/context';
import { AccessService } from '../../common/core';
import { todayIn } from '../../common/dates';
import { ids } from '../../common/util';
import { DB, InjectDb } from '../../db/db';
import {
  attendance, claims, employees, leaveRequests, leaveTypes, meetingAttendees, meetings, notifications, payrollRuns, payslips, posts, shifts, shiftTemplates, tasks,
  timesheets, users,
} from '../../db/schema';

/** One call that powers the web dashboard and the mobile home screen. */
@Injectable()
export class HomeService {
  constructor(@InjectDb() private db: DB, private access: AccessService) {}

  async get(c: Ctx) {
    const has = (m: string) => c.modules.includes(m);
    const today = todayIn(), emp = c.employeeId;
    const out: Record<string, unknown> = { today, modules: c.modules, role: c.role };

    const [{ n: unread }] = await this.db.select({ n: count() }).from(notifications).where(and(eq(notifications.userId, c.userId), eq(notifications.companyId, c.companyId), isNull(notifications.readAt)));
    out.unreadNotifications = unread;

    if (emp) {
      out.employee = await this.db.query.employees.findFirst({ where: eq(employees.id, emp), columns: { id: true, name: true, code: true, designation: true } });
      if (has('attendance')) out.attendanceToday = (await this.db.query.attendance.findFirst({ where: and(eq(attendance.employeeId, emp), eq(attendance.date, today)) })) ?? null;
      if (has('shifts')) {
        const [s] = await this.db.select({ name: shiftTemplates.name, start: shiftTemplates.startTime, end: shiftTemplates.endTime, color: shiftTemplates.color }).from(shifts)
          .innerJoin(shiftTemplates, eq(shiftTemplates.id, shifts.templateId)).where(and(eq(shifts.employeeId, emp), eq(shifts.date, today)));
        out.shiftToday = s ?? null;
      }
      if (has('tasks')) {
        out.myTasks = await this.db.select().from(tasks).where(and(eq(tasks.companyId, c.companyId), eq(tasks.assigneeId, emp), ne(tasks.status, 'DONE')))
          .orderBy(sql`${tasks.dueDate} asc nulls last`).limit(5);
      }
      if (has('leave')) {
        out.myLeave = await this.db.select({ id: leaveRequests.id, type: leaveTypes.name, fromDate: leaveRequests.fromDate, toDate: leaveRequests.toDate, days: leaveRequests.days, status: leaveRequests.status })
          .from(leaveRequests).innerJoin(leaveTypes, eq(leaveTypes.id, leaveRequests.leaveTypeId))
          .where(and(eq(leaveRequests.employeeId, emp), or(eq(leaveRequests.status, 'PENDING'), and(eq(leaveRequests.status, 'APPROVED'), gte(leaveRequests.toDate, today))))).orderBy(asc(leaveRequests.fromDate)).limit(5);
      }
      if (has('payroll')) {
        const [p] = await this.db.select({ id: payslips.id, period: payrollRuns.period, net: payslips.net }).from(payslips).innerJoin(payrollRuns, eq(payrollRuns.id, payslips.runId))
          .where(and(eq(payslips.employeeId, emp), inArray(payrollRuns.status, ['FINALIZED', 'PAID']))).orderBy(desc(payrollRuns.period)).limit(1);
        out.latestPayslip = p ?? null;
      }
    }

    if (has('meetings')) {
      const mine = (await this.db.select({ id: meetingAttendees.meetingId }).from(meetingAttendees).where(and(eq(meetingAttendees.userId, c.userId), ne(meetingAttendees.response, 'DECLINED')))).map((r) => r.id);
      out.upcomingMeetings = await this.db.select({ id: meetings.id, title: meetings.title, startAt: meetings.startAt, endAt: meetings.endAt, location: meetings.location, onlineUrl: meetings.onlineUrl })
        .from(meetings).where(and(eq(meetings.companyId, c.companyId), gte(meetings.endAt, new Date()), lte(meetings.startAt, new Date(Date.now() + 14 * 86400000)), or(eq(meetings.organizerId, c.userId), inArray(meetings.id, ids(mine)))))
        .orderBy(asc(meetings.startAt)).limit(5);
    }
    if (has('feed')) {
      out.announcements = await this.db.select({ id: posts.id, content: posts.content, createdAt: posts.createdAt, authorName: users.name }).from(posts).innerJoin(users, eq(users.id, posts.authorId))
        .where(and(eq(posts.companyId, c.companyId), or(eq(posts.announcement, true), eq(posts.pinned, true)))).orderBy(desc(posts.createdAt)).limit(3);
    }

    if (isAdmin(c) || c.role === 'MANAGER') {
      const vis = await this.access.visibleEmployeeIds(c);
      const scope = <T>(col: T) => (vis ? inArray(col as any, ids(vis.filter((v) => v !== emp))) : undefined);
      const [[head], [lv], [cl], [ts], present, onLeave] = await Promise.all([
        this.db.select({ n: count() }).from(employees).where(and(eq(employees.companyId, c.companyId), eq(employees.status, 'ACTIVE'), vis ? inArray(employees.id, ids(vis)) : undefined)),
        has('leave') ? this.db.select({ n: count() }).from(leaveRequests).where(and(eq(leaveRequests.companyId, c.companyId), eq(leaveRequests.status, 'PENDING'), scope(leaveRequests.employeeId))) : [{ n: 0 }],
        has('claims') ? this.db.select({ n: count() }).from(claims).where(and(eq(claims.companyId, c.companyId), eq(claims.status, 'PENDING'), scope(claims.employeeId))) : [{ n: 0 }],
        has('timesheets') ? this.db.select({ n: count() }).from(timesheets).where(and(eq(timesheets.companyId, c.companyId), eq(timesheets.status, 'PENDING'), scope(timesheets.employeeId))) : [{ n: 0 }],
        has('attendance') ? this.db.select({ status: attendance.status, n: count() }).from(attendance).where(and(eq(attendance.companyId, c.companyId), eq(attendance.date, today), vis ? inArray(attendance.employeeId, ids(vis)) : undefined)).groupBy(attendance.status) : [],
        has('leave') ? this.db.select({ name: employees.name, type: leaveTypes.name }).from(leaveRequests).innerJoin(employees, eq(employees.id, leaveRequests.employeeId)).innerJoin(leaveTypes, eq(leaveTypes.id, leaveRequests.leaveTypeId))
          .where(and(eq(leaveRequests.companyId, c.companyId), eq(leaveRequests.status, 'APPROVED'), lte(leaveRequests.fromDate, today), gte(leaveRequests.toDate, today), vis ? inArray(leaveRequests.employeeId, ids(vis)) : undefined)) : [],
      ]);
      out.team = {
        headcount: head.n, pending: { leave: lv.n, claims: cl.n, timesheets: ts.n },
        attendanceToday: Object.fromEntries((present as { status: string | null; n: number }[]).map((p) => [p.status ?? 'UNMARKED', p.n])), onLeaveToday: onLeave,
      };
      if (isAdmin(c) && has('payroll')) {
        const period = today.slice(0, 7);
        const [run] = await this.db.select({ status: payrollRuns.status, net: sql<number>`sum(${payslips.net})`.mapWith(Number), cost: sql<number>`sum(${payslips.employerCost})`.mapWith(Number) })
          .from(payrollRuns).leftJoin(payslips, eq(payslips.runId, payrollRuns.id)).where(and(eq(payrollRuns.companyId, c.companyId), eq(payrollRuns.period, period))).groupBy(payrollRuns.id);
        out.payrollThisMonth = { period, ...(run ?? { status: null, net: null, cost: null }) };
      }
    }
    return out;
  }
}

@Controller('home')
export class HomeController {
  constructor(private s: HomeService) {}
  @Get() get(@CurrentCtx() c: Ctx) { return this.s.get(c); }
}

@Module({ controllers: [HomeController], providers: [HomeService] })
export class HomeModule {}
