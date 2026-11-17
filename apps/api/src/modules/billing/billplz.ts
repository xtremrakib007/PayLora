import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Billplz X-Signature: every key+value pair (except x_signature) concatenated as "keyvalue",
 * sorted ascending case-insensitively, joined with "|", then HMAC-SHA256 with the X-Signature key.
 */
export function billplzSignature(params: Record<string, unknown>, key: string) {
  const source = Object.keys(params)
    .filter((k) => k !== 'x_signature')
    .map((k) => `${k}${params[k] ?? ''}`)
    .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
    .join('|');
  return createHmac('sha256', key).update(source).digest('hex');
}

export function verifyBillplz(params: Record<string, unknown>, signature: string | undefined, key: string) {
  if (!signature || !key) return false;
  const expected = Buffer.from(billplzSignature(params, key));
  const got = Buffer.from(String(signature));
  return expected.length === got.length && timingSafeEqual(expected, got);
}

export const billplzBase = () => (process.env.BILLPLZ_SANDBOX === 'false' ? 'https://www.billplz.com/api/v3' : 'https://www.billplz-sandbox.com/api/v3');

export async function createBill(input: { email: string; name: string; amountCents: number; description: string; reference: string; callbackUrl: string; redirectUrl: string }) {
  const body = new URLSearchParams({
    collection_id: process.env.BILLPLZ_COLLECTION_ID || '', email: input.email, name: input.name.slice(0, 255), amount: String(input.amountCents),
    callback_url: input.callbackUrl, redirect_url: input.redirectUrl, description: input.description.slice(0, 200), reference_1_label: 'Payment ID', reference_1: input.reference,
  });
  const res = await fetch(`${billplzBase()}/bills`, {
    method: 'POST', body,
    headers: { Authorization: 'Basic ' + Buffer.from(`${process.env.BILLPLZ_API_KEY}:`).toString('base64'), 'content-type': 'application/x-www-form-urlencoded' },
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok || !json?.id) throw new Error(json?.error?.message?.toString?.() || `Billplz error ${res.status}`);
  return { id: json.id as string, url: json.url as string };
}
