import { BadRequestException, Body, Controller, Delete, Get, Injectable, Module, Param, Patch, Post, Query } from '@nestjs/common';
import { and, asc, count, eq, ilike, or, SQL } from 'drizzle-orm';
import { z } from 'zod';
import { Ctx, CurrentCtx, isAdmin, RequireModule, Roles } from '../../common/context';
import { AccessService, AuditService } from '../../common/core';
import { deny, must } from '../../common/util';
import { optStr, parse, zDate, zMoney } from '../../common/validate';
import { DB, InjectDb } from '../../db/db';
import { departments, employees, memberships } from '../../db/schema';

const Line = z.object({ name: z.string().trim().max(60), amount: zMoney });
const EmployeeDto = z.object({
  code: z.string().trim().min(1).max(30), name: z.string().trim().min(2).max(120), email: z.email().toLowerCase().nullish().or(z.literal('').transform(() => null)),
  phone: optStr, icNo: optStr, dob: zDate.nullish().or(z.literal('').transform(() => null)), gender: optStr, address: optStr,
  emergencyName: optStr, emergencyPhone: optStr, departmentId: z.uuid().nullish().or(z.literal('').transform(() => null)),
  managerId: z.uuid().nullish().or(z.literal('').transform(() => null)), designation: optStr,
  type: z.enum(['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN']), status: z.enum(['ACTIVE', 'ON_NOTICE', 'RESIGNED', 'TERMINATED', 'INACTIVE']),
  joinDate: zDate, exitDate: zDate.nullish().or(z.literal('').transform(() => null)),
  basicSalary: zMoney, monthlyTax: zMoney, applyStatutory: z.boolean(),
  allowances: z.array(Line).max(30), deductions: z.array(Line).max(30),
  bankName: optStr, bankAccount: optStr, epfNo: optStr, taxNo: optStr,
});
const SelfDto = z.object({ phone: optStr, address: optStr, emergencyName: optStr, emergencyPhone: optStr });
const DeptDto = z.object({ name: z.string().trim().min(1).max(80), description: optStr, headId: z.uuid().nullish().or(z.literal('').transform(() => null)) });

/** Fields any colleague may see in the directory. */
const directoryCols = {
  id: employees.id, code: employees.code, name: employees.name, email: employees.email, phone: employees.phone,
  designation: employees.designation, departmentId: employees.departmentId, departmentName: departments.name,
  managerId: employees.managerId, status: employees.status, type: employees.type, joinDate: employees.joinDate,
};

@Injectable()
export class EmployeesService {
  constructor(@InjectDb() private db: DB, private access: AccessService, private audit: AuditService) {}

  async list(c: Ctx, q: { q?: string; departmentId?: string; status?: string }) {
    const conds: (SQL | undefined)[] = [eq(employees.companyId, c.companyId)];
    if (q.departmentId) conds.push(eq(employees.departmentId, q.departmentId));
    if (q.status) conds.push(eq(employees.status, q.status as any));
    else if (!isAdmin(c)) conds.push(eq(employees.status, 'ACTIVE'));
    if (q.q) conds.push(or(ilike(employees.name, `%${q.q}%`), ilike(employees.code, `%${q.q}%`), ilike(employees.email, `%${q.q}%`), ilike(employees.designation, `%${q.q}%`)));
    const base = this.db.select(isAdmin(c)
      ? { ...directoryCols, basicSalary: employees.basicSalary, hasAccount: memberships.id }
      : { ...directoryCols, hasAccount: memberships.id })
      .from(employees).leftJoin(departments, eq(departments.id, employees.departmentId)).leftJoin(memberships, eq(memberships.employeeId, employees.id));
    return base.where(and(...conds)).orderBy(asc(employees.name));
  }

  async get(c: Ctx, id: string) {
    const e = must(await this.db.query.employees.findFirst({ where: and(eq(employees.id, id), eq(employees.companyId, c.companyId)) }), 'Employee');
    const full = isAdmin(c) || c.employeeId === id;
    const dept = e.departmentId ? await this.db.query.departments.findFirst({ where: eq(departments.id, e.departmentId) }) : null;
    const manager = e.managerId ? await this.db.query.employees.findFirst({ where: eq(employees.id, e.managerId), columns: { id: true, name: true } }) : null;
    const account = await this.db.query.memberships.findFirst({ where: eq(memberships.employeeId, id), columns: { id: true, role: true } });
    if (full) return { ...e, departmentName: dept?.name ?? null, manager, account };
    const { code, name, email, phone, designation, departmentId, status, type, joinDate, managerId } = e;
    return { id, code, name, email, phone, designation, departmentId, status, type, joinDate, managerId, departmentName: dept?.name ?? null, manager };
  }

  async nextCode(companyId: string) {
    const rows = await this.db.select({ code: employees.code }).from(employees).where(eq(employees.companyId, companyId));
    const n = Math.max(0, ...rows.map((r) => parseInt(r.code.replace(/\D/g, ''), 10) || 0)) + 1;
    return 'EMP-' + String(n).padStart(3, '0');
  }

  private async checkLimit(c: Ctx) {
    if (!c.plan.maxEmployees) return;
    const [{ n }] = await this.db.select({ n: count() }).from(employees).where(and(eq(employees.companyId, c.companyId), eq(employees.status, 'ACTIVE')));
    if (n >= c.plan.maxEmployees) throw new BadRequestException(`Your ${c.plan.code} plan allows ${c.plan.maxEmployees} active employees. Upgrade in Billing to add more.`);
  }

  private async checkRefs(c: Ctx, d: { departmentId?: string | null; managerId?: string | null }, selfId?: string) {
    if (d.departmentId && !(await this.db.query.departments.findFirst({ where: and(eq(departments.id, d.departmentId), eq(departments.companyId, c.companyId)) }))) throw new BadRequestException('Unknown department');
    if (d.managerId) { if (d.managerId === selfId) throw new BadRequestException('An employee cannot manage themselves'); await this.access.employee(c.companyId, d.managerId); }
  }

  async create(c: Ctx, body: any) {
    const d = parse(EmployeeDto, { ...body, code: body?.code || (await this.nextCode(c.companyId)) });
    if (d.status === 'ACTIVE') await this.checkLimit(c);
    await this.checkRefs(c, d);
    if (await this.db.query.employees.findFirst({ where: and(eq(employees.companyId, c.companyId), eq(employees.code, d.code)) })) throw new BadRequestException('Employee code already used');
    const [e] = await this.db.insert(employees).values({ ...d, companyId: c.companyId }).returning();
    this.audit.log(c, 'create', 'employee', e.id);
    return e;
  }

  async update(c: Ctx, id: string, body: unknown) {
    const d = parse(EmployeeDto.partial(), body);
    const cur = must(await this.db.query.employees.findFirst({ where: and(eq(employees.id, id), eq(employees.companyId, c.companyId)) }), 'Employee');
    if (d.status === 'ACTIVE' && cur.status !== 'ACTIVE') await this.checkLimit(c);
    await this.checkRefs(c, d, id);
    if (d.code && d.code !== cur.code && await this.db.query.employees.findFirst({ where: and(eq(employees.companyId, c.companyId), eq(employees.code, d.code)) })) throw new BadRequestException('Employee code already used');
    const [e] = await this.db.update(employees).set(d).where(eq(employees.id, id)).returning();
    this.audit.log(c, 'update', 'employee', id, Object.keys(d));
    return e;
  }

  async remove(c: Ctx, id: string) {
    must(await this.db.query.employees.findFirst({ where: and(eq(employees.id, id), eq(employees.companyId, c.companyId)) }), 'Employee');
    await this.db.delete(employees).where(eq(employees.id, id));
    this.audit.log(c, 'delete', 'employee', id);
    return { ok: true };
  }

  async updateSelf(c: Ctx, body: unknown) {
    const id = this.access.self(c);
    const [e] = await this.db.update(employees).set(parse(SelfDto, body)).where(eq(employees.id, id)).returning();
    return e;
  }

  // departments
  async departments(c: Ctx) {
    const rows = await this.db.select({ id: departments.id, name: departments.name, description: departments.description, headId: departments.headId, staff: count(employees.id) })
      .from(departments).leftJoin(employees, and(eq(employees.departmentId, departments.id), eq(employees.status, 'ACTIVE')))
      .where(eq(departments.companyId, c.companyId)).groupBy(departments.id).orderBy(asc(departments.name));
    return rows;
  }
  async addDept(c: Ctx, b: unknown) {
    const d = parse(DeptDto, b);
    if (d.headId) await this.access.employee(c.companyId, d.headId);
    const [r] = await this.db.insert(departments).values({ ...d, companyId: c.companyId }).returning().catch(() => { throw new BadRequestException('A department with that name exists'); });
    return r;
  }
  async updateDept(c: Ctx, id: string, b: unknown) {
    const d = parse(DeptDto.partial(), b);
    if (d.headId) await this.access.employee(c.companyId, d.headId);
    const [r] = await this.db.update(departments).set(d).where(and(eq(departments.id, id), eq(departments.companyId, c.companyId))).returning();
    return must(r, 'Department');
  }
  async removeDept(c: Ctx, id: string) {
    const [{ n }] = await this.db.select({ n: count() }).from(employees).where(and(eq(employees.departmentId, id), eq(employees.companyId, c.companyId)));
    if (n) throw new BadRequestException(`Move its ${n} employee(s) to another department first`);
    await this.db.delete(departments).where(and(eq(departments.id, id), eq(departments.companyId, c.companyId)));
    return { ok: true };
  }
}

@Controller('employees')
@RequireModule('profiles')
export class EmployeesController {
  constructor(private s: EmployeesService) {}
  @Get() list(@CurrentCtx() c: Ctx, @Query() q: any) { return this.s.list(c, q); }
  @Roles('OWNER', 'HR') @Get('next-code') next(@CurrentCtx() c: Ctx) { return this.s.nextCode(c.companyId).then((code) => ({ code })); }
  @Get(':id') get(@CurrentCtx() c: Ctx, @Param('id') id: string) { return this.s.get(c, id); }
  @Roles('OWNER', 'HR') @Post() create(@CurrentCtx() c: Ctx, @Body() b: unknown) { return this.s.create(c, b); }
  @Roles('OWNER', 'HR') @Patch(':id') update(@CurrentCtx() c: Ctx, @Param('id') id: string, @Body() b: unknown) { return this.s.update(c, id, b); }
  @Roles('OWNER', 'HR') @Delete(':id') remove(@CurrentCtx() c: Ctx, @Param('id') id: string) { return this.s.remove(c, id); }
}

@Controller('departments')
export class DepartmentsController {
  constructor(private s: EmployeesService) {}
  @Get() list(@CurrentCtx() c: Ctx) { return this.s.departments(c); }
  @Roles('OWNER', 'HR') @Post() add(@CurrentCtx() c: Ctx, @Body() b: unknown) { return this.s.addDept(c, b); }
  @Roles('OWNER', 'HR') @Patch(':id') upd(@CurrentCtx() c: Ctx, @Param('id') id: string, @Body() b: unknown) { return this.s.updateDept(c, id, b); }
  @Roles('OWNER', 'HR') @Delete(':id') del(@CurrentCtx() c: Ctx, @Param('id') id: string) { return this.s.removeDept(c, id); }
}

@Controller('me/profile')
export class MyProfileController {
  constructor(private s: EmployeesService, private access: AccessService) {}
  @Get() get(@CurrentCtx() c: Ctx) { return this.s.get(c, this.access.self(c)); }
  @Patch() update(@CurrentCtx() c: Ctx, @Body() b: unknown) { return this.s.updateSelf(c, b); }
}

@Module({ controllers: [EmployeesController, DepartmentsController, MyProfileController], providers: [EmployeesService], exports: [EmployeesService] })
export class EmployeesModule {}
