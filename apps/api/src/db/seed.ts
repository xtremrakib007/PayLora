/**
 * Seed: plans + platform super-admin (always), and a demo company with sample data (`npm run db:seed -- --demo`).
 * Safe to run repeatedly.
 */
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { PLAN_DEFAULTS } from '../common/plans';
import { addDays, todayIn, toDate } from '../common/dates';
import { createCompany } from '../modules/auth/bootstrap';
import { createPool, DB } from './db';
import * as s from './schema';

const DEMO_PASSWORD = 'Demo1234!';

async function main() {
  const pool = createPool();
  const db = drizzle(pool, { schema: s }) as DB;

  for (const p of PLAN_DEFAULTS) {
    await db.insert(s.plans).values(p).onConflictDoUpdate({ target: s.plans.code, set: { name: p.name, priceMonthly: p.priceMonthly, maxEmployees: p.maxEmployees, modules: p.modules, sortOrder: p.sortOrder } });
  }
  console.log('✔ Plans');

  const email = (process.env.SUPERADMIN_EMAIL || 'admin@example.com').toLowerCase();
  const pass = process.env.SUPERADMIN_PASSWORD || 'ChangeMe123!';
  const existing = await db.query.users.findFirst({ where: eq(s.users.email, email) });
  if (!existing) await db.insert(s.users).values({ email, name: 'Platform Admin', passwordHash: await bcrypt.hash(pass, 10), platformRole: 'SUPER_ADMIN' });
  else await db.update(s.users).set({ platformRole: 'SUPER_ADMIN' }).where(eq(s.users.id, existing.id));
  console.log(`✔ Super-admin ${email}`);

  if (process.argv.includes('--demo')) await demo(db);
  await pool.end();
}

async function demo(db: DB) {
  if (await db.query.companies.findFirst({ where: eq(s.companies.slug, 'demo') })) { console.log('• Demo company already exists'); return; }
  const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const mkUser = async (email: string, name: string) => {
    const u = await db.query.users.findFirst({ where: eq(s.users.email, email) });
    return u ?? (await db.insert(s.users).values({ email, name, passwordHash: hash }).returning())[0];
  };
  const owner = await mkUser('owner@demo.test', 'Aisyah Rahman');
  const co = await db.transaction((tx) => createCompany(tx as unknown as DB, owner.id, { name: 'Nusantara Trading Sdn. Bhd.', slug: 'demo' }));
  const cid = co.id;
  await db.update(s.companies).set({ regNo: '202301012345 (1501234-X)', address: 'Level 8, Menara Example, Jalan Ampang, 50450 Kuala Lumpur', email: 'hr@nusantara.example', phone: '+60 3-2100 0000', officeLat: 3.1579, officeLng: 101.7123, lateDeduction: true, lateGraceMinutes: 10, lateRoundMinutes: 15 }).where(eq(s.companies.id, cid));
  await db.update(s.subscriptions).set({ planCode: 'BUSINESS', currentPeriodEnd: new Date(Date.now() + 365 * 86400000) }).where(eq(s.subscriptions.companyId, cid));

  const yr = todayIn().slice(0, 4);
  await db.insert(s.holidays).values([['01-01', "New Year's Day"], ['05-01', 'Labour Day'], ['08-31', 'National Day'], ['09-16', 'Malaysia Day'], ['12-25', 'Christmas Day']].map(([d, name]) => ({ companyId: cid, date: `${yr}-${d}`, name })));

  const depts = await db.insert(s.departments).values(['Management', 'Finance', 'Operations', 'Sales', 'IT'].map((name) => ({ companyId: cid, name }))).returning();
  const D = Object.fromEntries(depts.map((d) => [d.name, d.id]));
  const people: [string, string, string, number, [string, number][], number, string][] = [
    ['Aisyah Rahman', 'Management', 'General Manager', 12500, [['Housing', 1500], ['Transport', 600]], 1450, 'owner@demo.test'],
    ['Daniel Tan Wei Ming', 'Finance', 'HR & Finance Manager', 8200, [['Transport', 400]], 620, 'hr@demo.test'],
    ['Priya Nair', 'Finance', 'Accounts Executive', 4200, [['Transport', 250]], 45, ''],
    ['Muhammad Hafiz', 'Operations', 'Operations Supervisor', 4800, [['Transport', 300], ['Meal', 200]], 80, 'manager@demo.test'],
    ['Siti Nurhaliza Omar', 'Operations', 'Warehouse Assistant', 2400, [['Meal', 150]], 0, 'staff@demo.test'],
    ['Kumar Selvam', 'Operations', 'Driver', 2200, [['Meal', 150], ['Shift', 200]], 0, ''],
    ['Jessica Lim', 'Sales', 'Sales Executive', 3800, [['Phone', 100], ['Transport', 300]], 20, ''],
    ['Arif Iskandar', 'Sales', 'Sales Manager', 7000, [['Phone', 150], ['Transport', 500]], 480, ''],
    ['Wong Kah Hoe', 'IT', 'Software Developer', 6500, [['Internet', 100]], 380, ''],
    ['Nurul Ain Zakaria', 'IT', 'IT Support', 3200, [], 0, ''],
  ];
  const banks = ['Maybank', 'CIMB', 'Public Bank', 'RHB'];
  const emps = await db.insert(s.employees).values(people.map(([name, dept, designation, basic, al, tax, email], i) => ({
    companyId: cid, code: `EMP-${String(i + 1).padStart(3, '0')}`, name, designation, departmentId: D[dept], type: i === 9 ? 'CONTRACT' as const : 'FULL_TIME' as const,
    email: email || `${name.toLowerCase().split(' ')[0]}@nusantara.example`, phone: `+60 12-${300 + i * 7} ${4000 + i * 311}`,
    joinDate: `${Number(yr) - 1 - (i % 3)}-${String(((i * 3) % 12) + 1).padStart(2, '0')}-01`, basicSalary: basic, monthlyTax: tax,
    allowances: al.map(([n, a]) => ({ name: n, amount: a })), deductions: i === 4 ? [{ name: 'Salary advance', amount: 200 }] : [],
    bankName: banks[i % 4], bankAccount: String(5140000000 + i * 7654321), epfNo: String(10000000 + i * 345678),
  }))).returning();
  const E = emps;
  // reporting lines
  for (const i of [4, 5]) await db.update(s.employees).set({ managerId: E[3].id }).where(eq(s.employees.id, E[i].id));
  for (const i of [6]) await db.update(s.employees).set({ managerId: E[7].id }).where(eq(s.employees.id, E[i].id));
  for (const i of [9]) await db.update(s.employees).set({ managerId: E[8].id }).where(eq(s.employees.id, E[i].id));
  for (const i of [1, 3, 7, 8]) await db.update(s.employees).set({ managerId: E[0].id }).where(eq(s.employees.id, E[i].id));

  // logins: owner, HR, manager, employee
  const hr = await mkUser('hr@demo.test', 'Daniel Tan Wei Ming');
  const mgr = await mkUser('manager@demo.test', 'Muhammad Hafiz');
  const staff = await mkUser('staff@demo.test', 'Siti Nurhaliza Omar');
  await db.update(s.memberships).set({ employeeId: E[0].id }).where(eq(s.memberships.userId, owner.id));
  await db.insert(s.memberships).values([
    { userId: hr.id, companyId: cid, role: 'HR', employeeId: E[1].id },
    { userId: mgr.id, companyId: cid, role: 'MANAGER', employeeId: E[3].id },
    { userId: staff.id, companyId: cid, role: 'EMPLOYEE', employeeId: E[4].id },
  ]);

  // attendance for this month so far
  const today = todayIn(), m = today.slice(0, 7);
  const rows: (typeof s.attendance.$inferInsert)[] = [];
  for (let d = `${m}-01`; d < today; d = addDays(d, 1)) {
    const dow = toDate(d).getUTCDay();
    if (dow === 0) continue;
    E.forEach((e, i) => {
      const day = Number(d.slice(8));
      const status = i === 5 && day % 9 === 0 ? 'ABSENT' : i === 6 && day === 12 ? 'HALF_DAY' : 'PRESENT';
      const clockIn = status === 'ABSENT' ? null : new Date(`${d}T0${8 + (i % 2)}:${String(40 + i).padStart(2, '0')}:00+08:00`);
      rows.push({ companyId: cid, employeeId: e.id, date: d, status, clockIn, clockOut: clockIn ? new Date(clockIn.getTime() + 9 * 3600000) : null, late: !!clockIn && i % 2 === 1, lateMinutes: clockIn && i % 2 === 1 ? 40 + i : 0, otHours: dow === 5 && (i === 4 || i === 5) ? 2 : 0 });
    });
  }
  if (rows.length) await db.insert(s.attendance).values(rows);

  const lt = await db.select().from(s.leaveTypes).where(eq(s.leaveTypes.companyId, cid));
  const L = (n: string) => lt.find((t) => t.name.startsWith(n))!.id;
  await db.insert(s.leaveRequests).values([
    { companyId: cid, employeeId: E[2].id, leaveTypeId: L('Annual'), fromDate: addDays(today, 6), toDate: addDays(today, 8), days: 3, reason: 'Family trip', status: 'PENDING' },
    { companyId: cid, employeeId: E[4].id, leaveTypeId: L('Annual'), fromDate: addDays(today, 14), toDate: addDays(today, 14), days: 1, reason: 'Personal matters', status: 'PENDING' },
    { companyId: cid, employeeId: E[6].id, leaveTypeId: L('Sick'), fromDate: `${m}-05`, toDate: `${m}-05`, days: 1, reason: 'Fever (MC attached)', status: 'APPROVED', decidedAt: new Date() },
    { companyId: cid, employeeId: E[5].id, leaveTypeId: L('Unpaid'), fromDate: `${m}-10`, toDate: `${m}-11`, days: 2, reason: 'Family visit', status: 'APPROVED', decidedAt: new Date() },
  ]);
  await db.insert(s.claims).values([
    { companyId: cid, employeeId: E[6].id, category: 'Travel', date: addDays(today, -6), amount: 186.4, description: 'Client visit to Penang — tolls & fuel', status: 'APPROVED', decidedAt: new Date() },
    { companyId: cid, employeeId: E[4].id, category: 'Medical', date: addDays(today, -3), amount: 65, description: 'Clinic visit', status: 'PENDING' },
    { companyId: cid, employeeId: E[8].id, category: 'Phone & internet', date: addDays(today, -10), amount: 99, description: 'Home fibre (WFH)', status: 'PENDING' },
  ]);
  const tpls = await db.select().from(s.shiftTemplates).where(eq(s.shiftTemplates.companyId, cid));
  const shiftRows: (typeof s.shifts.$inferInsert)[] = [];
  for (let k = 0; k < 7; k++) {
    const d = addDays(today, k); if (toDate(d).getUTCDay() === 0) continue;
    [3, 4, 5].forEach((i, j) => shiftRows.push({ companyId: cid, employeeId: E[i].id, date: d, templateId: tpls[(j + k) % 2 === 0 ? 0 : 1].id }));
  }
  await db.insert(s.shifts).values(shiftRows);

  await db.insert(s.tasks).values([
    { companyId: cid, title: 'Stock count — aisle B', description: 'Count and update the inventory sheet.', assigneeId: E[4].id, createdById: mgr.id, dueDate: addDays(today, 1), priority: 'HIGH' },
    { companyId: cid, title: 'Submit delivery logbook', assigneeId: E[5].id, createdById: mgr.id, dueDate: addDays(today, 2), priority: 'MEDIUM' },
    { companyId: cid, title: 'Complete fire-safety training', assigneeId: E[4].id, createdById: hr.id, dueDate: addDays(today, 7), priority: 'LOW' },
    { companyId: cid, title: 'Prepare Q4 sales forecast', assigneeId: E[7].id, createdById: owner.id, dueDate: addDays(today, 5), priority: 'HIGH', status: 'IN_PROGRESS' },
  ]);
  const at = (days: number, h: number) => { const d = new Date(`${addDays(today, days)}T${String(h).padStart(2, '0')}:00:00+08:00`); return d; };
  const [m1] = await db.insert(s.meetings).values({ companyId: cid, title: 'Weekly operations stand-up', location: 'Meeting room 2', startAt: at(1, 9), endAt: at(1, 10), organizerId: mgr.id, description: 'Deliveries, stock and safety.' }).returning();
  const [m2] = await db.insert(s.meetings).values({ companyId: cid, title: 'Town hall — Q4 plans', onlineUrl: 'https://meet.example.com/townhall', startAt: at(3, 15), endAt: at(3, 16), organizerId: owner.id }).returning();
  await db.insert(s.meetingAttendees).values([{ meetingId: m1.id, userId: staff.id }, { meetingId: m1.id, userId: owner.id, response: 'ACCEPTED' }, { meetingId: m2.id, userId: staff.id }, { meetingId: m2.id, userId: hr.id, response: 'ACCEPTED' }, { meetingId: m2.id, userId: mgr.id }]);

  await db.insert(s.posts).values([
    { companyId: cid, authorId: owner.id, content: 'Welcome to our new HR app! Clock in from your phone, check payslips, apply for leave and claims — all in one place.', announcement: true, pinned: true },
    { companyId: cid, authorId: hr.id, content: 'Reminder: submit this month\'s claims by the 25th so they are paid with your salary.', announcement: true },
    { companyId: cid, authorId: mgr.id, content: 'Great job team on hitting 100% on-time deliveries last week! 🚚' },
  ]);
  const [job] = await db.insert(s.jobs).values({ companyId: cid, title: 'Warehouse Assistant', departmentId: D.Operations, location: 'Shah Alam', type: 'FULL_TIME', salaryRange: 'RM 2,200 – 2,600', status: 'OPEN',
    description: 'Join our operations team to receive, store and dispatch goods. Forklift licence is a plus. Shift work required.' }).returning();
  await db.insert(s.jobs).values({ companyId: cid, title: 'Senior Accountant', departmentId: D.Finance, location: 'Kuala Lumpur', type: 'FULL_TIME', status: 'OPEN', description: 'Own month-end close, statutory reporting and audits. ACCA/CPA preferred.' });
  await db.insert(s.applications).values([
    { companyId: cid, jobId: job.id, name: 'Faizal Ahmad', email: 'faizal@example.com', phone: '+60 11-2345 6789', stage: 'INTERVIEW', rating: 4 },
    { companyId: cid, jobId: job.id, name: 'Lee Mei Ling', email: 'meiling@example.com', stage: 'APPLIED' },
    { companyId: cid, jobId: job.id, name: 'Ravi Kumar', email: 'ravi@example.com', stage: 'SCREENING', rating: 3 },
  ]);
  const [course] = await db.insert(s.courses).values({ companyId: cid, title: 'Workplace fire safety', provider: 'Internal', durationHours: 2, description: 'Evacuation routes, extinguishers and assembly points.' }).returning();
  await db.insert(s.enrollments).values([4, 5, 9].map((i) => ({ companyId: cid, courseId: course.id, employeeId: E[i].id, dueDate: addDays(today, 7), status: i === 9 ? 'COMPLETED' as const : 'ASSIGNED' as const })));
  await db.insert(s.goals).values([
    { companyId: cid, employeeId: E[4].id, title: 'Reduce picking errors below 1%', progress: 60, dueDate: `${yr}-12-31` },
    { companyId: cid, employeeId: E[7].id, title: 'Grow key-account revenue by 15%', progress: 40, status: 'AT_RISK', dueDate: `${yr}-12-31` },
  ]);
  await db.insert(s.surveys).values({ companyId: cid, title: 'Quarterly pulse check', status: 'OPEN', anonymous: true, questions: [
    { id: 'q1', type: 'rating', label: 'How happy are you at work?' },
    { id: 'q2', type: 'choice', label: 'How is your workload?', options: ['Too light', 'About right', 'Too heavy'] },
    { id: 'q3', type: 'text', label: 'What one thing should we improve?' },
  ] });
  await db.insert(s.serviceRequests).values({ companyId: cid, employeeId: E[4].id, category: 'Employment letter', subject: 'Letter of employment for bank loan', body: 'Hi HR, I need a confirmation letter with my salary for a car loan application. Thank you!' });


  console.log(`✔ Demo company "demo" — logins (password ${DEMO_PASSWORD}): owner@demo.test, hr@demo.test, manager@demo.test, staff@demo.test`);
  console.log('  Tip: generate a payroll run from the web app (Payroll → Generate).');

}

main().catch((e) => { console.error(e); process.exit(1); });
