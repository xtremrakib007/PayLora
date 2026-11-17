import { BadRequestException, Body, Controller, Delete, Get, Injectable, Module, Param, Patch, Post, StreamableFile } from '@nestjs/common';
import { and, asc, desc, eq, gte, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { Ctx, CurrentCtx, isAdmin, RequireModule, Roles } from '../../common/context';
import { AccessService, AuditService, NotifyService } from '../../common/core';
import { monthEnd, monthStart } from '../../common/dates';
import { deny, must } from '../../common/util';
import { parse, zPeriod } from '../../common/validate';
import { DB, InjectDb } from '../../db/db';
import { claims, departments, employees, payrollRuns, payslips, statutorySchemes } from '../../db/schema';
import { AttendanceModule, AttendanceService } from '../attendance/attendance.module';
import { Adjustments, computePayslip, EngineEmployee, Line, PayslipData, r2 } from './engine';
import { renderPayslips } from './pdf';

const AdjDto = z.object({
  bonus: z.coerce.number().min(0).optional(), otherEarnings: z.coerce.number().min(0).optional(),
  otHours: z.coerce.number().min(0).nullish(), unpaidDays: z.coerce.number().min(0).nullish(), tax: z.coerce.number().min(0).nullish(),
  otherDeduction: z.coerce.number().min(0).optional(), note: z.string().max(300).optional(),
});
const csvCell = (v: unknown) => { const s = String(v ?? ''); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const toCsv = (rows: unknown[][]) => rows.map((r) => r.map(csvCell).join(',')).join('\r\n');

@Injectable()
export class PayrollService {
  constructor(@InjectDb() private db: DB, private access: AccessService, private att: AttendanceService, private notify: NotifyService, private audit: AuditService) {}

  private run(c: Ctx, period: string) {
    return this.db.query.payrollRuns.findFirst({ where: and(eq(payrollRuns.companyId, c.companyId), eq(payrollRuns.period, period)) });
  }

  async list(c: Ctx) {
    return this.db.select({
      id: payrollRuns.id, period: payrollRuns.period, status: payrollRuns.status, finalizedAt: payrollRuns.finalizedAt, paidAt: payrollRuns.paidAt, updatedAt: payrollRuns.updatedAt,
      count: sql<number>`count(${payslips.id})`.mapWith(Number), gross: sql<number>`coalesce(sum(${payslips.gross}),0)`.mapWith(Number),
      net: sql<number>`coalesce(sum(${payslips.net}),0)`.mapWith(Number), cost: sql<number>`coalesce(sum(${payslips.employerCost}),0)`.mapWith(Number),
    }).from(payrollRuns).leftJoin(payslips, eq(payslips.runId, payrollRuns.id)).where(eq(payrollRuns.companyId, c.companyId))
      .groupBy(payrollRuns.id).orderBy(desc(payrollRuns.period));
  }

  async get(c: Ctx, period: string) {
    const run = must(await this.run(c, period), 'Payroll run');
    const slips = await this.db.select().from(payslips).where(eq(payslips.runId, run.id));
    slips.sort((a, b) => (a.data as PayslipData).employee.name.localeCompare((b.data as PayslipData).employee.name));
    const t = (f: (d: PayslipData) => number) => r2(slips.reduce((s, x) => s + f(x.data as PayslipData), 0));
    return {
      run, payslips: slips,
      totals: { count: slips.length, gross: t((d) => d.gross), deductions: t((d) => d.totalDeductions), net: t((d) => d.net), employer: t((d) => d.statutoryEmployer), cost: t((d) => d.employerCost), reimbursements: t((d) => d.reimbursementTotal) },
    };
  }

  /** Estimate for a period without saving anything. */
  async preview(c: Ctx, period: string) {
    const inputs = await this.inputs(c, period, new Map());
    const slips = inputs.emps.map((e) => this.calc(inputs, e, {}, []));
    return { count: slips.length, gross: r2(slips.reduce((s, d) => s + d.gross, 0)), net: r2(slips.reduce((s, d) => s + d.net, 0)), cost: r2(slips.reduce((s, d) => s + d.employerCost, 0)) };
  }

  private async inputs(c: Ctx, period: string, _prev: Map<string, Adjustments>) {
    const co = await this.access.company(c.companyId);
    const schemes = await this.db.select().from(statutorySchemes).where(eq(statutorySchemes.companyId, c.companyId)).orderBy(asc(statutorySchemes.sortOrder));
    const emps = await this.db.select({ e: employees, dept: departments.name }).from(employees).leftJoin(departments, eq(departments.id, employees.departmentId))
      .where(and(eq(employees.companyId, c.companyId), inArray(employees.status, ['ACTIVE', 'ON_NOTICE']), lte(employees.joinDate, monthEnd(period)),
        or(isNull(employees.exitDate), gte(employees.exitDate, monthStart(period))))).orderBy(asc(employees.name));
    const att = await this.att.summary(c.companyId, period, emps.map((x) => x.e.id));
    return { co, schemes, emps, att, period };
  }

  private calc(inp: Awaited<ReturnType<PayrollService['inputs']>>, x: { e: typeof employees.$inferSelect; dept: string | null }, adj: Adjustments, reimb: Line[]) {
    const e = x.e;
    const ee: EngineEmployee = { ...e, department: x.dept, basicSalary: e.basicSalary, monthlyTax: e.monthlyTax, allowances: e.allowances, deductions: e.deductions };
    const a = inp.att.get(e.id);
    return computePayslip(ee, { workingDays: inp.co.workingDays, hoursPerDay: inp.co.hoursPerDay, otRate: inp.co.otRate },
      inp.schemes.map((s) => ({ name: s.name, employeeRate: s.employeeRate, employerRate: s.employerRate, wageCap: s.wageCap })),
      { otHours: a?.otHours ?? 0, unpaidDays: a?.unpaidDays ?? 0 }, adj, reimb);
  }

  /** Create or recalculate a draft run from current employee, attendance, leave and claims data. Keeps per-employee adjustments. */
  async generate(c: Ctx, period: string) {
    const existing = await this.run(c, period);
    if (existing && existing.status !== 'DRAFT') throw new BadRequestException('This run is locked. Reopen it to recalculate.');
    const prev = new Map<string, Adjustments>();
    if (existing) (await this.db.select().from(payslips).where(eq(payslips.runId, existing.id))).forEach((p) => prev.set(p.employeeId, p.adjustments as Adjustments));
    const inp = await this.inputs(c, period, prev);
    if (!inp.emps.length) throw new BadRequestException('No active employees for this period');

    await this.db.transaction(async (tx) => {
      const run = existing ?? (await tx.insert(payrollRuns).values({ companyId: c.companyId, period, createdById: c.userId }).returning())[0];
      await tx.delete(payslips).where(eq(payslips.runId, run.id));
      await tx.update(claims).set({ runId: null }).where(and(eq(claims.runId, run.id), eq(claims.status, 'APPROVED')));
      const due = await tx.select().from(claims).where(and(eq(claims.companyId, c.companyId), eq(claims.status, 'APPROVED'), isNull(claims.runId), lte(claims.date, monthEnd(period)),
        inArray(claims.employeeId, inp.emps.map((x) => x.e.id))));
      const byEmp = new Map<string, Line[]>();
      due.forEach((cl) => byEmp.set(cl.employeeId, [...(byEmp.get(cl.employeeId) ?? []), { name: `${cl.category} claim (${cl.date})`, amount: cl.amount }]));
      if (due.length) await tx.update(claims).set({ runId: run.id }).where(inArray(claims.id, due.map((d) => d.id)));
      const rows = inp.emps.map((x) => {
        const adj = prev.get(x.e.id) ?? {};
        const d = this.calc(inp, x, adj, byEmp.get(x.e.id) ?? []);
        return { companyId: c.companyId, runId: run.id, employeeId: x.e.id, data: d, adjustments: adj, gross: d.gross, totalDeductions: d.totalDeductions, net: d.net, employerCost: d.employerCost };
      });
      await tx.insert(payslips).values(rows);
      await tx.update(payrollRuns).set({ updatedAt: new Date() }).where(eq(payrollRuns.id, run.id));
    });
    this.audit.log(c, existing ? 'recalculate' : 'generate', 'payroll_run', period);
    return this.get(c, period);
  }

  async adjust(c: Ctx, period: string, employeeId: string, body: unknown) {
    const adj = parse(AdjDto, body) as Adjustments;
    const run = must(await this.run(c, period), 'Payroll run');
    if (run.status !== 'DRAFT') throw new BadRequestException('This run is locked. Reopen it to make changes.');
    const slip = must(await this.db.query.payslips.findFirst({ where: and(eq(payslips.runId, run.id), eq(payslips.employeeId, employeeId)) }), 'Payslip');
    const inp = await this.inputs(c, period, new Map());
    const x = must(inp.emps.find((e) => e.e.id === employeeId), 'Employee');
    const d = this.calc(inp, x, adj, (slip.data as PayslipData).reimbursements);
    const [u] = await this.db.update(payslips).set({ data: d, adjustments: adj, gross: d.gross, totalDeductions: d.totalDeductions, net: d.net, employerCost: d.employerCost }).where(eq(payslips.id, slip.id)).returning();
    return u;
  }

  async setStatus(c: Ctx, period: string, body: unknown) {
    const { status } = parse(z.object({ status: z.enum(['DRAFT', 'FINALIZED', 'PAID']) }), body);
    const run = must(await this.run(c, period), 'Payroll run');
    const allowed: Record<string, string[]> = { DRAFT: ['FINALIZED'], FINALIZED: ['PAID', 'DRAFT'], PAID: ['FINALIZED'] };
    if (!allowed[run.status].includes(status)) throw new BadRequestException(`Cannot move a ${run.status} run to ${status}`);
    await this.db.transaction(async (tx) => {
      await tx.update(payrollRuns).set({ status, finalizedAt: status === 'FINALIZED' ? run.finalizedAt ?? new Date() : run.finalizedAt, paidAt: status === 'PAID' ? new Date() : null }).where(eq(payrollRuns.id, run.id));
      if (status === 'PAID') await tx.update(claims).set({ status: 'PAID' }).where(eq(claims.runId, run.id));
      if (run.status === 'PAID' && status === 'FINALIZED') await tx.update(claims).set({ status: 'APPROVED' }).where(eq(claims.runId, run.id));
    });
    if (status === 'FINALIZED' && !run.finalizedAt) {
      const empIds = (await this.db.select({ id: payslips.employeeId }).from(payslips).where(eq(payslips.runId, run.id))).map((r) => r.id);
      await this.notify.send(c.companyId, await this.access.userIdsForEmployees(c.companyId, empIds), { type: 'payslip.ready', title: 'Your payslip is ready', body: `Payslip for ${period} is now available.`, link: '/me/payslips' });
    }
    this.audit.log(c, 'status:' + status, 'payroll_run', period);
    return this.get(c, period);
  }

  async remove(c: Ctx, period: string) {
    const run = must(await this.run(c, period), 'Payroll run');
    if (run.status !== 'DRAFT') throw new BadRequestException('Only draft runs can be deleted');
    await this.db.delete(payrollRuns).where(eq(payrollRuns.id, run.id));
    this.audit.log(c, 'delete', 'payroll_run', period);
    return { ok: true };
  }

  async csv(c: Ctx, period: string, kind: 'bank' | 'summary') {
    const { payslips: slips } = await this.get(c, period);
    const ds = slips.map((s) => s.data as PayslipData);
    if (kind === 'bank') return toCsv([['Employee code', 'Name', 'Bank', 'Account number', 'Amount', 'Reference'], ...ds.map((d) => [d.employee.code, d.employee.name, d.employee.bankName, d.employee.bankAccount, d.net.toFixed(2), `Salary ${period}`])]);
    const names = [...new Set(ds.flatMap((d) => d.statutory.map((s) => s.name)))];
    const head = ['Code', 'Name', 'Department', 'Basic', 'Allowances', 'OT hours', 'OT pay', 'Bonus', 'Other earnings', 'Unpaid days', 'Unpaid deduction', 'Gross', ...names.map((n) => `${n} (EE)`), 'PCB', 'Other deductions', 'Total deductions', 'Reimbursements', 'Net pay', ...names.map((n) => `${n} (ER)`), 'Employer cost'];
    const rows = ds.map((d) => {
      const g = (n: string) => d.statutory.find((s) => s.name === n);
      return [d.employee.code, d.employee.name, d.employee.department, d.basic, d.allowanceTotal, d.otHours, d.otPay, d.bonus, d.otherEarnings, d.unpaidDays, d.unpaidDeduction, d.gross,
        ...names.map((n) => g(n)?.employee ?? 0), d.tax, r2(d.deductionTotal + d.otherDeduction), d.totalDeductions, d.reimbursementTotal, d.net, ...names.map((n) => g(n)?.employer ?? 0), d.employerCost];
    });
    return toCsv([head, ...rows]);
  }

  async pdfForRun(c: Ctx, period: string) {
    const { run, payslips: slips } = await this.get(c, period);
    const co = await this.access.company(c.companyId);
    return renderPayslips(co, slips.map((s) => ({ period: run.period, status: run.status, data: s.data as PayslipData })));
  }

  async pdfForSlip(c: Ctx, id: string) {
    const [row] = await this.db.select({ s: payslips, r: payrollRuns }).from(payslips).innerJoin(payrollRuns, eq(payrollRuns.id, payslips.runId))
      .where(and(eq(payslips.id, id), eq(payslips.companyId, c.companyId)));
    if (!row) must(null, 'Payslip');
    const own = row.s.employeeId === c.employeeId;
    if (!(isAdmin(c) && c.modules.includes('payroll')) && !(own && row.r.status !== 'DRAFT')) deny();
    const co = await this.access.company(c.companyId);
    const buf = await renderPayslips(co, [{ period: row.r.period, status: row.r.status, data: row.s.data as PayslipData }]);
    return { buf, name: `Payslip_${row.r.period}_${(row.s.data as PayslipData).employee.code}.pdf` };
  }

  async mine(c: Ctx) {
    const empId = this.access.self(c);
    return this.db.select({ id: payslips.id, period: payrollRuns.period, status: payrollRuns.status, gross: payslips.gross, net: payslips.net, totalDeductions: payslips.totalDeductions, data: payslips.data, paidAt: payrollRuns.paidAt })
      .from(payslips).innerJoin(payrollRuns, eq(payrollRuns.id, payslips.runId))
      .where(and(eq(payslips.employeeId, empId), eq(payslips.companyId, c.companyId), inArray(payrollRuns.status, ['FINALIZED', 'PAID']))).orderBy(desc(payrollRuns.period));
  }
}

const pdf = (buf: Buffer, name: string) => new StreamableFile(buf, { type: 'application/pdf', disposition: `attachment; filename="${name}"` });
const csv = (text: string, name: string) => new StreamableFile(Buffer.from('﻿' + text), { type: 'text/csv; charset=utf-8', disposition: `attachment; filename="${name}"` });

@Controller('payroll')
@RequireModule('payroll')
@Roles('OWNER', 'HR')
export class PayrollController {
  constructor(private s: PayrollService) {}
  @Get('runs') list(@CurrentCtx() c: Ctx) { return this.s.list(c); }
  @Get('preview/:period') preview(@CurrentCtx() c: Ctx, @Param('period') p: string) { return this.s.preview(c, parse(zPeriod, p)); }
  @Get('runs/:period') get(@CurrentCtx() c: Ctx, @Param('period') p: string) { return this.s.get(c, parse(zPeriod, p)); }
  @Post('runs/:period/generate') gen(@CurrentCtx() c: Ctx, @Param('period') p: string) { return this.s.generate(c, parse(zPeriod, p)); }
  @Patch('runs/:period/payslips/:employeeId') adj(@CurrentCtx() c: Ctx, @Param('period') p: string, @Param('employeeId') e: string, @Body() b: unknown) { return this.s.adjust(c, parse(zPeriod, p), e, b); }
  @Post('runs/:period/status') status(@CurrentCtx() c: Ctx, @Param('period') p: string, @Body() b: unknown) { return this.s.setStatus(c, parse(zPeriod, p), b); }
  @Delete('runs/:period') remove(@CurrentCtx() c: Ctx, @Param('period') p: string) { return this.s.remove(c, parse(zPeriod, p)); }
  @Get('runs/:period/bank.csv') async bank(@CurrentCtx() c: Ctx, @Param('period') p: string) { return csv(await this.s.csv(c, parse(zPeriod, p), 'bank'), `Bank_transfer_${p}.csv`); }
  @Get('runs/:period/summary.csv') async summary(@CurrentCtx() c: Ctx, @Param('period') p: string) { return csv(await this.s.csv(c, parse(zPeriod, p), 'summary'), `Payroll_${p}.csv`); }
  @Get('runs/:period/payslips.pdf') async all(@CurrentCtx() c: Ctx, @Param('period') p: string) { return pdf(await this.s.pdfForRun(c, parse(zPeriod, p)), `Payslips_${p}.pdf`); }
}

@Controller('payslips')
export class PayslipsController {
  constructor(private s: PayrollService) {}
  @Get('mine') mine(@CurrentCtx() c: Ctx) { return this.s.mine(c); }
  @Get(':id/pdf') async one(@CurrentCtx() c: Ctx, @Param('id') id: string) { const r = await this.s.pdfForSlip(c, id); return pdf(r.buf, r.name); }
}

@Module({ imports: [AttendanceModule], controllers: [PayrollController, PayslipsController], providers: [PayrollService] })
export class PayrollModule {}
