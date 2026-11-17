import { BadRequestException, Body, Controller, Delete, Get, Injectable, Module, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { and, count, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { Ctx, CurrentCtx, Public, RequireModule, Roles } from '../../common/context';
import { AccessService, NotifyService } from '../../common/core';
import { todayIn } from '../../common/dates';
import { must } from '../../common/util';
import { optStr, parse, zDate } from '../../common/validate';
import { DB, InjectDb } from '../../db/db';
import { applications, companies, departments, jobs, plans, subscriptions } from '../../db/schema';
import { EmployeesModule, EmployeesService } from '../employees/employees.module';
import { OnboardingModule, OnboardingService } from '../onboarding/onboarding.module';

const JobDto = z.object({
  title: z.string().trim().min(2).max(120), departmentId: z.uuid().nullish().or(z.literal('').transform(() => null)), location: optStr,
  type: z.enum(['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN']), salaryRange: optStr, description: z.string().trim().min(10).max(20000), status: z.enum(['DRAFT', 'OPEN', 'CLOSED']),
});
const ApplyDto = z.object({ name: z.string().trim().min(2).max(120), email: z.email().toLowerCase(), phone: optStr, resumeUrl: z.url().nullish().or(z.literal('').transform(() => null)), coverLetter: z.string().max(5000).nullish() });
const AppUpdateDto = z.object({ stage: z.enum(['APPLIED', 'SCREENING', 'INTERVIEW', 'OFFER', 'HIRED', 'REJECTED']), rating: z.coerce.number().int().min(1).max(5).nullable(), notes: z.string().max(5000).nullable() }).partial();
const HireDto = z.object({ joinDate: zDate.optional(), basicSalary: z.coerce.number().min(0).default(0), startOnboarding: z.boolean().default(true) });

@Injectable()
export class RecruitmentService {
  constructor(@InjectDb() private db: DB, private access: AccessService, private notify: NotifyService, private emps: EmployeesService, private onboarding: OnboardingService) {}

  async jobs(c: Ctx) {
    const rows = await this.db.select({ j: jobs, dept: departments.name, applicants: count(applications.id) }).from(jobs)
      .leftJoin(departments, eq(departments.id, jobs.departmentId)).leftJoin(applications, eq(applications.jobId, jobs.id))
      .where(eq(jobs.companyId, c.companyId)).groupBy(jobs.id, departments.name).orderBy(desc(jobs.createdAt));
    return rows.map((r) => ({ ...r.j, departmentName: r.dept, applicants: r.applicants }));
  }
  async addJob(c: Ctx, b: unknown) { const [r] = await this.db.insert(jobs).values({ ...parse(JobDto, b), companyId: c.companyId }).returning(); return r; }
  async updateJob(c: Ctx, id: string, b: unknown) { const [r] = await this.db.update(jobs).set(parse(JobDto.partial(), b)).where(and(eq(jobs.id, id), eq(jobs.companyId, c.companyId))).returning(); return must(r, 'Job'); }
  async removeJob(c: Ctx, id: string) { await this.db.delete(jobs).where(and(eq(jobs.id, id), eq(jobs.companyId, c.companyId))); return { ok: true }; }

  async applications(c: Ctx, jobId?: string) {
    return this.db.select({ a: applications, jobTitle: jobs.title }).from(applications).innerJoin(jobs, eq(jobs.id, applications.jobId))
      .where(and(eq(applications.companyId, c.companyId), jobId ? eq(applications.jobId, jobId) : undefined)).orderBy(desc(applications.createdAt))
      .then((rows) => rows.map((r) => ({ ...r.a, jobTitle: r.jobTitle })));
  }
  async addApplication(c: Ctx, jobId: string, b: unknown) {
    must(await this.db.query.jobs.findFirst({ where: and(eq(jobs.id, jobId), eq(jobs.companyId, c.companyId)) }), 'Job');
    const [r] = await this.db.insert(applications).values({ ...parse(ApplyDto, b), companyId: c.companyId, jobId }).returning();
    return r;
  }
  async updateApplication(c: Ctx, id: string, b: unknown) {
    const [r] = await this.db.update(applications).set(parse(AppUpdateDto, b)).where(and(eq(applications.id, id), eq(applications.companyId, c.companyId))).returning();
    return must(r, 'Application');
  }

  /** Convert a candidate into an employee (and optionally start onboarding). */
  async hire(c: Ctx, id: string, b: unknown) {
    const d = parse(HireDto, b);
    const a = must(await this.db.query.applications.findFirst({ where: and(eq(applications.id, id), eq(applications.companyId, c.companyId)) }), 'Application');
    if (a.employeeId) throw new BadRequestException('This candidate was already hired');
    const job = await this.db.query.jobs.findFirst({ where: eq(jobs.id, a.jobId) });
    const emp = await this.emps.create(c, {
      name: a.name, email: a.email, phone: a.phone, designation: job?.title, departmentId: job?.departmentId ?? null, type: job?.type ?? 'FULL_TIME', status: 'ACTIVE',
      joinDate: d.joinDate || todayIn(), basicSalary: d.basicSalary, monthlyTax: 0, applyStatutory: true, allowances: [], deductions: [],
    });
    await this.db.update(applications).set({ stage: 'HIRED', employeeId: emp.id }).where(eq(applications.id, id));
    if (d.startOnboarding && c.modules.includes('onboarding')) await this.onboarding.startFor(c, emp.id).catch(() => undefined);
    return emp;
  }

  // ── public careers page (Job Board) ──
  async publicCompany(slug: string) {
    const [row] = await this.db.select({ co: companies, sub: subscriptions, plan: plans }).from(companies)
      .leftJoin(subscriptions, eq(subscriptions.companyId, companies.id)).leftJoin(plans, eq(plans.code, subscriptions.planCode)).where(eq(companies.slug, slug));
    const enabled = row && row.co.status === 'ACTIVE' && row.plan?.modules.includes('recruitment') && !row.co.disabledModules.includes('recruitment')
      && !(row.sub?.currentPeriodEnd && row.sub.currentPeriodEnd.getTime() < Date.now());
    if (!enabled) throw new NotFoundException('Careers page not found');
    return row.co;
  }
  async publicJobs(slug: string) {
    const co = await this.publicCompany(slug);
    const list = await this.db.select({ id: jobs.id, title: jobs.title, location: jobs.location, type: jobs.type, salaryRange: jobs.salaryRange, description: jobs.description, createdAt: jobs.createdAt, department: departments.name })
      .from(jobs).leftJoin(departments, eq(departments.id, jobs.departmentId)).where(and(eq(jobs.companyId, co.id), eq(jobs.status, 'OPEN'))).orderBy(desc(jobs.createdAt));
    return { company: { name: co.name, slug: co.slug }, jobs: list };
  }
  async publicApply(slug: string, jobId: string, b: unknown) {
    const co = await this.publicCompany(slug);
    const job = await this.db.query.jobs.findFirst({ where: and(eq(jobs.id, jobId), eq(jobs.companyId, co.id), eq(jobs.status, 'OPEN')) });
    if (!job) throw new NotFoundException('This job is no longer open');
    const d = parse(ApplyDto, b);
    await this.db.insert(applications).values({ ...d, companyId: co.id, jobId });
    await this.notify.send(co.id, await this.access.adminUserIds(co.id), { type: 'recruitment.applied', title: `New applicant: ${d.name}`, body: job.title, link: '/recruitment' });
    return { ok: true };
  }
}

@Controller('recruitment')
@RequireModule('recruitment')
@Roles('OWNER', 'HR', 'MANAGER')
export class RecruitmentController {
  constructor(private s: RecruitmentService) {}
  @Get('jobs') jobs(@CurrentCtx() c: Ctx) { return this.s.jobs(c); }
  @Roles('OWNER', 'HR') @Post('jobs') add(@CurrentCtx() c: Ctx, @Body() b: unknown) { return this.s.addJob(c, b); }
  @Roles('OWNER', 'HR') @Patch('jobs/:id') upd(@CurrentCtx() c: Ctx, @Param('id') id: string, @Body() b: unknown) { return this.s.updateJob(c, id, b); }
  @Roles('OWNER', 'HR') @Delete('jobs/:id') del(@CurrentCtx() c: Ctx, @Param('id') id: string) { return this.s.removeJob(c, id); }
  @Get('applications') apps(@CurrentCtx() c: Ctx, @Query('jobId') jobId?: string) { return this.s.applications(c, jobId); }
  @Post('jobs/:id/applications') addApp(@CurrentCtx() c: Ctx, @Param('id') id: string, @Body() b: unknown) { return this.s.addApplication(c, id, b); }
  @Patch('applications/:id') updApp(@CurrentCtx() c: Ctx, @Param('id') id: string, @Body() b: unknown) { return this.s.updateApplication(c, id, b); }
  @Roles('OWNER', 'HR') @Post('applications/:id/hire') hire(@CurrentCtx() c: Ctx, @Param('id') id: string, @Body() b: unknown) { return this.s.hire(c, id, b); }
}

/** Public, unauthenticated job board: /api/public/careers/:slug */
@Controller('public/careers')
export class CareersController {
  constructor(private s: RecruitmentService) {}
  @Public() @Get(':slug') list(@Param('slug') slug: string) { return this.s.publicJobs(slug); }
  @Public() @Throttle({ default: { limit: 5, ttl: 60_000 } }) @Post(':slug/jobs/:jobId/apply') apply(@Param('slug') slug: string, @Param('jobId') jobId: string, @Body() b: unknown) { return this.s.publicApply(slug, jobId, b); }
}

@Module({ imports: [EmployeesModule, OnboardingModule], controllers: [RecruitmentController, CareersController], providers: [RecruitmentService] })
export class RecruitmentModule {}
