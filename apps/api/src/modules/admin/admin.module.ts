import { Body, Controller, Get, Injectable, Module, Param, Patch, Query } from '@nestjs/common';
import { count, desc, eq, ilike, sql } from "drizzle-orm";
import { z } from 'zod';
import { CurrentCtx, Ctx, SuperAdminOnly } from '../../common/context';
import { AuditService } from '../../common/core';
import { must } from '../../common/util';
import { parse } from '../../common/validate';
import { DB, InjectDb } from '../../db/db';
import { companies, employees, memberships, payments, plans, subscriptions, users } from '../../db/schema';

const UpdateDto = z.object({ status: z.enum(['ACTIVE', 'SUSPENDED']), planCode: z.enum(['FREE', 'PRO', 'BUSINESS']), currentPeriodEnd: z.coerce.date().nullable() }).partial();

/** Platform super-admin: every tenant, plan and payment. */
@Injectable()
export class AdminService {
  constructor(@InjectDb() private db: DB, private audit: AuditService) {}

  async stats() {
    const [[co], [us], [em], subs, [rev]] = await Promise.all([
      this.db.select({ n: count() }).from(companies),
      this.db.select({ n: count() }).from(users),
      this.db.select({ n: count() }).from(employees).where(eq(employees.status, 'ACTIVE')),
      this.db.select({ plan: subscriptions.planCode, n: count(), mrr: sql<number>`sum(${plans.priceMonthly})`.mapWith(Number) }).from(subscriptions).innerJoin(plans, eq(plans.code, subscriptions.planCode))
        .where(sql`${subscriptions.planCode} = 'FREE' or ${subscriptions.currentPeriodEnd} > now()`).groupBy(subscriptions.planCode),
      this.db.select({ total: sql<number>`coalesce(sum(${payments.amount}),0)`.mapWith(Number), last30: sql<number>`coalesce(sum(${payments.amount}) filter (where ${payments.paidAt} > now() - interval '30 days'),0)`.mapWith(Number) })
        .from(payments).where(eq(payments.status, 'PAID')),
    ]);
    return { companies: co.n, users: us.n, activeEmployees: em.n, byPlan: subs, mrr: subs.reduce((s, x) => s + (x.mrr || 0), 0), revenue: rev };
  }

  async companies(q?: string) {
    return this.db.select({
      id: companies.id, name: companies.name, slug: companies.slug, status: companies.status, createdAt: companies.createdAt,
      planCode: subscriptions.planCode, currentPeriodEnd: subscriptions.currentPeriodEnd,
      employees: sql<number>`(select count(*) from ${employees} e where e.company_id = ${companies.id} and e.status = 'ACTIVE')`.mapWith(Number),
      members: sql<number>`(select count(*) from ${memberships} m where m.company_id = ${companies.id} and m.active)`.mapWith(Number),
      owner: sql<string>`(select u.email from ${memberships} m join ${users} u on u.id = m.user_id where m.company_id = ${companies.id} and m.role = 'OWNER' order by m.created_at limit 1)`,
    }).from(companies).leftJoin(subscriptions, eq(subscriptions.companyId, companies.id))
      .where(q ? ilike(companies.name, `%${q}%`) : undefined).orderBy(desc(companies.createdAt)).limit(500);
  }

  async update(c: Ctx, id: string, b: unknown) {
    const d = parse(UpdateDto, b);
    must(await this.db.query.companies.findFirst({ where: eq(companies.id, id) }), 'Company');
    if (d.status) await this.db.update(companies).set({ status: d.status }).where(eq(companies.id, id));
    if (d.planCode || d.currentPeriodEnd !== undefined) {
      const set: Record<string, unknown> = { status: 'ACTIVE' };
      if (d.planCode) set.planCode = d.planCode;
      if (d.currentPeriodEnd !== undefined) set.currentPeriodEnd = d.currentPeriodEnd;
      await this.db.update(subscriptions).set(set).where(eq(subscriptions.companyId, id));
    }
    this.audit.log({ companyId: id, userId: c.userId }, 'admin_update', 'company', id, d);
    return { ok: true };
  }

  payments() {
    return this.db.select({ p: payments, company: companies.name }).from(payments).innerJoin(companies, eq(companies.id, payments.companyId)).orderBy(desc(payments.createdAt)).limit(300)
      .then((r) => r.map((x) => ({ ...x.p, company: x.company })));
  }
}

@Controller('admin')
@SuperAdminOnly()
export class AdminController {
  constructor(private s: AdminService) {}
  @Get('stats') stats() { return this.s.stats(); }
  @Get('companies') companies(@Query('q') q?: string) { return this.s.companies(q); }
  @Patch('companies/:id') update(@CurrentCtx() c: Ctx, @Param('id') id: string, @Body() b: unknown) { return this.s.update(c, id, b); }
  @Get('payments') payments() { return this.s.payments(); }
}

@Module({ controllers: [AdminController], providers: [AdminService] })
export class AdminModule {}
