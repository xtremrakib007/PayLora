import { Controller, Get, Injectable, Module } from '@nestjs/common';
import { and, asc, count, desc, eq, gte, inArray, isNull, lt, lte, ne, or, sql } from 'drizzle-orm';
import { Ctx, CurrentCtx, isAdmin } from '../../common/context';
import { AccessService } from '../../common/core';
import { addDays, todayIn } from '../../common/dates';
import { ids } from '../../common/util';
import { DB, InjectDb } from '../../db/db';
import {
  applications, attendance, claims, employees, onboardings, onboardingTasks, serviceRequests, subscriptions, leaveRequests, leaveTypes, meetingAttendees, meetings, notifications, payrollRuns, payslips, posts, shifts, shiftTemplates, tasks,
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
      Object.assign(out.team as object, await this.teamBoard(c, vis, emp, has));
      if (isAdmin(c)) out.hr = await this.hrPanel(c, has);
      if (c.role === 'OWNER') out.owner = await this.ownerPanel(c, has);
      if (isAdmin(c) && has('payroll')) {
        const period = today.slice(0, 7);
        const [run] = await this.db.select({ status: payrollRuns.status, net: sql<number>`sum(${payslips.net})`.mapWith(Number), cost: sql<number>`sum(${payslips.employerCost})`.mapWith(Number) })
          .from(payrollRuns).leftJoin(payslips, eq(payslips.runId, payrollRuns.id)).where(and(eq(payrollRuns.companyId, c.companyId), eq(payrollRuns.period, period))).groupBy(payrollRuns.id);
        out.payrollThisMonth = { period, ...(run ?? { status: null, net: null, cost: null }) };
      }
    }
    return out;
  }

  /** Manager/HR: who is in today, approvals waiting, overdue tasks. */
  private async teamBoard(c: Ctx, vis: string[] | null, emp: string | null, has: (m: string) => boolean) {
    const today = todayIn();
    const team = await this.db.select({ id: employees.id, name: employees.name, designation: employees.designation }).from(employees)
      .where(and(eq(employees.companyId, c.companyId), eq(employees.status, 'ACTIVE'), vis ? inArray(employees.id, ids(vis.filter((v) => v !== emp))) : undefined))
      .orderBy(asc(employees.name)).limit(300);
    const tid = ids(team.map((t) => t.id));
    const [att, lv, sh] = await Promise.all([
      has('attendance') ? this.db.select().from(attendance).where(and(eq(attendance.companyId, c.companyId), eq(attendance.date, today), inArray(attendance.employeeId, tid))) : [],
      has('leave') ? this.db.select({ employeeId: leaveRequests.employeeId, type: leaveTypes.name }).from(leaveRequests).innerJoin(leaveTypes, eq(leaveTypes.id, leaveRequests.leaveTypeId))
        .where(and(eq(leaveRequests.companyId, c.companyId), eq(leaveRequests.status, 'APPROVED'), lte(leaveRequests.fromDate, today), gte(leaveRequests.toDate, today), inArray(leaveRequests.employeeId, tid))) : [],
      has('shifts') ? this.db.select({ employeeId: shifts.employeeId, name: shiftTemplates.name, start: shiftTemplates.startTime, end: shiftTemplates.endTime }).from(shifts)
        .innerJoin(shiftTemplates, eq(shiftTemplates.id, shifts.templateId)).where(and(eq(shifts.companyId, c.companyId), eq(shifts.date, today), inArray(shifts.employeeId, tid))) : [],
    ]);
    const A = new Map(att.map((r) => [r.employeeId, r])), L = new Map(lv.map((r) => [r.employeeId, r.type])), S = new Map(sh.map((r) => [r.employeeId, r]));
    const roster = team.map((t) => {
      const a = A.get(t.id), leave = L.get(t.id), shift = S.get(t.id) ?? null;
      const state = leave || a?.status === 'LEAVE' ? 'ON_LEAVE' : a?.status === 'ABSENT' ? 'ABSENT' : a?.clockOut ? 'OUT'
        : a?.clockIn ? (a.lateMinutes > 0 ? 'LATE' : 'IN') : a?.status === 'PRESENT' || a?.status === 'HALF_DAY' ? 'IN' : 'NOT_IN';
      return { ...t, state, leave: leave ?? null, shift, clockIn: a?.clockIn ?? null, clockOut: a?.clockOut ?? null, lateMinutes: a?.lateMinutes ?? 0, photoId: a?.clockInPhotoId ?? null };
    });
    const others = ids(team.map((t) => t.id));
    const [leaveQ, claimQ, [{ n: overdue }]] = await Promise.all([
      has('leave') ? this.db.select({ id: leaveRequests.id, employeeId: leaveRequests.employeeId, name: employees.name, type: leaveTypes.name, fromDate: leaveRequests.fromDate, toDate: leaveRequests.toDate, days: leaveRequests.days, reason: leaveRequests.reason })
        .from(leaveRequests).innerJoin(employees, eq(employees.id, leaveRequests.employeeId)).innerJoin(leaveTypes, eq(leaveTypes.id, leaveRequests.leaveTypeId))
        .where(and(eq(leaveRequests.companyId, c.companyId), eq(leaveRequests.status, 'PENDING'), inArray(leaveRequests.employeeId, others))).orderBy(asc(leaveRequests.fromDate)).limit(8) : [],
      has('claims') ? this.db.select({ id: claims.id, employeeId: claims.employeeId, name: employees.name, category: claims.category, amount: claims.amount, date: claims.date, description: claims.description })
        .from(claims).innerJoin(employees, eq(employees.id, claims.employeeId))
        .where(and(eq(claims.companyId, c.companyId), eq(claims.status, 'PENDING'), inArray(claims.employeeId, others))).orderBy(asc(claims.date)).limit(8) : [],
      has('tasks') ? this.db.select({ n: count() }).from(tasks).where(and(eq(tasks.companyId, c.companyId), ne(tasks.status, 'DONE'), lt(tasks.dueDate, today), inArray(tasks.assigneeId, others))) : [{ n: 0 }],
    ]);
    const tally = (st: string) => roster.filter((r) => r.state === st).length;
    return {
      roster, counts: { in: tally('IN') + tally('LATE') + tally('OUT'), late: tally('LATE'), onLeave: tally('ON_LEAVE'), absent: tally('ABSENT'), notIn: tally('NOT_IN'), total: roster.length },
      approvals: { leave: leaveQ, claims: claimQ }, overdueTasks: overdue,
    };
  }

  /** HR: people events and queues. */
  private async hrPanel(c: Ctx, has: (m: string) => boolean) {
    const today = todayIn(), in14 = addDays(today, 14), in30 = addDays(today, 30);
    const people = await this.db.select({ id: employees.id, name: employees.name, dob: employees.dob, joinDate: employees.joinDate, exitDate: employees.exitDate, status: employees.status, designation: employees.designation })
      .from(employees).where(eq(employees.companyId, c.companyId));
    const active = people.filter((p) => p.status === 'ACTIVE' || p.status === 'ON_NOTICE');
    // Next occurrence of a month-day within the window (handles year wrap)
    const next = (md: string) => { const y = Number(today.slice(0, 4)); const d1 = `${y}-${md}`, d2 = `${y + 1}-${md}`; return d1 >= today ? d1 : d2; };
    const birthdays = active.filter((p) => p.dob).map((p) => ({ id: p.id, name: p.name, date: next(p.dob!.slice(5)) })).filter((b) => b.date <= in14).sort((a, b) => a.date.localeCompare(b.date));
    const anniversaries = active.filter((p) => p.joinDate.slice(0, 4) < today.slice(0, 4)).map((p) => { const date = next(p.joinDate.slice(5)); return { id: p.id, name: p.name, date, years: Number(date.slice(0, 4)) - Number(p.joinDate.slice(0, 4)) }; })
      .filter((a) => a.date <= in14 && a.years > 0).sort((a, b) => a.date.localeCompare(b.date));
    const joiners = people.filter((p) => p.joinDate >= today.slice(0, 7) + '-01' && p.joinDate <= in30).map(({ id, name, joinDate, designation }) => ({ id, name, joinDate, designation }));
    const leavers = people.filter((p) => p.exitDate && p.exitDate >= today && p.exitDate <= in30).map(({ id, name, exitDate, designation }) => ({ id, name, exitDate, designation }));
    const [svc, apps, obs] = await Promise.all([
      has('services') ? this.db.select({ n: count() }).from(serviceRequests).where(and(eq(serviceRequests.companyId, c.companyId), inArray(serviceRequests.status, ['OPEN', 'IN_PROGRESS']))) : [{ n: 0 }],
      has('recruitment') ? this.db.select({ n: count() }).from(applications).where(and(eq(applications.companyId, c.companyId), eq(applications.stage, 'APPLIED'))) : [{ n: 0 }],
      has('onboarding') ? this.db.select({ n: sql<number>`count(distinct ${onboardingTasks.onboardingId})`.mapWith(Number) }).from(onboardingTasks)
        .innerJoin(onboardings, eq(onboardings.id, onboardingTasks.onboardingId)).where(and(eq(onboardings.companyId, c.companyId), eq(onboardingTasks.done, false))) : [{ n: 0 }],
    ]);
    return { birthdays, anniversaries, joiners, leavers, openServiceRequests: svc[0].n, newApplicants: apps[0].n, onboardingInProgress: obs[0].n };
  }

  /** Owner: business view — plan usage and payroll cost trend. */
  private async ownerPanel(c: Ctx, has: (m: string) => boolean) {
    const year = todayIn().slice(0, 4);
    const [sub, [{ n: activeEmployees, basic }], [{ j }], [{ l }], trend] = await Promise.all([
      this.db.query.subscriptions.findFirst({ where: eq(subscriptions.companyId, c.companyId) }),
      this.db.select({ n: count(), basic: sql<number>`coalesce(sum(${employees.basicSalary}),0)`.mapWith(Number) }).from(employees).where(and(eq(employees.companyId, c.companyId), eq(employees.status, 'ACTIVE'))),
      this.db.select({ j: count() }).from(employees).where(and(eq(employees.companyId, c.companyId), gte(employees.joinDate, `${year}-01-01`))),
      this.db.select({ l: count() }).from(employees).where(and(eq(employees.companyId, c.companyId), gte(employees.exitDate, `${year}-01-01`), inArray(employees.status, ['RESIGNED', 'TERMINATED']))),
      has('payroll') ? this.db.select({ period: payrollRuns.period, status: payrollRuns.status, net: sql<number>`sum(${payslips.net})`.mapWith(Number), cost: sql<number>`sum(${payslips.employerCost})`.mapWith(Number), staff: count(payslips.id) })
        .from(payrollRuns).innerJoin(payslips, eq(payslips.runId, payrollRuns.id)).where(eq(payrollRuns.companyId, c.companyId)).groupBy(payrollRuns.id).orderBy(desc(payrollRuns.period)).limit(6) : [],
    ]);
    return {
      plan: { code: c.plan.code, maxEmployees: c.plan.maxEmployees, periodEnd: sub?.currentPeriodEnd ?? null }, activeEmployees, monthlyBasic: basic,
      joinersYtd: j, leaversYtd: l, payrollTrend: [...trend].reverse(),
    };
  }
}

@Controller('home')
export class HomeController {
  constructor(private s: HomeService) {}
  @Get() get(@CurrentCtx() c: Ctx) { return this.s.get(c); }
}

@Module({ controllers: [HomeController], providers: [HomeService] })
export class HomeModule {}
