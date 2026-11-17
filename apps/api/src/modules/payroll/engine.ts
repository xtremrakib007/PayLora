/**
 * Payroll engine — pure functions, no I/O, fully unit-tested.
 *
 *   daily rate  = basic ÷ working days per month
 *   hourly rate = daily ÷ hours per day
 *   overtime    = hourly × OT hours × OT multiplier
 *   unpaid      = daily × unpaid days (capped at basic)
 *   late        = hourly × late minutes ÷ 60   (only when the company enables late deductions)
 *   early leave = hourly × early-leave minutes ÷ 60 (only when enabled)
 *   gross       = basic + allowances + overtime + bonus + other earnings − unpaid − late − early leave
 *   statutory   = min(gross, wage cap) × rate%   (employee and employer parts)
 *   net         = gross − (statutory employee + PCB + recurring + one-off deductions) + reimbursements
 *
 * Reimbursements (approved claims) are paid through payroll but are not wages:
 * they are excluded from gross and from the statutory base.
 */
export type Line = { name: string; amount: number };

export interface EngineEmployee {
  id: string; code: string; name: string; designation?: string | null; department?: string | null;
  icNo?: string | null; epfNo?: string | null; taxNo?: string | null; bankName?: string | null; bankAccount?: string | null; joinDate?: string | null;
  basicSalary: number; monthlyTax: number; applyStatutory: boolean; allowances: Line[]; deductions: Line[];
}
export interface EngineSettings { workingDays: number; hoursPerDay: number; otRate: number; lateDeduction?: boolean; earlyLeaveDeduction?: boolean }
export interface EngineScheme { name: string; employeeRate: number; employerRate: number; wageCap: number }
export interface EngineAttendance { otHours: number; unpaidDays: number; lateMinutes?: number; earlyMinutes?: number }
export interface Adjustments {
  bonus?: number; otherEarnings?: number; otHours?: number | null; unpaidDays?: number | null; lateMinutes?: number | null; earlyMinutes?: number | null; tax?: number | null; otherDeduction?: number; note?: string;
}

export interface PayslipData {
  employee: { id: string; code: string; name: string; designation: string; department: string; icNo: string; epfNo: string; taxNo: string; bankName: string; bankAccount: string; joinDate: string };
  basic: number; allowances: Line[]; allowanceTotal: number;
  otHours: number; otPay: number; bonus: number; otherEarnings: number; unpaidDays: number; unpaidDeduction: number;
  lateMinutes: number; lateDeduction: number; earlyMinutes: number; earlyDeduction: number;
  gross: number;
  statutory: { name: string; employee: number; employer: number }[]; statutoryEmployee: number; statutoryEmployer: number;
  tax: number; deductions: Line[]; deductionTotal: number; otherDeduction: number; totalDeductions: number;
  reimbursements: Line[]; reimbursementTotal: number;
  net: number; employerCost: number; note: string;
  rates: { daily: number; hourly: number };
}

export const r2 = (n: number) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const total = (l: Line[]) => r2(l.reduce((s, x) => s + (Number(x.amount) || 0), 0));
const clean = (l: Line[] | null | undefined, fallback: string) =>
  (l || []).filter((x) => Number(x?.amount)).map((x) => ({ name: (x.name || fallback).trim() || fallback, amount: r2(Number(x.amount)) }));

export function computePayslip(e: EngineEmployee, s: EngineSettings, schemes: EngineScheme[], att: EngineAttendance, adj: Adjustments = {}, reimbursements: Line[] = []): PayslipData {
  const wd = s.workingDays > 0 ? s.workingDays : 26;
  const hpd = s.hoursPerDay > 0 ? s.hoursPerDay : 8;
  const otr = s.otRate >= 1 ? s.otRate : 1.5;
  const basic = r2(e.basicSalary);
  const daily = basic / wd, hourly = daily / hpd;

  const allowances = clean(e.allowances, 'Allowance');
  const allowanceTotal = total(allowances);
  const otHours = r2(Math.max(0, adj.otHours ?? att.otHours ?? 0));
  const unpaidDays = r2(Math.max(0, adj.unpaidDays ?? att.unpaidDays ?? 0));
  const otPay = r2(hourly * otHours * otr);
  const unpaidDeduction = r2(Math.min(basic, daily * unpaidDays));
  const lateMinutes = s.lateDeduction ? Math.max(0, Math.round(adj.lateMinutes ?? att.lateMinutes ?? 0)) : 0;
  const lateDeduction = r2(Math.min(basic - unpaidDeduction, (hourly * lateMinutes) / 60));
  const earlyMinutes = s.earlyLeaveDeduction ? Math.max(0, Math.round(adj.earlyMinutes ?? att.earlyMinutes ?? 0)) : 0;
  const earlyDeduction = r2(Math.max(0, Math.min(basic - unpaidDeduction - lateDeduction, (hourly * earlyMinutes) / 60)));
  const bonus = r2(Math.max(0, adj.bonus ?? 0));
  const otherEarnings = r2(Math.max(0, adj.otherEarnings ?? 0));
  const gross = r2(basic + allowanceTotal + otPay + bonus + otherEarnings - unpaidDeduction - lateDeduction - earlyDeduction);

  const statutory = e.applyStatutory
    ? schemes.map((c) => {
        const base = c.wageCap > 0 ? Math.min(gross, c.wageCap) : gross;
        return { name: c.name, employee: r2((base * c.employeeRate) / 100), employer: r2((base * c.employerRate) / 100) };
      }).filter((c) => c.employee || c.employer)
    : [];
  const statutoryEmployee = r2(statutory.reduce((a, c) => a + c.employee, 0));
  const statutoryEmployer = r2(statutory.reduce((a, c) => a + c.employer, 0));
  const tax = r2(Math.max(0, adj.tax ?? e.monthlyTax ?? 0));
  const deductions = clean(e.deductions, 'Deduction');
  const deductionTotal = total(deductions);
  const otherDeduction = r2(Math.max(0, adj.otherDeduction ?? 0));
  const totalDeductions = r2(statutoryEmployee + tax + deductionTotal + otherDeduction);
  const reimb = clean(reimbursements, 'Reimbursement');
  const reimbursementTotal = total(reimb);

  return {
    employee: {
      id: e.id, code: e.code, name: e.name, designation: e.designation || '', department: e.department || '', icNo: e.icNo || '',
      epfNo: e.epfNo || '', taxNo: e.taxNo || '', bankName: e.bankName || '', bankAccount: e.bankAccount || '', joinDate: e.joinDate || '',
    },
    basic, allowances, allowanceTotal, otHours, otPay, bonus, otherEarnings, unpaidDays, unpaidDeduction, lateMinutes, lateDeduction, earlyMinutes, earlyDeduction, gross,
    statutory, statutoryEmployee, statutoryEmployer, tax, deductions, deductionTotal, otherDeduction, totalDeductions,
    reimbursements: reimb, reimbursementTotal,
    net: r2(gross - totalDeductions + reimbursementTotal),
    employerCost: r2(gross + statutoryEmployer + reimbursementTotal),
    note: adj.note || '',
    rates: { daily: r2(daily), hourly: r2(hourly) },
  };
}
