export const C = {
  bg: '#f5f3ee', panel: '#ffffff', ink: '#14201d', muted: '#5f6b68', faint: '#8b9693', line: '#e7e8e3',
  brand: '#0d6b5c', brandDark: '#0a5649', brandLight: '#e3f1ec', side: '#10251f',
  ok: '#1d7f48', okL: '#e3f3e8', warn: '#a76a0c', warnL: '#fbf0d9', bad: '#b93a27', badL: '#fbe7e3', info: '#2357a6', infoL: '#e5edfb',
};
export const TONE: Record<string, [string, string]> = {
  ok: [C.okL, C.ok], warn: [C.warnL, C.warn], bad: [C.badL, C.bad], info: [C.infoL, C.info], brand: [C.brandLight, C.brand], none: ['#eef0ec', C.muted],
};
export const statusTone = (s?: string | null): keyof typeof TONE => {
  const m: Record<string, keyof typeof TONE> = {
    ACTIVE: 'ok', APPROVED: 'ok', PAID: 'ok', COMPLETED: 'ok', DONE: 'ok', OPEN: 'ok', PRESENT: 'ok', ACCEPTED: 'ok', RESOLVED: 'ok', ON_TRACK: 'ok', FINALIZED: 'info',
    PENDING: 'warn', DRAFT: 'warn', TODO: 'warn', ASSIGNED: 'warn', HALF_DAY: 'warn', AT_RISK: 'warn', SELF_REVIEW: 'warn', MEDIUM: 'warn',
    IN_PROGRESS: 'info', LEAVE: 'info', MANAGER_REVIEW: 'info',
    REJECTED: 'bad', ABSENT: 'bad', CANCELLED: 'bad', DECLINED: 'bad', BEHIND: 'bad', HIGH: 'bad',
  };
  return m[s || ''] ?? 'none';
};
