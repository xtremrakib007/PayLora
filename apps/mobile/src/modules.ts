import type { ComponentProps } from 'react';
import type { MaterialCommunityIcons } from '@expo/vector-icons';

export type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];
export type Role = 'OWNER' | 'HR' | 'MANAGER' | 'EMPLOYEE';
export type MobileApp = { key: string; module: string; title: string; icon: IconName; bg: string; fg: string; route: string; roles?: Role[] };

/** Apps shown in the mobile launcher (staff-focused; admin-heavy screens live on the web). */
export const APPS: MobileApp[] = [
  { key: 'payslips', module: 'payroll', title: 'Payslips', icon: 'file-document-outline', bg: '#fbe3f1', fg: '#c2338a', route: '/payslips' },
  { key: 'leave', module: 'leave', title: 'Leave', icon: 'calendar-month', bg: '#e3e4fb', fg: '#4f52c9', route: '/leave' },
  { key: 'attendance', module: 'attendance', title: 'Attendance', icon: 'timer-sand', bg: '#e3e4fb', fg: '#4f52c9', route: '/(tabs)/attendance' },
  { key: 'claims', module: 'claims', title: 'Claims', icon: 'receipt-text-outline', bg: '#fbe3f1', fg: '#c2338a', route: '/claims' },
  { key: 'tasks', module: 'tasks', title: 'Tasks', icon: 'checkbox-marked-outline', bg: '#e3e4fb', fg: '#4f52c9', route: '/(tabs)/tasks' },
  { key: 'meetings', module: 'meetings', title: 'Meetings', icon: 'calendar-account', bg: '#dde9f8', fg: '#2563b0', route: '/(tabs)/meetings' },
  { key: 'shifts', module: 'shifts', title: 'Shifts', icon: 'view-grid-outline', bg: '#d9f2ea', fg: '#1f8a68', route: '/shifts' },
  { key: 'timesheets', module: 'timesheets', title: 'Timesheets', icon: 'clock-outline', bg: '#d9f2ea', fg: '#1f8a68', route: '/timesheets' },
  { key: 'feed', module: 'feed', title: 'Feed', icon: 'newspaper-variant-outline', bg: '#fbe6db', fg: '#d0702e', route: '/feed' },
  { key: 'profiles', module: 'profiles', title: 'Directory', icon: 'account-group', bg: '#fbe6db', fg: '#d0702e', route: '/directory' },
  { key: 'onboarding', module: 'onboarding', title: 'Onboarding', icon: 'door-open', bg: '#dde9f8', fg: '#2563b0', route: '/onboarding' },
  { key: 'performance', module: 'performance', title: 'Performance', icon: 'chart-line', bg: '#d9f2ea', fg: '#1f8a68', route: '/performance' },
  { key: 'training', module: 'training', title: 'Training', icon: 'school-outline', bg: '#dde9f8', fg: '#2563b0', route: '/training' },
  { key: 'surveys', module: 'surveys', title: 'Surveys', icon: 'poll', bg: '#fbe6db', fg: '#d0702e', route: '/surveys' },
  { key: 'services', module: 'services', title: 'Services', icon: 'face-agent', bg: '#fbefc9', fg: '#b07a0c', route: '/services' },
  { key: 'approvals', module: 'leave', title: 'Approvals', icon: 'clipboard-check-outline', bg: '#d9f2ea', fg: '#1f8a68', route: '/approvals', roles: ['OWNER', 'HR', 'MANAGER'] },
];

export const isAdmin = (r?: string | null) => r === 'OWNER' || r === 'HR';
export const isManager = (r?: string | null) => r === 'OWNER' || r === 'HR' || r === 'MANAGER';

/** Map a notification/web link to a mobile route. */
export function routeForLink(link?: string | null): string | null {
  if (!link) return null;
  const map: [RegExp, string][] = [
    [/payslip/, '/payslips'], [/leave/, '/leave'], [/claims/, '/claims'], [/tasks/, '/(tabs)/tasks'], [/meetings/, '/(tabs)/meetings'], [/feed/, '/feed'],
    [/surveys/, '/surveys'], [/services/, '/services'], [/shifts/, '/shifts'], [/timesheets/, '/timesheets'], [/performance/, '/performance'],
    [/training/, '/training'], [/onboarding/, '/onboarding'], [/attendance/, '/(tabs)/attendance'],
  ];
  return map.find(([r]) => r.test(link))?.[1] ?? '/notifications';
}
