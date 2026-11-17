import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';

/** Parse input with a zod schema, throwing a 400 with readable messages. */
export function parse<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
  const r = schema.safeParse(input ?? {});
  if (!r.success) {
    throw new BadRequestException(r.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; '));
  }
  return r.data;
}

export const zDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD');
export const zPeriod = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'expected YYYY-MM');
export const zId = z.uuid();
export const zMoney = z.coerce.number().min(0).max(100_000_000);
export const optStr = z.string().trim().max(2000).optional().nullable().transform((v) => (v === '' ? null : v));
