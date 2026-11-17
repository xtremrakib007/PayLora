/**
 * Database schema (Drizzle ORM, PostgreSQL).
 *
 * Multi-tenancy: every tenant-owned table has a `company_id` column and every
 * service query is scoped by the company in the caller's JWT context.
 * Money is stored as numeric(12,2) and read as JS numbers (mode: 'number').
 * Calendar dates are `date` columns read as 'YYYY-MM-DD' strings.
 */
import { sql } from 'drizzle-orm';
import {
  boolean, date, doublePrecision, index, integer, jsonb, numeric, pgEnum, pgTable, primaryKey, text,
  timestamp, uniqueIndex, uuid,
} from 'drizzle-orm/pg-core';

const id = () => uuid('id').primaryKey().defaultRandom();
const companyId = () => uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' });
const money = (name: string) => numeric(name, { precision: 12, scale: 2, mode: 'number' });
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date());

// ───────────── enums ─────────────
export const platformRole = pgEnum('platform_role', ['USER', 'SUPER_ADMIN']);
export const role = pgEnum('role', ['OWNER', 'HR', 'MANAGER', 'EMPLOYEE']);
export const companyStatus = pgEnum('company_status', ['ACTIVE', 'SUSPENDED']);
export const planCode = pgEnum('plan_code', ['FREE', 'PRO', 'BUSINESS']);
export const subStatus = pgEnum('sub_status', ['ACTIVE', 'PAST_DUE', 'CANCELED']);
export const paymentStatus = pgEnum('payment_status', ['PENDING', 'PAID', 'FAILED']);
export const empStatus = pgEnum('emp_status', ['ACTIVE', 'ON_NOTICE', 'RESIGNED', 'TERMINATED', 'INACTIVE']);
export const empType = pgEnum('emp_type', ['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN']);
export const attStatus = pgEnum('att_status', ['PRESENT', 'ABSENT', 'HALF_DAY', 'LEAVE']);
export const approvalStatus = pgEnum('approval_status', ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED']);
export const runStatus = pgEnum('run_status', ['DRAFT', 'FINALIZED', 'PAID']);
export const claimStatus = pgEnum('claim_status', ['PENDING', 'APPROVED', 'REJECTED', 'PAID']);
export const jobStatus = pgEnum('job_status', ['DRAFT', 'OPEN', 'CLOSED']);
export const stage = pgEnum('stage', ['APPLIED', 'SCREENING', 'INTERVIEW', 'OFFER', 'HIRED', 'REJECTED']);
export const cycleStatus = pgEnum('cycle_status', ['DRAFT', 'ACTIVE', 'CLOSED']);
export const reviewStatus = pgEnum('review_status', ['SELF_REVIEW', 'MANAGER_REVIEW', 'COMPLETED']);
export const goalStatus = pgEnum('goal_status', ['ON_TRACK', 'AT_RISK', 'BEHIND', 'DONE']);
export const enrollStatus = pgEnum('enroll_status', ['ASSIGNED', 'IN_PROGRESS', 'COMPLETED']);
export const surveyStatus = pgEnum('survey_status', ['DRAFT', 'OPEN', 'CLOSED']);
export const ticketStatus = pgEnum('ticket_status', ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']);
export const taskStatus = pgEnum('task_status', ['TODO', 'IN_PROGRESS', 'DONE']);
export const priority = pgEnum('priority', ['LOW', 'MEDIUM', 'HIGH']);
export const rsvp = pgEnum('rsvp', ['PENDING', 'ACCEPTED', 'DECLINED']);

// ───────────── platform / tenancy ─────────────
export const users = pgTable('users', {
  id: id(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  name: text('name').notNull(),
  platformRole: platformRole('platform_role').notNull().default('USER'),
  createdAt: createdAt(),
});

export const companies = pgTable('companies', {
  id: id(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  regNo: text('reg_no'),
  address: text('address'),
  email: text('email'),
  phone: text('phone'),
  currency: text('currency').notNull().default('RM'),
  workingDays: integer('working_days').notNull().default(26),
  hoursPerDay: numeric('hours_per_day', { precision: 4, scale: 2, mode: 'number' }).notNull().default(8),
  otRate: numeric('ot_rate', { precision: 4, scale: 2, mode: 'number' }).notNull().default(1.5),
  restDays: integer('rest_days').array().notNull().default(sql`'{0}'::integer[]`),
  workStart: text('work_start').notNull().default('09:00'),
  workEnd: text('work_end').notNull().default('18:00'),
  lateDeduction: boolean('late_deduction').notNull().default(false), // deduct late minutes from pay
  earlyLeaveDeduction: boolean('early_leave_deduction').notNull().default(false), // deduct minutes left before shift end
  lateGraceMinutes: integer('late_grace_minutes').notNull().default(10), // lateness / early leave within grace is ignored
  lateRoundMinutes: integer('late_round_minutes').notNull().default(1), // round each late arrival up to this block
  officeLat: doublePrecision('office_lat'),
  officeLng: doublePrecision('office_lng'),
  geofenceMeters: integer('geofence_meters').notNull().default(0), // 0 = no geofence
  disabledModules: text('disabled_modules').array().notNull().default(sql`'{}'::text[]`),
  status: companyStatus('status').notNull().default('ACTIVE'),
  createdAt: createdAt(),
});

export const memberships = pgTable('memberships', {
  id: id(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  companyId: companyId(),
  role: role('role').notNull(),
  employeeId: uuid('employee_id').unique().references(() => employees.id, { onDelete: 'set null' }),
  active: boolean('active').notNull().default(true),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('memberships_user_company').on(t.userId, t.companyId)]);

export const invites = pgTable('invites', {
  id: id(),
  companyId: companyId(),
  email: text('email').notNull(),
  role: role('role').notNull(),
  employeeId: uuid('employee_id'),
  token: text('token').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }),
  invitedById: uuid('invited_by_id').notNull(),
  createdAt: createdAt(),
}, (t) => [index('invites_company').on(t.companyId)]);

export const plans = pgTable('plans', {
  code: planCode('code').primaryKey(),
  name: text('name').notNull(),
  priceMonthly: money('price_monthly').notNull(),
  maxEmployees: integer('max_employees').notNull(), // 0 = unlimited
  modules: text('modules').array().notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
});

export const subscriptions = pgTable('subscriptions', {
  id: id(),
  companyId: uuid('company_id').notNull().unique().references(() => companies.id, { onDelete: 'cascade' }),
  planCode: planCode('plan_code').notNull().default('FREE'),
  status: subStatus('status').notNull().default('ACTIVE'),
  currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const payments = pgTable('payments', {
  id: id(),
  companyId: companyId(),
  planCode: planCode('plan_code').notNull(),
  months: integer('months').notNull(),
  amount: money('amount').notNull(),
  provider: text('provider').notNull().default('billplz'),
  providerRef: text('provider_ref').unique(),
  url: text('url'),
  status: paymentStatus('status').notNull().default('PENDING'),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [index('payments_company').on(t.companyId)]);

export const auditLogs = pgTable('audit_logs', {
  id: id(),
  companyId: uuid('company_id').references(() => companies.id, { onDelete: 'cascade' }),
  userId: uuid('user_id'),
  action: text('action').notNull(),
  entity: text('entity').notNull(),
  entityId: text('entity_id'),
  meta: jsonb('meta'),
  createdAt: createdAt(),
}, (t) => [index('audit_company_time').on(t.companyId, t.createdAt)]);

// ───────────── core HR ─────────────
export const departments = pgTable('departments', {
  id: id(),
  companyId: companyId(),
  name: text('name').notNull(),
  description: text('description'),
  headId: uuid('head_id'),
}, (t) => [uniqueIndex('departments_company_name').on(t.companyId, t.name)]);

export type Line = { name: string; amount: number };

export const employees = pgTable('employees', {
  id: id(),
  companyId: companyId(),
  code: text('code').notNull(),
  name: text('name').notNull(),
  email: text('email'),
  phone: text('phone'),
  icNo: text('ic_no'),
  dob: date('dob', { mode: 'string' }),
  gender: text('gender'),
  address: text('address'),
  emergencyName: text('emergency_name'),
  emergencyPhone: text('emergency_phone'),
  departmentId: uuid('department_id').references(() => departments.id, { onDelete: 'set null' }),
  managerId: uuid('manager_id'),
  designation: text('designation'),
  type: empType('type').notNull().default('FULL_TIME'),
  status: empStatus('status').notNull().default('ACTIVE'),
  joinDate: date('join_date', { mode: 'string' }).notNull(),
  exitDate: date('exit_date', { mode: 'string' }),
  basicSalary: money('basic_salary').notNull().default(0),
  monthlyTax: money('monthly_tax').notNull().default(0),
  applyStatutory: boolean('apply_statutory').notNull().default(true),
  allowances: jsonb('allowances').$type<Line[]>().notNull().default([]),
  deductions: jsonb('deductions').$type<Line[]>().notNull().default([]),
  bankName: text('bank_name'),
  bankAccount: text('bank_account'),
  epfNo: text('epf_no'),
  taxNo: text('tax_no'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex('employees_company_code').on(t.companyId, t.code), index('employees_company_status').on(t.companyId, t.status)]);

export const statutorySchemes = pgTable('statutory_schemes', {
  id: id(),
  companyId: companyId(),
  name: text('name').notNull(),
  employeeRate: numeric('employee_rate', { precision: 6, scale: 3, mode: 'number' }).notNull(),
  employerRate: numeric('employer_rate', { precision: 6, scale: 3, mode: 'number' }).notNull(),
  wageCap: money('wage_cap').notNull().default(0),
  sortOrder: integer('sort_order').notNull().default(0),
});

export const holidays = pgTable('holidays', {
  id: id(),
  companyId: companyId(),
  date: date('date', { mode: 'string' }).notNull(),
  name: text('name').notNull(),
}, (t) => [uniqueIndex('holidays_company_date').on(t.companyId, t.date)]);

// ───────────── time ─────────────
export type GeoPoint = { lat: number; lng: number; accuracy?: number; distance?: number };

export const attendance = pgTable('attendance', {
  id: id(),
  companyId: companyId(),
  employeeId: uuid('employee_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
  date: date('date', { mode: 'string' }).notNull(),
  status: attStatus('status'),
  clockIn: timestamp('clock_in', { withTimezone: true }),
  clockOut: timestamp('clock_out', { withTimezone: true }),
  clockInLoc: jsonb('clock_in_loc').$type<GeoPoint>(),
  clockOutLoc: jsonb('clock_out_loc').$type<GeoPoint>(),
  late: boolean('late').notNull().default(false),
  lateMinutes: integer('late_minutes').notNull().default(0), // minutes after shift/work start (0 when within grace)
  lateWaived: boolean('late_waived').notNull().default(false), // HR excused this lateness
  earlyMinutes: integer('early_minutes').notNull().default(0), // minutes left before shift/work end
  earlyWaived: boolean('early_waived').notNull().default(false),
  otHours: numeric('ot_hours', { precision: 5, scale: 2, mode: 'number' }).notNull().default(0),
}, (t) => [uniqueIndex('attendance_emp_date').on(t.employeeId, t.date), index('attendance_company_date').on(t.companyId, t.date)]);

export const leaveTypes = pgTable('leave_types', {
  id: id(),
  companyId: companyId(),
  name: text('name').notNull(),
  daysPerYear: integer('days_per_year').notNull().default(0),
  paid: boolean('paid').notNull().default(true),
  active: boolean('active').notNull().default(true),
});

export const leaveRequests = pgTable('leave_requests', {
  id: id(),
  companyId: companyId(),
  employeeId: uuid('employee_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
  leaveTypeId: uuid('leave_type_id').notNull().references(() => leaveTypes.id, { onDelete: 'restrict' }),
  fromDate: date('from_date', { mode: 'string' }).notNull(),
  toDate: date('to_date', { mode: 'string' }).notNull(),
  days: numeric('days', { precision: 5, scale: 1, mode: 'number' }).notNull(),
  reason: text('reason'),
  status: approvalStatus('status').notNull().default('PENDING'),
  decidedById: uuid('decided_by_id'),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [index('leave_company_status').on(t.companyId, t.status)]);

export const timesheets = pgTable('timesheet_entries', {
  id: id(),
  companyId: companyId(),
  employeeId: uuid('employee_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
  date: date('date', { mode: 'string' }).notNull(),
  project: text('project').notNull(),
  task: text('task'),
  hours: numeric('hours', { precision: 5, scale: 2, mode: 'number' }).notNull(),
  notes: text('notes'),
  status: approvalStatus('status').notNull().default('PENDING'),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [index('timesheets_company_date').on(t.companyId, t.date)]);

export const shiftTemplates = pgTable('shift_templates', {
  id: id(),
  companyId: companyId(),
  name: text('name').notNull(),
  startTime: text('start_time').notNull(),
  endTime: text('end_time').notNull(),
  color: text('color').notNull().default('#0d6b5c'),
});

export const shifts = pgTable('shift_assignments', {
  id: id(),
  companyId: companyId(),
  employeeId: uuid('employee_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
  templateId: uuid('template_id').notNull().references(() => shiftTemplates.id, { onDelete: 'cascade' }),
  date: date('date', { mode: 'string' }).notNull(),
  note: text('note'),
}, (t) => [uniqueIndex('shifts_emp_date').on(t.employeeId, t.date), index('shifts_company_date').on(t.companyId, t.date)]);

// ───────────── money ─────────────
export const payrollRuns = pgTable('payroll_runs', {
  id: id(),
  companyId: companyId(),
  period: text('period').notNull(), // YYYY-MM
  status: runStatus('status').notNull().default('DRAFT'),
  createdById: uuid('created_by_id').notNull(),
  finalizedAt: timestamp('finalized_at', { withTimezone: true }),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex('payroll_runs_company_period').on(t.companyId, t.period)]);

export const payslips = pgTable('payslips', {
  id: id(),
  companyId: companyId(),
  runId: uuid('run_id').notNull().references(() => payrollRuns.id, { onDelete: 'cascade' }),
  employeeId: uuid('employee_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
  data: jsonb('data').notNull(), // PayslipData — full breakdown + employee snapshot
  adjustments: jsonb('adjustments').notNull().default({}),
  gross: money('gross').notNull(),
  totalDeductions: money('total_deductions').notNull(),
  net: money('net').notNull(),
  employerCost: money('employer_cost').notNull(),
}, (t) => [uniqueIndex('payslips_run_emp').on(t.runId, t.employeeId), index('payslips_company_emp').on(t.companyId, t.employeeId)]);

export const claims = pgTable('claims', {
  id: id(),
  companyId: companyId(),
  employeeId: uuid('employee_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
  category: text('category').notNull(),
  date: date('date', { mode: 'string' }).notNull(),
  amount: money('amount').notNull(),
  description: text('description'),
  receiptUrl: text('receipt_url'),
  status: claimStatus('status').notNull().default('PENDING'),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
  runId: uuid('run_id').references(() => payrollRuns.id, { onDelete: 'set null' }),
  createdAt: createdAt(),
}, (t) => [index('claims_company_status').on(t.companyId, t.status)]);

// ───────────── hiring ─────────────
export const jobs = pgTable('job_openings', {
  id: id(),
  companyId: companyId(),
  title: text('title').notNull(),
  departmentId: uuid('department_id').references(() => departments.id, { onDelete: 'set null' }),
  location: text('location'),
  type: empType('type').notNull().default('FULL_TIME'),
  salaryRange: text('salary_range'),
  description: text('description').notNull(),
  status: jobStatus('status').notNull().default('DRAFT'),
  createdAt: createdAt(),
}, (t) => [index('jobs_company_status').on(t.companyId, t.status)]);

export const applications = pgTable('applications', {
  id: id(),
  companyId: companyId(),
  jobId: uuid('job_id').notNull().references(() => jobs.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  email: text('email').notNull(),
  phone: text('phone'),
  resumeUrl: text('resume_url'),
  coverLetter: text('cover_letter'),
  stage: stage('stage').notNull().default('APPLIED'),
  rating: integer('rating'),
  notes: text('notes'),
  employeeId: uuid('employee_id'),
  createdAt: createdAt(),
}, (t) => [index('applications_company_stage').on(t.companyId, t.stage)]);

// ───────────── people development ─────────────
export type TplTask = { title: string; assignee: 'HR' | 'EMPLOYEE' | 'MANAGER'; dueDays: number };

export const onboardingTemplates = pgTable('onboarding_templates', {
  id: id(),
  companyId: companyId(),
  name: text('name').notNull(),
  tasks: jsonb('tasks').$type<TplTask[]>().notNull().default([]),
});

export const onboardings = pgTable('onboardings', {
  id: id(),
  companyId: companyId(),
  employeeId: uuid('employee_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  startDate: date('start_date', { mode: 'string' }).notNull(),
  createdAt: createdAt(),
});

export const onboardingTasks = pgTable('onboarding_tasks', {
  id: id(),
  onboardingId: uuid('onboarding_id').notNull().references(() => onboardings.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  assignee: text('assignee').notNull(),
  dueDate: date('due_date', { mode: 'string' }),
  done: boolean('done').notNull().default(false),
  doneAt: timestamp('done_at', { withTimezone: true }),
  sortOrder: integer('sort_order').notNull().default(0),
});

export const reviewCycles = pgTable('review_cycles', {
  id: id(),
  companyId: companyId(),
  name: text('name').notNull(),
  startDate: date('start_date', { mode: 'string' }).notNull(),
  endDate: date('end_date', { mode: 'string' }).notNull(),
  status: cycleStatus('status').notNull().default('DRAFT'),
  createdAt: createdAt(),
});

export const reviews = pgTable('reviews', {
  id: id(),
  companyId: companyId(),
  cycleId: uuid('cycle_id').notNull().references(() => reviewCycles.id, { onDelete: 'cascade' }),
  employeeId: uuid('employee_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
  selfRating: integer('self_rating'),
  selfComment: text('self_comment'),
  managerRating: integer('manager_rating'),
  managerComment: text('manager_comment'),
  status: reviewStatus('status').notNull().default('SELF_REVIEW'),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex('reviews_cycle_emp').on(t.cycleId, t.employeeId)]);

export const goals = pgTable('goals', {
  id: id(),
  companyId: companyId(),
  employeeId: uuid('employee_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description'),
  dueDate: date('due_date', { mode: 'string' }),
  progress: integer('progress').notNull().default(0),
  status: goalStatus('status').notNull().default('ON_TRACK'),
  createdAt: createdAt(),
});

export const courses = pgTable('courses', {
  id: id(),
  companyId: companyId(),
  title: text('title').notNull(),
  description: text('description'),
  provider: text('provider'),
  durationHours: numeric('duration_hours', { precision: 6, scale: 1, mode: 'number' }).notNull().default(0),
  url: text('url'),
  createdAt: createdAt(),
});

export const enrollments = pgTable('enrollments', {
  id: id(),
  companyId: companyId(),
  courseId: uuid('course_id').notNull().references(() => courses.id, { onDelete: 'cascade' }),
  employeeId: uuid('employee_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
  status: enrollStatus('status').notNull().default('ASSIGNED'),
  dueDate: date('due_date', { mode: 'string' }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
}, (t) => [uniqueIndex('enrollments_course_emp').on(t.courseId, t.employeeId)]);

// ───────────── engagement ─────────────
export const posts = pgTable('posts', {
  id: id(),
  companyId: companyId(),
  authorId: uuid('author_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  content: text('content').notNull(),
  pinned: boolean('pinned').notNull().default(false),
  announcement: boolean('announcement').notNull().default(false),
  createdAt: createdAt(),
}, (t) => [index('posts_company_time').on(t.companyId, t.createdAt)]);

export const postComments = pgTable('post_comments', {
  id: id(),
  postId: uuid('post_id').notNull().references(() => posts.id, { onDelete: 'cascade' }),
  authorId: uuid('author_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  content: text('content').notNull(),
  createdAt: createdAt(),
});

export const postReactions = pgTable('post_reactions', {
  postId: uuid('post_id').notNull().references(() => posts.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
}, (t) => [primaryKey({ columns: [t.postId, t.userId] })]);

export type SurveyQuestion = { id: string; type: 'rating' | 'text' | 'choice'; label: string; options?: string[] };

export const surveys = pgTable('surveys', {
  id: id(),
  companyId: companyId(),
  title: text('title').notNull(),
  description: text('description'),
  questions: jsonb('questions').$type<SurveyQuestion[]>().notNull(),
  anonymous: boolean('anonymous').notNull().default(true),
  status: surveyStatus('status').notNull().default('DRAFT'),
  createdAt: createdAt(),
});

export const surveyResponses = pgTable('survey_responses', {
  id: id(),
  companyId: companyId(),
  surveyId: uuid('survey_id').notNull().references(() => surveys.id, { onDelete: 'cascade' }),
  respondentKey: text('respondent_key').notNull(), // hash(userId) — blocks duplicates without storing who
  respondentName: text('respondent_name'), // only when the survey is not anonymous
  answers: jsonb('answers').$type<Record<string, string | number>>().notNull(),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('survey_responses_once').on(t.surveyId, t.respondentKey)]);

export type ThreadMsg = { by: string; name: string; text: string; at: string; staff: boolean };

export const serviceRequests = pgTable('service_requests', {
  id: id(),
  companyId: companyId(),
  employeeId: uuid('employee_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
  category: text('category').notNull(),
  subject: text('subject').notNull(),
  body: text('body').notNull(),
  status: ticketStatus('status').notNull().default('OPEN'),
  thread: jsonb('thread').$type<ThreadMsg[]>().notNull().default([]),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index('services_company_status').on(t.companyId, t.status)]);

// ───────────── work: tasks & meetings ─────────────
export const tasks = pgTable('tasks', {
  id: id(),
  companyId: companyId(),
  title: text('title').notNull(),
  description: text('description'),
  assigneeId: uuid('assignee_id').references(() => employees.id, { onDelete: 'set null' }),
  createdById: uuid('created_by_id').notNull(),
  dueDate: date('due_date', { mode: 'string' }),
  priority: priority('priority').notNull().default('MEDIUM'),
  status: taskStatus('status').notNull().default('TODO'),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [index('tasks_company_assignee').on(t.companyId, t.assigneeId)]);

export const meetings = pgTable('meetings', {
  id: id(),
  companyId: companyId(),
  title: text('title').notNull(),
  description: text('description'),
  location: text('location'),
  onlineUrl: text('online_url'),
  startAt: timestamp('start_at', { withTimezone: true }).notNull(),
  endAt: timestamp('end_at', { withTimezone: true }).notNull(),
  organizerId: uuid('organizer_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  reminderSent: boolean('reminder_sent').notNull().default(false),
  createdAt: createdAt(),
}, (t) => [index('meetings_company_start').on(t.companyId, t.startAt)]);

export const meetingAttendees = pgTable('meeting_attendees', {
  meetingId: uuid('meeting_id').notNull().references(() => meetings.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  response: rsvp('response').notNull().default('PENDING'),
}, (t) => [primaryKey({ columns: [t.meetingId, t.userId] })]);

// ───────────── notifications ─────────────
export const notifications = pgTable('notifications', {
  id: id(),
  companyId: companyId(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  title: text('title').notNull(),
  body: text('body'),
  link: text('link'),
  readAt: timestamp('read_at', { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [index('notifications_user_time').on(t.userId, t.createdAt)]);

export const pushTokens = pgTable('push_tokens', {
  id: id(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  platform: text('platform'),
  createdAt: createdAt(),
});
