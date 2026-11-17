import { DB } from '../../db/db';
import { companies, leaveTypes, memberships, onboardingTemplates, shiftTemplates, statutorySchemes, subscriptions } from '../../db/schema';

/** Default settings for a brand-new company (Malaysian statutory defaults — editable in Settings). */
export async function bootstrapCompany(tx: DB, companyId: string) {
  await tx.insert(statutorySchemes).values([
    { companyId, name: 'EPF', employeeRate: 11, employerRate: 13, wageCap: 0, sortOrder: 0 },
    { companyId, name: 'SOCSO', employeeRate: 0.5, employerRate: 1.75, wageCap: 6000, sortOrder: 1 },
    { companyId, name: 'EIS', employeeRate: 0.2, employerRate: 0.2, wageCap: 6000, sortOrder: 2 },
  ]);
  await tx.insert(leaveTypes).values([
    { companyId, name: 'Annual leave', daysPerYear: 14, paid: true },
    { companyId, name: 'Sick leave', daysPerYear: 14, paid: true },
    { companyId, name: 'Emergency leave', daysPerYear: 3, paid: true },
    { companyId, name: 'Maternity leave', daysPerYear: 98, paid: true },
    { companyId, name: 'Unpaid leave', daysPerYear: 0, paid: false },
  ]);
  await tx.insert(shiftTemplates).values([
    { companyId, name: 'Morning', startTime: '07:00', endTime: '15:00', color: '#e89a2c' },
    { companyId, name: 'Office', startTime: '09:00', endTime: '18:00', color: '#0d6b5c' },
    { companyId, name: 'Night', startTime: '23:00', endTime: '07:00', color: '#5b4bc4' },
  ]);
  await tx.insert(onboardingTemplates).values({
    companyId, name: 'Standard onboarding',
    tasks: [
      { title: 'Sign employment contract', assignee: 'EMPLOYEE', dueDays: 0 },
      { title: 'Submit IC copy, bank and EPF details', assignee: 'EMPLOYEE', dueDays: 1 },
      { title: 'Prepare laptop and accounts', assignee: 'HR', dueDays: 0 },
      { title: 'Register with EPF / SOCSO / EIS', assignee: 'HR', dueDays: 7 },
      { title: 'Team introduction and buddy assigned', assignee: 'MANAGER', dueDays: 1 },
      { title: 'Read the employee handbook', assignee: 'EMPLOYEE', dueDays: 3 },
      { title: 'First-month check-in', assignee: 'MANAGER', dueDays: 30 },
    ],
  });
  await tx.insert(subscriptions).values({ companyId, planCode: 'FREE', status: 'ACTIVE' });
}

export async function createCompany(tx: DB, userId: string, data: { name: string; slug: string }) {
  const [co] = await tx.insert(companies).values({ name: data.name, slug: data.slug }).returning();
  await tx.insert(memberships).values({ userId, companyId: co.id, role: 'OWNER' });
  await bootstrapCompany(tx, co.id);
  return co;
}
