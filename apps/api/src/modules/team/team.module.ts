import { BadRequestException, Body, Controller, Delete, Get, Injectable, Module, Param, Patch, Post } from '@nestjs/common';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { Ctx, CurrentCtx, Roles } from '../../common/context';
import { AccessService, AuditService } from '../../common/core';
import { deny, must, token } from '../../common/util';
import { parse } from '../../common/validate';
import { DB, InjectDb } from '../../db/db';
import { employees, invites, memberships, users } from '../../db/schema';

const InviteDto = z.object({ email: z.email().toLowerCase(), role: z.enum(['OWNER', 'HR', 'MANAGER', 'EMPLOYEE']), employeeId: z.uuid().nullish() });
const MemberDto = z.object({ role: z.enum(['OWNER', 'HR', 'MANAGER', 'EMPLOYEE']), active: z.boolean(), employeeId: z.uuid().nullable() }).partial();

@Injectable()
export class TeamService {
  constructor(@InjectDb() private db: DB, private access: AccessService, private audit: AuditService) {}

  members(c: Ctx) {
    return this.db.select({
      id: memberships.id, userId: users.id, name: users.name, email: users.email, role: memberships.role, active: memberships.active,
      employeeId: memberships.employeeId, employeeName: employees.name, employeeCode: employees.code, createdAt: memberships.createdAt,
    }).from(memberships).innerJoin(users, eq(users.id, memberships.userId)).leftJoin(employees, eq(employees.id, memberships.employeeId))
      .where(eq(memberships.companyId, c.companyId)).orderBy(users.name);
  }

  async updateMember(c: Ctx, id: string, body: unknown) {
    const d = parse(MemberDto, body);
    const m = must(await this.db.query.memberships.findFirst({ where: and(eq(memberships.id, id), eq(memberships.companyId, c.companyId)) }), 'Member');
    if (c.role !== 'OWNER' && (m.role === 'OWNER' || d.role === 'OWNER')) deny('Only an owner can change owners');
    if (m.userId === c.userId && (d.active === false || (d.role && d.role !== m.role))) deny('You cannot change your own role or deactivate yourself');
    if (m.role === 'OWNER' && (d.role && d.role !== 'OWNER' || d.active === false)) {
      const owners = await this.db.select().from(memberships).where(and(eq(memberships.companyId, c.companyId), eq(memberships.role, 'OWNER'), eq(memberships.active, true)));
      if (owners.length <= 1) throw new BadRequestException('A company needs at least one active owner');
    }
    if (d.employeeId) {
      await this.access.employee(c.companyId, d.employeeId);
      const taken = await this.db.query.memberships.findFirst({ where: eq(memberships.employeeId, d.employeeId) });
      if (taken && taken.id !== id) throw new BadRequestException('That employee is already linked to another account');
    }
    const [r] = await this.db.update(memberships).set(d).where(eq(memberships.id, id)).returning();
    this.audit.log(c, 'update', 'membership', id, d);
    return r;
  }

  invites(c: Ctx) {
    return this.db.select().from(invites).where(and(eq(invites.companyId, c.companyId), isNull(invites.acceptedAt))).orderBy(desc(invites.createdAt));
  }

  async invite(c: Ctx, body: unknown) {
    const d = parse(InviteDto, body);
    if (d.role === 'OWNER' && c.role !== 'OWNER') deny('Only an owner can invite owners');
    if (d.role === 'EMPLOYEE' && !c.modules.includes('profiles')) deny();
    if (d.employeeId) await this.access.employee(c.companyId, d.employeeId);
    const [inv] = await this.db.insert(invites).values({
      companyId: c.companyId, email: d.email, role: d.role, employeeId: d.employeeId ?? null, token: token(),
      expiresAt: new Date(Date.now() + 14 * 86400000), invitedById: c.userId,
    }).returning();
    this.audit.log(c, 'invite', 'invite', inv.id, { email: d.email, role: d.role });
    return { ...inv, link: `${process.env.WEB_URL || 'http://localhost:5173'}/invite/${inv.token}` };
  }

  /** Invite every employee that has an email and no account yet. */
  async inviteAllEmployees(c: Ctx) {
    const emps = await this.db.select({ id: employees.id, email: employees.email, m: memberships.id }).from(employees)
      .leftJoin(memberships, eq(memberships.employeeId, employees.id))
      .where(and(eq(employees.companyId, c.companyId), eq(employees.status, 'ACTIVE')));
    const pending = new Set((await this.invites(c)).map((i) => i.email));
    const out = [];
    for (const e of emps) if (e.email && !e.m && !pending.has(e.email.toLowerCase())) out.push(await this.invite(c, { email: e.email, role: 'EMPLOYEE', employeeId: e.id }));
    return { created: out.length, invites: out };
  }

  async revoke(c: Ctx, id: string) { await this.db.delete(invites).where(and(eq(invites.id, id), eq(invites.companyId, c.companyId))); return { ok: true }; }
}

@Controller('team')
@Roles('OWNER', 'HR')
export class TeamController {
  constructor(private s: TeamService) {}
  @Get('members') members(@CurrentCtx() c: Ctx) { return this.s.members(c); }
  @Patch('members/:id') upd(@CurrentCtx() c: Ctx, @Param('id') id: string, @Body() b: unknown) { return this.s.updateMember(c, id, b); }
  @Get('invites') invites(@CurrentCtx() c: Ctx) { return this.s.invites(c); }
  @Post('invites') invite(@CurrentCtx() c: Ctx, @Body() b: unknown) { return this.s.invite(c, b); }
  @Post('invites/all-employees') all(@CurrentCtx() c: Ctx) { return this.s.inviteAllEmployees(c); }
  @Delete('invites/:id') revoke(@CurrentCtx() c: Ctx, @Param('id') id: string) { return this.s.revoke(c, id); }
}

@Module({ controllers: [TeamController], providers: [TeamService] })
export class TeamModule {}
