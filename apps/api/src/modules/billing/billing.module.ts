import { BadRequestException, Body, Controller, Get, Injectable, Logger, Module, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { and, asc, count, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { Ctx, CurrentCtx, Public, Roles } from '../../common/context';
import { AuditService } from '../../common/core';
import { parse } from '../../common/validate';
import { DB, InjectDb } from '../../db/db';
import { employees, payments, plans, subscriptions, users } from '../../db/schema';
import { createBill, verifyBillplz } from './billplz';

const CheckoutDto = z.object({ planCode: z.enum(['PRO', 'BUSINESS']), months: z.coerce.number().int().refine((m) => [1, 3, 6, 12].includes(m), 'months must be 1, 3, 6 or 12') });
/** Prepaying 12 months gets 2 months free. */
export const priceFor = (monthly: number, months: number) => Math.round(monthly * (months === 12 ? 10 : months) * 100) / 100;

@Injectable()
export class BillingService {
  private log = new Logger('Billing');
  constructor(@InjectDb() private db: DB, private audit: AuditService) {}

  enabled() { return !!process.env.BILLPLZ_API_KEY || process.env.BILLING_DEV_MODE === 'true'; }

  async overview(c: Ctx) {
    const [sub, planList, pays, [{ n }]] = await Promise.all([
      this.db.query.subscriptions.findFirst({ where: eq(subscriptions.companyId, c.companyId) }),
      this.db.select().from(plans).orderBy(asc(plans.sortOrder)),
      this.db.select().from(payments).where(eq(payments.companyId, c.companyId)).orderBy(desc(payments.createdAt)).limit(50),
      this.db.select({ n: count() }).from(employees).where(and(eq(employees.companyId, c.companyId), eq(employees.status, 'ACTIVE'))),
    ]);
    return { subscription: sub, effectivePlan: c.plan, plans: planList, payments: pays, usage: { activeEmployees: n }, billingEnabled: this.enabled(), devMode: process.env.BILLING_DEV_MODE === 'true' };
  }

  async checkout(c: Ctx, b: unknown) {
    const d = parse(CheckoutDto, b);
    if (!this.enabled()) throw new BadRequestException('Online payment is not configured on this server');
    const plan = await this.db.query.plans.findFirst({ where: eq(plans.code, d.planCode) });
    if (!plan) throw new BadRequestException('Unknown plan');
    const amount = priceFor(plan.priceMonthly, d.months);
    const [pay] = await this.db.insert(payments).values({ companyId: c.companyId, planCode: d.planCode, months: d.months, amount, provider: process.env.BILLPLZ_API_KEY ? 'billplz' : 'dev' }).returning();
    if (!process.env.BILLPLZ_API_KEY) {
      await this.markPaid(pay.id);
      return { paid: true, url: null };
    }
    const user = await this.db.query.users.findFirst({ where: eq(users.id, c.userId) });
    const api = process.env.API_URL || 'http://localhost:3000';
    const bill = await createBill({
      email: user!.email, name: user!.name, amountCents: Math.round(amount * 100), reference: pay.id,
      description: `${plan.name} plan — ${d.months} month${d.months > 1 ? 's' : ''}`,
      callbackUrl: `${api}/api/billing/billplz/callback`, redirectUrl: `${api}/api/billing/billplz/return`,
    }).catch((e) => { throw new BadRequestException(`Payment provider error: ${e.message}`); });
    await this.db.update(payments).set({ providerRef: bill.id, url: bill.url }).where(eq(payments.id, pay.id));
    return { paid: false, url: bill.url };
  }

  /** Idempotent: activates (or extends) the subscription for a paid payment. */
  async markPaid(paymentId: string) {
    await this.db.transaction(async (tx) => {
      const [pay] = await tx.select().from(payments).where(eq(payments.id, paymentId)).for('update');
      if (!pay || pay.status === 'PAID') return;
      await tx.update(payments).set({ status: 'PAID', paidAt: new Date() }).where(eq(payments.id, pay.id));
      const sub = await tx.query.subscriptions.findFirst({ where: eq(subscriptions.companyId, pay.companyId) });
      const now = new Date();
      const base = sub && sub.planCode === pay.planCode && sub.currentPeriodEnd && sub.currentPeriodEnd > now ? sub.currentPeriodEnd : now;
      const end = new Date(base); end.setMonth(end.getMonth() + pay.months);
      if (sub) await tx.update(subscriptions).set({ planCode: pay.planCode, status: 'ACTIVE', currentPeriodEnd: end }).where(eq(subscriptions.id, sub.id));
      else await tx.insert(subscriptions).values({ companyId: pay.companyId, planCode: pay.planCode, status: 'ACTIVE', currentPeriodEnd: end });
    });
    this.audit.log(null, 'payment_paid', 'payment', paymentId);
  }

  async handleCallback(body: Record<string, string>) {
    if (!verifyBillplz(body, body.x_signature, process.env.BILLPLZ_X_SIGNATURE_KEY || '')) { this.log.warn('Billplz callback with bad signature'); return false; }
    const pay = await this.db.query.payments.findFirst({ where: eq(payments.providerRef, body.id) });
    if (!pay) return false;
    if (body.paid === 'true') await this.markPaid(pay.id);
    else if (pay.status === 'PENDING') await this.db.update(payments).set({ status: 'FAILED' }).where(eq(payments.id, pay.id));
    return true;
  }

  async handleReturn(q: any) {
    const b = q?.billplz || {};
    const params = { billplzid: b.id, billplzpaid: b.paid, billplzpaid_at: b.paid_at };
    const ok = verifyBillplz(params, b.x_signature, process.env.BILLPLZ_X_SIGNATURE_KEY || '');
    if (ok && b.paid === 'true') {
      const pay = await this.db.query.payments.findFirst({ where: eq(payments.providerRef, String(b.id)) });
      if (pay) await this.markPaid(pay.id);
      return 'paid';
    }
    return ok ? 'failed' : 'unknown';
  }
}

@Controller('billing')
export class BillingController {
  constructor(private s: BillingService) {}
  @Get() overview(@CurrentCtx() c: Ctx) { return this.s.overview(c); }
  @Roles('OWNER') @Post('checkout') checkout(@CurrentCtx() c: Ctx, @Body() b: unknown) { return this.s.checkout(c, b); }

  @Public() @Post('billplz/callback') async callback(@Body() b: Record<string, string>) { await this.s.handleCallback(b || {}); return 'OK'; }
  @Public() @Get('billplz/return') async ret(@Query() q: any, @Res() res: Response) {
    const status = await this.s.handleReturn(q);
    res.redirect(`${process.env.WEB_URL || 'http://localhost:5173'}/billing?payment=${status}`);
  }
}

@Module({ controllers: [BillingController], providers: [BillingService], exports: [BillingService] })
export class BillingModule {}
