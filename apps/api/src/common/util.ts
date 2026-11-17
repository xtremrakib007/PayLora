import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';

export const r2 = (n: number) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
export const sum = <T>(a: T[], f: (x: T) => number) => a.reduce((s, x) => s + (Number(f(x)) || 0), 0);
export const token = (bytes = 24) => randomBytes(bytes).toString('base64url');
export const slugify = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-').slice(0, 40) || 'company';

export function must<T>(v: T | undefined | null, what = 'Record'): T {
  if (v === undefined || v === null) throw new NotFoundException(`${what} not found`);
  return v;
}
export function deny(msg = 'You do not have permission to do that'): never {
  throw new ForbiddenException(msg);
}

/** A uuid that matches nothing — keeps `inArray` valid for empty lists. */
export const NONE = '00000000-0000-0000-0000-000000000000';
export const ids = (a: string[]) => (a.length ? a : [NONE]);
