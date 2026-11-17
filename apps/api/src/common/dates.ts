/** Calendar helpers. Dates are 'YYYY-MM-DD' strings; arithmetic is done in UTC to avoid DST drift. */
export const toDate = (s: string) => new Date(s + 'T00:00:00Z');
export const iso = (d: Date) => d.toISOString().slice(0, 10);
export const monthStart = (period: string) => `${period}-01`;
export const monthEnd = (period: string) => {
  const [y, m] = period.split('-').map(Number);
  return iso(new Date(Date.UTC(y, m, 0)));
};
export const addDays = (s: string, n: number) => { const d = toDate(s); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
export const daysBetween = (a: string, b: string) => Math.round((toDate(b).getTime() - toDate(a).getTime()) / 86400000);

/** Today's date in a timezone (default Asia/Kuala_Lumpur, override with APP_TZ). */
export const todayIn = (tz = process.env.APP_TZ || 'Asia/Kuala_Lumpur', at = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
export const timeIn = (tz = process.env.APP_TZ || 'Asia/Kuala_Lumpur', at = new Date()) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(at);

/**
 * Working days in [from, to], excluding rest days (0 = Sunday … 6 = Saturday) and holidays.
 * When `within` (YYYY-MM) is given, only days in that month are counted.
 */
export function workDays(from: string, to: string, restDays: number[], holidays: Set<string>, within?: string): number {
  if (!from || !to || to < from) return 0;
  let n = 0;
  for (let d = from, guard = 0; d <= to && guard < 1000; d = addDays(d, 1), guard++) {
    if (within && d.slice(0, 7) !== within) continue;
    if (!restDays.includes(toDate(d).getUTCDay()) && !holidays.has(d)) n++;
  }
  return n;
}

/** Great-circle distance in metres. */
export function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000, rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
