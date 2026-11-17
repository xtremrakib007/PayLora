import { Body, Controller, Delete, Get, Injectable, Module, Param, Patch, Post, Put } from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { Ctx, CurrentCtx, Roles } from '../../common/context';
import { AuditService } from '../../common/core';
import { MODULES } from '../../common/plans';
import { parse, zDate } from '../../common/validate';
import { DB, InjectDb } from '../../db/db';
import { companies, holidays, leaveTypes, statutorySchemes } from '../../db/schema';

const CompanyDto = z.object({
  name: z.string().trim().min(2).max(120), regNo: z.string().max(80).nullish(), address: z.string().max(400).nullish(),
  email: z.string().max(200).nullish(), phone: z.string().max(60).nullish(), currency: z.string().trim().min(1).max(6),
  workingDays: z.coerce.number().int().min(1).max(31), hoursPerDay: z.coerce.number().min(1).max(24), otRate: z.coerce.number().min(1).max(5),
  restDays: z.array(z.number().int().min(0).max(6)).max(6), workStart: z.string().regex(/^\d{2}:\d{2}$/),
  officeLat: z.coerce.number().min(-90).max(90).nullish(), officeLng: z.coerce.number().min(-180).max(180).nullish(),
  geofenceMeters: z.coerce.number().int().min(0).max(50000), disabledModules: z.array(z.enum(MODULES)),
}).partial();
const StatDto = z.array(z.object({ name: z.string().trim().min(1).max(40), employeeRate: z.coerce.number().min(0).max(100), employerRate: z.coerce.number().min(0).max(100), wageCap: z.coerce.number().min(0) })).max(20);
const LeaveTypeDto = z.object({ name: z.string().trim().min(1).max(60), daysPerYear: z.coerce.number().int().min(0).max(366), paid: z.boolean(), active: z.boolean().default(true) });
const HolidayDto = z.object({ date: zDate, name: z.string().trim().min(1).max(80) });

@Injectable()
export class CompanyService {
  constructor(@InjectDb() private db: DB, private audit: AuditService) {}

  async get(c: Ctx) {
    const co = await this.db.query.companies.findFirst({ where: eq(companies.id, c.companyId) });
    const [stat, lt, hol] = await Promise.all([
      this.db.select().from(statutorySchemes).where(eq(statutorySchemes.companyId, c.companyId)).orderBy(asc(statutorySchemes.sortOrder)),
      this.db.select().from(leaveTypes).where(eq(leaveTypes.companyId, c.companyId)).orderBy(asc(leaveTypes.name)),
      this.db.select().from(holidays).where(eq(holidays.companyId, c.companyId)).orderBy(asc(holidays.date)),
    ]);
    return { company: co, statutory: stat, leaveTypes: lt, holidays: hol, planModules: c.plan.modules, allModules: MODULES };
  }

  async update(c: Ctx, body: unknown) {
    const d = parse(CompanyDto, body);
    const [co] = await this.db.update(companies).set(d).where(eq(companies.id, c.companyId)).returning();
    this.audit.log(c, 'update', 'company', c.companyId, Object.keys(d));
    return co;
  }

  async setStatutory(c: Ctx, body: unknown) {
    const list = parse(StatDto, body);
    await this.db.transaction(async (tx) => {
      await tx.delete(statutorySchemes).where(eq(statutorySchemes.companyId, c.companyId));
      if (list.length) await tx.insert(statutorySchemes).values(list.map((s, i) => ({ ...s, companyId: c.companyId, sortOrder: i })));
    });
    return this.db.select().from(statutorySchemes).where(eq(statutorySchemes.companyId, c.companyId)).orderBy(asc(statutorySchemes.sortOrder));
  }

  leaveTypes(c: Ctx) { return this.db.select().from(leaveTypes).where(eq(leaveTypes.companyId, c.companyId)).orderBy(asc(leaveTypes.name)); }
  async addLeaveType(c: Ctx, b: unknown) { const [r] = await this.db.insert(leaveTypes).values({ ...parse(LeaveTypeDto, b), companyId: c.companyId }).returning(); return r; }
  async updateLeaveType(c: Ctx, id: string, b: unknown) {
    const [r] = await this.db.update(leaveTypes).set(parse(LeaveTypeDto.partial(), b)).where(and(eq(leaveTypes.id, id), eq(leaveTypes.companyId, c.companyId))).returning();
    return r;
  }
  async deleteLeaveType(c: Ctx, id: string) {
    // Leave types with requests are deactivated instead of deleted (FK restrict)
    try { await this.db.delete(leaveTypes).where(and(eq(leaveTypes.id, id), eq(leaveTypes.companyId, c.companyId))); }
    catch { await this.db.update(leaveTypes).set({ active: false }).where(and(eq(leaveTypes.id, id), eq(leaveTypes.companyId, c.companyId))); }
    return { ok: true };
  }

  async addHoliday(c: Ctx, b: unknown) {
    const d = parse(HolidayDto, b);
    const [r] = await this.db.insert(holidays).values({ ...d, companyId: c.companyId })
      .onConflictDoUpdate({ target: [holidays.companyId, holidays.date], set: { name: d.name } }).returning();
    return r;
  }
  async deleteHoliday(c: Ctx, id: string) { await this.db.delete(holidays).where(and(eq(holidays.id, id), eq(holidays.companyId, c.companyId))); return { ok: true }; }
}

@Controller('company')
export class CompanyController {
  constructor(private s: CompanyService) {}
  @Get() get(@CurrentCtx() c: Ctx) { return this.s.get(c); }
  @Roles('OWNER', 'HR') @Patch() update(@CurrentCtx() c: Ctx, @Body() b: unknown) { return this.s.update(c, b); }
  @Roles('OWNER', 'HR') @Put('statutory') stat(@CurrentCtx() c: Ctx, @Body() b: unknown) { return this.s.setStatutory(c, b); }
  @Get('leave-types') lt(@CurrentCtx() c: Ctx) { return this.s.leaveTypes(c); }
  @Roles('OWNER', 'HR') @Post('leave-types') addLt(@CurrentCtx() c: Ctx, @Body() b: unknown) { return this.s.addLeaveType(c, b); }
  @Roles('OWNER', 'HR') @Patch('leave-types/:id') updLt(@CurrentCtx() c: Ctx, @Param('id') id: string, @Body() b: unknown) { return this.s.updateLeaveType(c, id, b); }
  @Roles('OWNER', 'HR') @Delete('leave-types/:id') delLt(@CurrentCtx() c: Ctx, @Param('id') id: string) { return this.s.deleteLeaveType(c, id); }
  @Roles('OWNER', 'HR') @Post('holidays') addHol(@CurrentCtx() c: Ctx, @Body() b: unknown) { return this.s.addHoliday(c, b); }
  @Roles('OWNER', 'HR') @Delete('holidays/:id') delHol(@CurrentCtx() c: Ctx, @Param('id') id: string) { return this.s.deleteHoliday(c, id); }
}

@Module({ controllers: [CompanyController], providers: [CompanyService] })
export class CompanyModule {}
