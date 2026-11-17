import { BadRequestException, Body, Controller, Delete, Get, Injectable, Module, Param, Patch, Post, Query } from '@nestjs/common';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { Ctx, CurrentCtx, isAdmin, RequireModule, Roles } from '../../common/context';
import { AccessService, NotifyService } from '../../common/core';
import { deny, ids, must } from '../../common/util';
import { optStr, parse, zDate } from '../../common/validate';
import { DB, InjectDb } from '../../db/db';
import { employees, goals, reviewCycles, reviews } from '../../db/schema';

const CycleDto = z.object({ name: z.string().trim().min(2).max(80), startDate: zDate, endDate: zDate, status: z.enum(['DRAFT', 'ACTIVE', 'CLOSED']).default('DRAFT') });
const GoalDto = z.object({ employeeId: z.uuid().nullish(), title: z.string().trim().min(2).max(160), description: optStr, dueDate: zDate.nullish().or(z.literal('').transform(() => null)),
  progress: z.coerce.number().int().min(0).max(100).default(0), status: z.enum(['ON_TRACK', 'AT_RISK', 'BEHIND', 'DONE']).default('ON_TRACK') });
const ReviewDto = z.object({ rating: z.coerce.number().int().min(1).max(5), comment: z.string().trim().max(5000).optional() });

@Injectable()
export class PerformanceService {
  constructor(@InjectDb() private db: DB, private access: AccessService, private notify: NotifyService) {}

  cycles(c: Ctx) { return this.db.select().from(reviewCycles).where(eq(reviewCycles.companyId, c.companyId)).orderBy(desc(reviewCycles.startDate)); }

  async addCycle(c: Ctx, b: unknown) {
    const d = parse(CycleDto, b);
    const [cy] = await this.db.insert(reviewCycles).values({ ...d, companyId: c.companyId }).returning();
    if (d.status === 'ACTIVE') await this.launch(c, cy.id);
    return cy;
  }

  async updateCycle(c: Ctx, id: string, b: unknown) {
    const d = parse(CycleDto.partial(), b);
    const cur = must(await this.db.query.reviewCycles.findFirst({ where: and(eq(reviewCycles.id, id), eq(reviewCycles.companyId, c.companyId)) }), 'Cycle');
    const [cy] = await this.db.update(reviewCycles).set(d).where(eq(reviewCycles.id, id)).returning();
    if (d.status === 'ACTIVE' && cur.status === 'DRAFT') await this.launch(c, id);
    return cy;
  }

  /** Create a review for every active employee and notify them. */
  private async launch(c: Ctx, cycleId: string) {
    const emps = await this.db.select({ id: employees.id }).from(employees).where(and(eq(employees.companyId, c.companyId), eq(employees.status, 'ACTIVE')));
    if (!emps.length) return;
    await this.db.insert(reviews).values(emps.map((e) => ({ companyId: c.companyId, cycleId, employeeId: e.id }))).onConflictDoNothing();
    await this.notify.send(c.companyId, await this.access.userIdsForEmployees(c.companyId, emps.map((e) => e.id)), { type: 'review.started', title: 'Performance review started', body: 'Please complete your self-assessment.', link: '/me/performance' });
  }

  async removeCycle(c: Ctx, id: string) { await this.db.delete(reviewCycles).where(and(eq(reviewCycles.id, id), eq(reviewCycles.companyId, c.companyId))); return { ok: true }; }

  async reviews(c: Ctx, cycleId?: string, mine = false) {
    const vis = mine ? [this.access.self(c)] : await this.access.visibleEmployeeIds(c);
    const rows = await this.db.select({ r: reviews, employeeName: employees.name, designation: employees.designation, managerId: employees.managerId, cycleName: reviewCycles.name, cycleStatus: reviewCycles.status })
      .from(reviews).innerJoin(employees, eq(employees.id, reviews.employeeId)).innerJoin(reviewCycles, eq(reviewCycles.id, reviews.cycleId))
      .where(and(eq(reviews.companyId, c.companyId), cycleId ? eq(reviews.cycleId, cycleId) : undefined, vis ? inArray(reviews.employeeId, ids(vis)) : undefined))
      .orderBy(desc(reviewCycles.startDate), employees.name);
    return rows.map((x) => ({ ...x.r, employeeName: x.employeeName, designation: x.designation, cycleName: x.cycleName, cycleStatus: x.cycleStatus, canManage: isAdmin(c) || (c.employeeId != null && x.managerId === c.employeeId) }));
  }

  async selfReview(c: Ctx, id: string, b: unknown) {
    const d = parse(ReviewDto, b);
    const r = must(await this.db.query.reviews.findFirst({ where: and(eq(reviews.id, id), eq(reviews.companyId, c.companyId)) }), 'Review');
    if (r.employeeId !== c.employeeId) deny('This is not your review');
    if (r.status === 'COMPLETED') throw new BadRequestException('This review is completed');
    const [u] = await this.db.update(reviews).set({ selfRating: d.rating, selfComment: d.comment ?? null, status: 'MANAGER_REVIEW' }).where(eq(reviews.id, id)).returning();
    await this.notify.send(c.companyId, await this.access.approverUserIds(c.companyId, r.employeeId), { type: 'review.self_done', title: `${c.name} completed a self-review`, body: 'Ready for your manager review.', link: '/performance' }, c.userId);
    return u;
  }

  async managerReview(c: Ctx, id: string, b: unknown) {
    const d = parse(ReviewDto, b);
    const r = must(await this.db.query.reviews.findFirst({ where: and(eq(reviews.id, id), eq(reviews.companyId, c.companyId)) }), 'Review');
    if (!(await this.access.canApprove(c, r.employeeId))) deny('Only their manager or HR can review');
    const [u] = await this.db.update(reviews).set({ managerRating: d.rating, managerComment: d.comment ?? null, status: 'COMPLETED' }).where(eq(reviews.id, id)).returning();
    await this.notify.send(c.companyId, await this.access.userIdsForEmployees(c.companyId, [r.employeeId]), { type: 'review.completed', title: 'Your review is complete', body: 'Open it to see your manager’s feedback.', link: '/me/performance' });
    return u;
  }

  async goals(c: Ctx, mine = false, employeeId?: string) {
    const vis = mine ? [this.access.self(c)] : await this.access.visibleEmployeeIds(c);
    const rows = await this.db.select({ g: goals, employeeName: employees.name }).from(goals).innerJoin(employees, eq(employees.id, goals.employeeId))
      .where(and(eq(goals.companyId, c.companyId), vis ? inArray(goals.employeeId, ids(vis)) : undefined, employeeId ? eq(goals.employeeId, employeeId) : undefined)).orderBy(desc(goals.createdAt));
    return rows.map((r) => ({ ...r.g, employeeName: r.employeeName }));
  }

  async addGoal(c: Ctx, b: unknown) {
    const d = parse(GoalDto, b);
    const empId = d.employeeId || this.access.self(c);
    if (empId !== c.employeeId && !(await this.access.canApprove(c, empId))) deny('You can only set goals for yourself or your team');
    const [g] = await this.db.insert(goals).values({ ...d, employeeId: empId, companyId: c.companyId }).returning();
    if (empId !== c.employeeId) await this.notify.send(c.companyId, await this.access.userIdsForEmployees(c.companyId, [empId]), { type: 'goal.assigned', title: 'New goal assigned', body: d.title, link: '/me/performance' });
    return g;
  }

  async updateGoal(c: Ctx, id: string, b: unknown) {
    const d = parse(GoalDto.omit({ employeeId: true }).partial(), b);
    const g = must(await this.db.query.goals.findFirst({ where: and(eq(goals.id, id), eq(goals.companyId, c.companyId)) }), 'Goal');
    if (g.employeeId !== c.employeeId && !(await this.access.canApprove(c, g.employeeId))) deny();
    const [u] = await this.db.update(goals).set({ ...d, status: d.progress === 100 ? 'DONE' : d.status }).where(eq(goals.id, id)).returning();
    return u;
  }

  async removeGoal(c: Ctx, id: string) {
    const g = must(await this.db.query.goals.findFirst({ where: and(eq(goals.id, id), eq(goals.companyId, c.companyId)) }), 'Goal');
    if (g.employeeId !== c.employeeId && !(await this.access.canApprove(c, g.employeeId))) deny();
    await this.db.delete(goals).where(eq(goals.id, id));
    return { ok: true };
  }
}

@Controller('performance')
@RequireModule('performance')
export class PerformanceController {
  constructor(private s: PerformanceService) {}
  @Get('cycles') cycles(@CurrentCtx() c: Ctx) { return this.s.cycles(c); }
  @Roles('OWNER', 'HR') @Post('cycles') add(@CurrentCtx() c: Ctx, @Body() b: unknown) { return this.s.addCycle(c, b); }
  @Roles('OWNER', 'HR') @Patch('cycles/:id') upd(@CurrentCtx() c: Ctx, @Param('id') id: string, @Body() b: unknown) { return this.s.updateCycle(c, id, b); }
  @Roles('OWNER', 'HR') @Delete('cycles/:id') del(@CurrentCtx() c: Ctx, @Param('id') id: string) { return this.s.removeCycle(c, id); }
  @Get('reviews') reviews(@CurrentCtx() c: Ctx, @Query('cycleId') cy?: string, @Query('mine') mine?: string) { return this.s.reviews(c, cy, !!mine); }
  @Post('reviews/:id/self') self(@CurrentCtx() c: Ctx, @Param('id') id: string, @Body() b: unknown) { return this.s.selfReview(c, id, b); }
  @Post('reviews/:id/manager') mgr(@CurrentCtx() c: Ctx, @Param('id') id: string, @Body() b: unknown) { return this.s.managerReview(c, id, b); }
  @Get('goals') goals(@CurrentCtx() c: Ctx, @Query('mine') mine?: string, @Query('employeeId') e?: string) { return this.s.goals(c, !!mine, e); }
  @Post('goals') addGoal(@CurrentCtx() c: Ctx, @Body() b: unknown) { return this.s.addGoal(c, b); }
  @Patch('goals/:id') updGoal(@CurrentCtx() c: Ctx, @Param('id') id: string, @Body() b: unknown) { return this.s.updateGoal(c, id, b); }
  @Delete('goals/:id') delGoal(@CurrentCtx() c: Ctx, @Param('id') id: string) { return this.s.removeGoal(c, id); }
}

@Module({ controllers: [PerformanceController], providers: [PerformanceService] })
export class PerformanceModule {}
