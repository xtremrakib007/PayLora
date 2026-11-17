import { computePayslip, EngineEmployee } from './engine';

const settings = { workingDays: 26, hoursPerDay: 8, otRate: 1.5 };
const schemes = [
  { name: 'EPF', employeeRate: 11, employerRate: 13, wageCap: 0 },
  { name: 'SOCSO', employeeRate: 0.5, employerRate: 1.75, wageCap: 6000 },
  { name: 'EIS', employeeRate: 0.2, employerRate: 0.2, wageCap: 6000 },
];
const emp = (o: Partial<EngineEmployee> = {}): EngineEmployee => ({
  id: 'e1', code: 'EMP-001', name: 'Test', basicSalary: 2200, monthlyTax: 0, applyStatutory: true,
  allowances: [{ name: 'Meal', amount: 150 }, { name: 'Shift', amount: 200 }], deductions: [], ...o,
});

describe('computePayslip', () => {
  it('computes overtime, unpaid days and statutory contributions', () => {
    const p = computePayslip(emp(), settings, schemes, { otHours: 4, unpaidDays: 1 });
    expect(p.allowanceTotal).toBe(350);
    expect(p.otPay).toBe(63.46);          // 2200/26/8 × 4 × 1.5
    expect(p.unpaidDeduction).toBe(84.62); // 2200/26 × 1
    expect(p.gross).toBe(2528.84);
    expect(p.statutory[0]).toEqual({ name: 'EPF', employee: 278.17, employer: 328.75 });
    expect(p.net).toBe(2232.97);
  });

  it('caps the statutory wage base', () => {
    const p = computePayslip(emp({ basicSalary: 12500, allowances: [] }), settings, schemes, { otHours: 0, unpaidDays: 0 });
    expect(p.statutory.find((s) => s.name === 'SOCSO')!.employee).toBe(30);
    expect(p.statutory.find((s) => s.name === 'EIS')!.employee).toBe(12);
  });

  it('applies adjustments and overrides attendance', () => {
    const p = computePayslip(emp({ monthlyTax: 50 }), settings, schemes, { otHours: 10, unpaidDays: 3 }, { otHours: 0, unpaidDays: 0, bonus: 500, otherDeduction: 20, tax: 80 });
    expect(p.otPay).toBe(0);
    expect(p.unpaidDeduction).toBe(0);
    expect(p.gross).toBe(3050);
    expect(p.tax).toBe(80);
    expect(p.totalDeductions).toBe(r(3050 * 0.117 + 80 + 20));
  });

  it('deducts late minutes at the hourly rate only when enabled', () => {
    const off = computePayslip(emp(), settings, schemes, { otHours: 0, unpaidDays: 0, lateMinutes: 90 });
    expect(off.lateDeduction).toBe(0);
    const on = computePayslip(emp(), { ...settings, lateDeduction: true }, schemes, { otHours: 0, unpaidDays: 0, lateMinutes: 90 });
    expect(on.lateMinutes).toBe(90);
    expect(on.lateDeduction).toBe(15.87); // 2200/26/8 × 1.5 h
    expect(on.gross).toBe(r(off.gross - 15.87));
    const waived = computePayslip(emp(), { ...settings, lateDeduction: true }, schemes, { otHours: 0, unpaidDays: 0, lateMinutes: 90 }, { lateMinutes: 0 });
    expect(waived.lateDeduction).toBe(0);
  });

  it('deducts early-leave minutes when enabled', () => {
    const on = computePayslip(emp(), { ...settings, earlyLeaveDeduction: true }, schemes, { otHours: 0, unpaidDays: 0, earlyMinutes: 60 });
    expect(on.earlyDeduction).toBe(10.58);
    const off = computePayslip(emp(), settings, schemes, { otHours: 0, unpaidDays: 0, earlyMinutes: 60 });
    expect(off.earlyDeduction).toBe(0);
    expect(on.gross).toBe(r(off.gross - 10.58));
  });

  it('pays reimbursements outside gross and statutory', () => {
    const base = computePayslip(emp(), settings, schemes, { otHours: 0, unpaidDays: 0 });
    const p = computePayslip(emp(), settings, schemes, { otHours: 0, unpaidDays: 0 }, {}, [{ name: 'Travel', amount: 120.5 }]);
    expect(p.gross).toBe(base.gross);
    expect(p.statutoryEmployee).toBe(base.statutoryEmployee);
    expect(p.net).toBe(r(base.net + 120.5));
  });

  it('never deducts more than basic for unpaid days and skips statutory when disabled', () => {
    const p = computePayslip(emp({ applyStatutory: false, allowances: [] }), settings, schemes, { otHours: 0, unpaidDays: 40 });
    expect(p.unpaidDeduction).toBe(2200);
    expect(p.gross).toBe(0);
    expect(p.statutory).toEqual([]);
  });
});

function r(n: number) { return Math.round((n + Number.EPSILON) * 100) / 100; }
