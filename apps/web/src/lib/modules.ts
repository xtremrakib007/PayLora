import type { IconName } from '../components/Icon';

export type Role = 'OWNER' | 'HR' | 'MANAGER' | 'EMPLOYEE';
export type AppDef = { key: string; module: string; title: string; icon: IconName; bg: string; fg: string; path: string; roles?: Role[]; blurb: string };

/** The app launcher. `module` must be enabled for the company; `roles` limits who sees the tile. */
export const APPS: AppDef[] = [
  { key: 'payroll', module: 'payroll', title: 'Payroll', icon: 'payroll', bg: '#fbe3f1', fg: '#c2338a', path: '/payroll', roles: ['OWNER', 'HR'], blurb: 'Run payroll and issue payslips' },
  { key: 'payslips', module: 'payroll', title: 'Payslips', icon: 'payslip', bg: '#fbe3f1', fg: '#c2338a', path: '/me/payslips', blurb: 'Your monthly payslips' },
  { key: 'jobs', module: 'recruitment', title: 'Job Board', icon: 'jobboard', bg: '#fbe6db', fg: '#c0572b', path: '/recruitment/jobs', roles: ['OWNER', 'HR', 'MANAGER'], blurb: 'Openings and careers page' },
  { key: 'reports', module: 'reporting', title: 'Reporting', icon: 'reporting', bg: '#d9f2ea', fg: '#1f8a68', path: '/reports', roles: ['OWNER', 'HR'], blurb: 'Headcount, payroll, leave' },
  { key: 'leave', module: 'leave', title: 'Leave', icon: 'leave', bg: '#e3e4fb', fg: '#4f52c9', path: '/leave', blurb: 'Requests and balances' },
  { key: 'onboarding', module: 'onboarding', title: 'Onboarding', icon: 'onboarding', bg: '#dde9f8', fg: '#2563b0', path: '/onboarding', blurb: 'New-hire checklists' },
  { key: 'profiles', module: 'profiles', title: 'Profiles', icon: 'profiles', bg: '#fbe6db', fg: '#d0702e', path: '/employees', blurb: 'People directory' },
  { key: 'performance', module: 'performance', title: 'Performance', icon: 'performance', bg: '#d9f2ea', fg: '#1f8a68', path: '/performance', blurb: 'Reviews and goals' },
  { key: 'claims', module: 'claims', title: 'Claims', icon: 'claims', bg: '#fbe3f1', fg: '#c2338a', path: '/claims', blurb: 'Expense reimbursements' },
  { key: 'timesheets', module: 'timesheets', title: 'Timesheets', icon: 'timesheets', bg: '#d9f2ea', fg: '#1f8a68', path: '/timesheets', blurb: 'Hours by project' },
  { key: 'feed', module: 'feed', title: 'Feed', icon: 'feed', bg: '#fbe6db', fg: '#d0702e', path: '/feed', blurb: 'Company news' },
  { key: 'attendance', module: 'attendance', title: 'Attendance', icon: 'attendance', bg: '#e3e4fb', fg: '#4f52c9', path: '/attendance', blurb: 'Clock-in and records' },
  { key: 'recruitment', module: 'recruitment', title: 'Recruitment', icon: 'recruitment', bg: '#fbe6db', fg: '#c0572b', path: '/recruitment', roles: ['OWNER', 'HR', 'MANAGER'], blurb: 'Candidate pipeline' },
  { key: 'training', module: 'training', title: 'Training', icon: 'training', bg: '#dde9f8', fg: '#2563b0', path: '/training', blurb: 'Courses and progress' },
  { key: 'shifts', module: 'shifts', title: 'Shifts', icon: 'shifts', bg: '#d9f2ea', fg: '#1f8a68', path: '/shifts', blurb: 'Roster planning' },
  { key: 'surveys', module: 'surveys', title: 'Surveys', icon: 'surveys', bg: '#fbe6db', fg: '#d0702e', path: '/surveys', blurb: 'Pulse and feedback' },
  { key: 'services', module: 'services', title: 'Services', icon: 'services', bg: '#fbefc9', fg: '#b07a0c', path: '/services', blurb: 'HR helpdesk' },
  { key: 'tasks', module: 'tasks', title: 'Tasks', icon: 'tasks', bg: '#e3e4fb', fg: '#4f52c9', path: '/tasks', blurb: 'To-dos and assignments' },
  { key: 'meetings', module: 'meetings', title: 'Meetings', icon: 'meetings', bg: '#dde9f8', fg: '#2563b0', path: '/meetings', blurb: 'Schedule and invites' },
];

export const MODULE_LABELS: Record<string, string> = {
  profiles: 'Profiles', attendance: 'Attendance', leave: 'Leave', feed: 'Feed', tasks: 'Tasks', meetings: 'Meetings', payroll: 'Payroll & payslips', claims: 'Claims',
  timesheets: 'Timesheets', shifts: 'Shifts', onboarding: 'Onboarding', services: 'Services (helpdesk)', reporting: 'Reporting', recruitment: 'Recruitment & job board',
  performance: 'Performance', training: 'Training', surveys: 'Surveys',
};

export const isAdmin = (r?: string | null) => r === 'OWNER' || r === 'HR';
export const isManager = (r?: string | null) => r === 'OWNER' || r === 'HR' || r === 'MANAGER';
