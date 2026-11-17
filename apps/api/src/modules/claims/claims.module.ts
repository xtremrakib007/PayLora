import { BadRequestException, Body, Controller, Delete, Get, Injectable, Module, Param, Patch, Post, Query } from '@nestjs/common';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { Ctx, CurrentCtx, isAdmin, RequireModule } from '../../common/context';
import { AccessService, NotifyService } from '../../common/core';
import { deny, ids, must } from '../../common/util';
import { optStr, parse, zDate } from '../../common/validate';
import { DB, InjectDb } from '../../db/db';
import { claims, employees } from '../../db/schema';

export const CLAIM_CATEGORIES = ['Travel', 'Mileage', 'Meals', 'Medical', 'Phone & internet', 'Training', 'Office supplies', 'Other'];
const ClaimDto = z.object({
  employeeId: z.uuid().nullish(), category: z.string().trim().min(1).max(60), date: zDate, amount: z.coerce.number().positive().max(1_000_000),
  description: optStr, receiptUrl: z.url().nullish().or(z.literal('').transform(() => null)),
});

@Injectable()
export class ClaimsService {
  constructor(@InjectDb() private db: DB, private access: AccessService, private notify: NotifyService) {}

  async list(c: Ctx, q: { status?: string; mine?: string }) {
    const vis = q.mine ? [this.access.self(c)] : await this.access.visibleEmployeeIds(c);
    return this.db.select({ claim: claims, employeeName: employees.name, employeeCode: employees.code }).from(claims).innerJoin(employees, eq(employees.id, claims.employeeId))
      .where(and(eq(claims.companyId, c.companyId), vis ? inArray(claims.employeeId, ids(vis)) : undefined, q.status ? eq(claims.status, q.status as any) : undefined))
      .orderBy(desc(claims.date)).limit(500)
      .then((rows) => rows.map((r) => ({ ...r.claim, employeeName: r.employeeName, employeeCode: r.employeeCode })));
  }

  async create(c: Ctx, body: unknown) {
    const d = parse(ClaimDto, body);
    const empId = await this.access.actingFor(c, d.employeeId);
    const [r] = await this.db.insert(claims).values({ companyId: c.companyId, employeeId: empId, category: d.category, date: d.date, amount: d.amount, description: d.description ?? null, receiptUrl: d.receiptUrl ?? null }).returning();
    const e = await this.access.employee(c.companyId, empId);
    await this.notify.send(c.companyId, await this.access.approverUserIds(c.companyId, empId), { type: 'claim.submitted', title: `New claim from ${e.name}`, body: `${d.category}: ${d.amount.toFixed(2)}`, link: '/claims' }, c.userId);
    return r;
  }

  async decide(c: Ctx, id: string, body: unknown) {
    const { status } = parse(z.object({ status: z.enum(['APPROVED', 'REJECTED']) }), body);
    const r = must(await this.db.query.claims.findFirst({ where: and(eq(claims.id, id), eq(claims.companyId, c.companyId)) }), 'Claim');
    if (!(await this.access.canApprove(c, r.employeeId))) deny('You cannot approve this claim');
    if (r.status === 'PAID' || r.runId) throw new BadRequestException('This claim is already in a payroll run');
    const [u] = await this.db.update(claims).set({ status, decidedAt: new Date() }).where(eq(claims.id, id)).returning();
    await this.notify.send(c.companyId, await this.access.userIdsForEmployees(c.companyId, [r.employeeId]),
      { type: 'claim.decided', title: `Claim ${status === 'APPROVED' ? 'approved' : 'rejected'}`, body: `${r.category}: ${r.amount.toFixed(2)}${status === 'APPROVED' ? ' — paid with your next salary' : ''}`, link: '/me/claims' });
    return u;
  }

  async remove(c: Ctx, id: string) {
    const r = must(await this.db.query.claims.findFirst({ where: and(eq(claims.id, id), eq(claims.companyId, c.companyId)) }), 'Claim');
    if (!(isAdmin(c) || (r.employeeId === c.employeeId && r.status === 'PENDING'))) deny('Only pending claims can be withdrawn');
    if (r.runId) throw new BadRequestException('This claim is already in a payroll run');
    await this.db.delete(claims).where(eq(claims.id, id));
    return { ok: true };
  }
}

@Controller('claims')
@RequireModule('claims')
export class ClaimsController {
  constructor(private s: ClaimsService) {}
  @Get('categories') cats() { return CLAIM_CATEGORIES; }
  @Get() list(@CurrentCtx() c: Ctx, @Query() q: any) { return this.s.list(c, q); }
  @Post() create(@CurrentCtx() c: Ctx, @Body() b: unknown) { return this.s.create(c, b); }
  @Patch(':id/decision') decide(@CurrentCtx() c: Ctx, @Param('id') id: string, @Body() b: unknown) { return this.s.decide(c, id, b); }
  @Delete(':id') remove(@CurrentCtx() c: Ctx, @Param('id') id: string) { return this.s.remove(c, id); }
}

@Module({ controllers: [ClaimsController], providers: [ClaimsService] })
export class ClaimsModule {}
