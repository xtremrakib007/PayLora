import { Controller, Get, Injectable, Module, Query, StreamableFile } from '@nestjs/common';
import { and, asc, between, count, eq, inArray, like, sql } from 'drizzle-orm';
import { Ctx, CurrentCtx, RequireModule, Roles } from '../../common/context';
import { monthEnd, monthStart, todayIn } from '../../common/dates';
import { r2 } from '../../common/util';
import { DB, InjectDb } from '../../db/db';
import { attendance, claims, departments, employees, leaveRequests, leaveTypes, payrollRuns, payslips } from '../../db/schema';

@Injectable()
export class ReportsService {
  constructor(@InjectDb() private db: DB) {}

  async overview(c: Ctx, year: string) {
    const cid = c.companyId, period = todayIn().slice(0, 7);
    const [byDept, byType, joiners, leavers, payroll, leave, claimsByCat, att, headcount] = await Promise.all([
      this.db.select({ name: sql<string>`coalesce(${departments.name}, 'Unassigned')`, n: count() }).from(employees).leftJoin(departments, eq(departments.id, employees.departmentId))
        .where(and(eq(employees.companyId, cid), eq(employees.status, 'ACTIVE'))).groupBy(departments.name).orderBy(sql`2 desc`),
      this.db.select({ type: employees.type, n: count() }).from(employees).where(and(eq(employees.companyId, cid), eq(employees.status, 'ACTIVE'))).groupBy(employees.type),
      this.db.select({ n: count() }).from(employees).where(and(eq(employees.companyId, cid), between(employees.joinDate, `${year}-01-01`, `${year}-12-31`))),
      this.db.select({ n: count() }).from(employees).where(and(eq(employees.companyId, cid), between(employees.exitDate, `${year}-01-01`, `${year}-12-31`), inArray(employees.status, ['RESIGNED', 'TERMINATED']))),
      this.db.select({ period: payrollRuns.period, status: payrollRuns.status, gross: sql<number>`sum(${payslips.gross})`.mapWith(Number), net: sql<number>`sum(${payslips.net})`.mapWith(Number), cost: sql<number>`sum(${payslips.employerCost})`.mapWith(Number), staff: count(payslips.id) })
        .from(payrollRuns).innerJoin(payslips, eq(payslips.runId, payrollRuns.id)).where(and(eq(payrollRuns.companyId, cid), like(payrollRuns.period, `${year}-%`))).groupBy(payrollRuns.id).orderBy(asc(payrollRuns.period)),
      this.db.select({ type: leaveTypes.name, days: sql<number>`sum(${leaveRequests.days})`.mapWith(Number), requests: count() }).from(leaveRequests).innerJoin(leaveTypes, eq(leaveTypes.id, leaveRequests.leaveTypeId))
        .where(and(eq(leaveRequests.companyId, cid), eq(leaveRequests.status, 'APPROVED'), between(leaveRequests.fromDate, `${year}-01-01`, `${year}-12-31`))).groupBy(leaveTypes.name).orderBy(sql`2 desc`),
      this.db.select({ category: claims.category, amount: sql<number>`sum(${claims.amount})`.mapWith(Number), n: count() }).from(claims)
        .where(and(eq(claims.companyId, cid), inArray(claims.status, ['APPROVED', 'PAID']), between(claims.date, `${year}-01-01`, `${year}-12-31`))).groupBy(claims.category).orderBy(sql`2 desc`),
      this.db.select({ status: attendance.status, n: count(), late: sql<number>`count(*) filter (where ${attendance.late})`.mapWith(Number) }).from(attendance)
        .where(and(eq(attendance.companyId, cid), between(attendance.date, monthStart(period), monthEnd(period)))).groupBy(attendance.status),
      this.db.select({ n: count() }).from(employees).where(and(eq(employees.companyId, cid), eq(employees.status, 'ACTIVE'))),
    ]);
    const marked = att.reduce((s, a) => s + (a.status ? a.n : 0), 0);
    const present = att.filter((a) => a.status === 'PRESENT' || a.status === 'HALF_DAY').reduce((s, a) => s + a.n, 0);
    const avgHead = headcount[0].n || 1;
    return {
      year, headcount: headcount[0].n, byDepartment: byDept, byType, joiners: joiners[0].n, leavers: leavers[0].n,
      turnoverRate: r2((leavers[0].n / avgHead) * 100),
      payroll: payroll.map((p) => ({ ...p, gross: r2(p.gross), net: r2(p.net), cost: r2(p.cost) })),
      payrollTotals: { gross: r2(payroll.reduce((s, p) => s + p.gross, 0)), net: r2(payroll.reduce((s, p) => s + p.net, 0)), cost: r2(payroll.reduce((s, p) => s + p.cost, 0)) },
      leave, claims: claimsByCat.map((x) => ({ ...x, amount: r2(x.amount) })),
      attendanceThisMonth: { period, marked, attendanceRate: marked ? r2((present / marked) * 100) : null, late: att.reduce((s, a) => s + a.late, 0), byStatus: att },
    };
  }

  async employeesCsv(c: Ctx) {
    const rows = await this.db.select({ e: employees, dept: departments.name }).from(employees).leftJoin(departments, eq(departments.id, employees.departmentId))
      .where(eq(employees.companyId, c.companyId)).orderBy(asc(employees.code));
    const head = ['Code', 'Name', 'Email', 'Phone', 'Department', 'Designation', 'Type', 'Status', 'Join date', 'Exit date', 'Basic salary', 'Bank', 'Account', 'EPF no.', 'Tax no.'];
    const esc = (v: unknown) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    return [head, ...rows.map(({ e, dept }) => [e.code, e.name, e.email, e.phone, dept, e.designation, e.type, e.status, e.joinDate, e.exitDate, e.basicSalary, e.bankName, e.bankAccount, e.epfNo, e.taxNo])]
      .map((r) => r.map(esc).join(',')).join('\r\n');
  }
}

@Controller('reports')
@RequireModule('reporting')
@Roles('OWNER', 'HR')
export class ReportsController {
  constructor(private s: ReportsService) {}
  @Get('overview') overview(@CurrentCtx() c: Ctx, @Query('year') y?: string) { return this.s.overview(c, /^\d{4}$/.test(y || '') ? y! : todayIn().slice(0, 4)); }
  @Get('employees.csv') async csv(@CurrentCtx() c: Ctx) {
    return new StreamableFile(Buffer.from('﻿' + (await this.s.employeesCsv(c))), { type: 'text/csv; charset=utf-8', disposition: 'attachment; filename="employees.csv"' });
  }
}

@Module({ controllers: [ReportsController], providers: [ReportsService] })
export class ReportsModule {}
