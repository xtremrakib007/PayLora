/** Product modules. A company can use a module when its plan includes it and it isn't disabled. */
export const MODULES = [
  'profiles', 'attendance', 'leave', 'feed', 'tasks', 'meetings',
  'payroll', 'claims', 'timesheets', 'shifts', 'onboarding', 'services', 'reporting',
  'recruitment', 'performance', 'training', 'surveys',
] as const;
export type ModuleCode = (typeof MODULES)[number];

export const PLAN_DEFAULTS = [
  { code: 'FREE' as const, name: 'Free', priceMonthly: 0, maxEmployees: 5, sortOrder: 0,
    modules: ['profiles', 'attendance', 'leave', 'feed', 'tasks', 'meetings'] },
  { code: 'PRO' as const, name: 'Pro', priceMonthly: 99, maxEmployees: 50, sortOrder: 1,
    modules: ['profiles', 'attendance', 'leave', 'feed', 'tasks', 'meetings', 'payroll', 'claims', 'timesheets', 'shifts', 'onboarding', 'services', 'reporting'] },
  { code: 'BUSINESS' as const, name: 'Business', priceMonthly: 249, maxEmployees: 0, sortOrder: 2,
    modules: [...MODULES] },
];
