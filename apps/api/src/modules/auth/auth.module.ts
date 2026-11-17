import { BadRequestException, Body, ConflictException, Controller, Get, Injectable, Module, Param, Post, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Throttle } from '@nestjs/throttler';
import bcrypt from 'bcryptjs';
import { and, eq, gt, isNull, like } from 'drizzle-orm';
import { z } from 'zod';
import { AllowNoCompany, Ctx, CurrentCtx, Public } from '../../common/context';
import { AuditService } from '../../common/core';
import { slugify } from '../../common/util';
import { parse } from '../../common/validate';
import { DB, InjectDb } from '../../db/db';
import { companies, employees, invites, memberships, users } from '../../db/schema';
import { createCompany } from './bootstrap';

const zPassword = z.string().min(8, 'at least 8 characters').max(200);
const RegisterDto = z.object({ companyName: z.string().trim().min(2).max(120), name: z.string().trim().min(2).max(120), email: z.email().toLowerCase(), password: zPassword });
const LoginDto = z.object({ email: z.email().toLowerCase(), password: z.string().min(1) });
const AcceptDto = z.object({ token: z.string().min(10), name: z.string().trim().min(2).max(120).optional(), password: zPassword });

@Injectable()
export class AuthService {
  constructor(@InjectDb() private db: DB, private jwt: JwtService, private audit: AuditService) {}

  sign(userId: string, companyId: string | null) {
    return this.jwt.signAsync({ sub: userId, cid: companyId });
  }

  async uniqueSlug(name: string) {
    const base = slugify(name);
    const taken = await this.db.select({ s: companies.slug }).from(companies).where(like(companies.slug, `${base}%`));
    const set = new Set(taken.map((t) => t.s));
    if (!set.has(base)) return base;
    for (let i = 2; ; i++) if (!set.has(`${base}-${i}`)) return `${base}-${i}`;
  }

  async register(input: unknown) {
    const d = parse(RegisterDto, input);
    if (await this.db.query.users.findFirst({ where: eq(users.email, d.email) })) throw new ConflictException('An account with this email already exists. Sign in instead.');
    const slug = await this.uniqueSlug(d.companyName);
    const { user, co } = await this.db.transaction(async (tx) => {
      const [user] = await tx.insert(users).values({ email: d.email, name: d.name, passwordHash: await bcrypt.hash(d.password, 10) }).returning();
      const co = await createCompany(tx as unknown as DB, user.id, { name: d.companyName, slug });
      return { user, co };
    });
    this.audit.log({ companyId: co.id, userId: user.id }, 'register', 'company', co.id);
    return { token: await this.sign(user.id, co.id) };
  }

  async login(input: unknown) {
    const d = parse(LoginDto, input);
    const user = await this.db.query.users.findFirst({ where: eq(users.email, d.email) });
    if (!user || !(await bcrypt.compare(d.password, user.passwordHash))) throw new UnauthorizedException('Wrong email or password');
    const m = await this.db.query.memberships.findFirst({ where: and(eq(memberships.userId, user.id), eq(memberships.active, true)) });
    return { token: await this.sign(user.id, m?.companyId ?? null) };
  }

  async me(c: Ctx) {
    const list = await this.db.select({ companyId: companies.id, name: companies.name, slug: companies.slug, role: memberships.role, status: companies.status })
      .from(memberships).innerJoin(companies, eq(companies.id, memberships.companyId))
      .where(and(eq(memberships.userId, c.userId), eq(memberships.active, true)));
    const company = c.companyId ? await this.db.query.companies.findFirst({ where: eq(companies.id, c.companyId) }) : null;
    const employee = c.employeeId ? await this.db.query.employees.findFirst({ where: eq(employees.id, c.employeeId), columns: { id: true, code: true, name: true, designation: true } }) : null;
    return {
      user: { id: c.userId, name: c.name, email: c.email, platformRole: c.platformRole },
      company: company && { id: company.id, name: company.name, slug: company.slug, currency: company.currency, status: company.status },
      role: c.role ?? null, employee, plan: c.plan ?? null, modules: c.modules ?? [], memberships: list,
    };
  }

  async switchCompany(c: Ctx, companyId: string) {
    const m = await this.db.query.memberships.findFirst({ where: and(eq(memberships.userId, c.userId), eq(memberships.companyId, companyId), eq(memberships.active, true)) });
    if (!m) throw new BadRequestException('You are not a member of that company');
    return { token: await this.sign(c.userId, companyId) };
  }

  async createAnotherCompany(c: Ctx, name: string) {
    const n = parse(z.string().trim().min(2).max(120), name);
    const slug = await this.uniqueSlug(n);
    const co = await this.db.transaction((tx) => createCompany(tx as unknown as DB, c.userId, { name: n, slug }));
    return { token: await this.sign(c.userId, co.id) };
  }

  async inviteInfo(token: string) {
    const inv = await this.findInvite(token);
    const co = await this.db.query.companies.findFirst({ where: eq(companies.id, inv.companyId) });
    const existing = await this.db.query.users.findFirst({ where: eq(users.email, inv.email) });
    return { email: inv.email, role: inv.role, company: co?.name, hasAccount: !!existing };
  }

  private async findInvite(token: string) {
    const inv = await this.db.query.invites.findFirst({ where: and(eq(invites.token, token), isNull(invites.acceptedAt), gt(invites.expiresAt, new Date())) });
    if (!inv) throw new BadRequestException('This invitation is invalid or has expired');
    return inv;
  }

  async acceptInvite(input: unknown) {
    const d = parse(AcceptDto, input);
    const inv = await this.findInvite(d.token);
    let user = await this.db.query.users.findFirst({ where: eq(users.email, inv.email) });
    if (user) {
      if (!(await bcrypt.compare(d.password, user.passwordHash))) throw new UnauthorizedException('An account with this email exists — enter its password to join.');
    } else {
      if (!d.name) throw new BadRequestException('name: required');
      [user] = await this.db.insert(users).values({ email: inv.email, name: d.name, passwordHash: await bcrypt.hash(d.password, 10) }).returning();
    }
    const u = user!;
    await this.db.transaction(async (tx) => {
      const existing = await tx.query.memberships.findFirst({ where: and(eq(memberships.userId, u.id), eq(memberships.companyId, inv.companyId)) });
      let empId = inv.employeeId;
      if (empId) {
        const linked = await tx.query.memberships.findFirst({ where: eq(memberships.employeeId, empId) });
        if (linked && linked.userId !== u.id) empId = null; // already linked to someone else
      }
      if (existing) await tx.update(memberships).set({ role: inv.role, active: true, employeeId: empId ?? existing.employeeId }).where(eq(memberships.id, existing.id));
      else await tx.insert(memberships).values({ userId: u.id, companyId: inv.companyId, role: inv.role, employeeId: empId });
      await tx.update(invites).set({ acceptedAt: new Date() }).where(eq(invites.id, inv.id));
    });
    this.audit.log({ companyId: inv.companyId, userId: u.id }, 'accept_invite', 'invite', inv.id);
    return { token: await this.sign(u.id, inv.companyId) };
  }

  async changePassword(c: Ctx, input: unknown) {
    const d = parse(z.object({ current: z.string(), next: zPassword }), input);
    const u = await this.db.query.users.findFirst({ where: eq(users.id, c.userId) });
    if (!u || !(await bcrypt.compare(d.current, u.passwordHash))) throw new BadRequestException('Current password is wrong');
    await this.db.update(users).set({ passwordHash: await bcrypt.hash(d.next, 10) }).where(eq(users.id, c.userId));
    return { ok: true };
  }
}

@Controller('auth')
export class AuthController {
  constructor(private s: AuthService) {}

  @Public() @Throttle({ default: { limit: 10, ttl: 60_000 } }) @Post('register') register(@Body() b: unknown) { return this.s.register(b); }
  @Public() @Throttle({ default: { limit: 10, ttl: 60_000 } }) @Post('login') login(@Body() b: unknown) { return this.s.login(b); }
  @Public() @Get('invite/:token') invite(@Param('token') t: string) { return this.s.inviteInfo(t); }
  @Public() @Throttle({ default: { limit: 10, ttl: 60_000 } }) @Post('accept-invite') accept(@Body() b: unknown) { return this.s.acceptInvite(b); }

  @AllowNoCompany() @Get('me') me(@CurrentCtx() c: Ctx) { return this.s.me(c); }
  @AllowNoCompany() @Post('switch') switch(@CurrentCtx() c: Ctx, @Body() b: { companyId: string }) { return this.s.switchCompany(c, b?.companyId); }
  @AllowNoCompany() @Post('companies') create(@CurrentCtx() c: Ctx, @Body() b: { name: string }) { return this.s.createAnotherCompany(c, b?.name); }
  @AllowNoCompany() @Post('password') password(@CurrentCtx() c: Ctx, @Body() b: unknown) { return this.s.changePassword(c, b); }
}

@Module({ controllers: [AuthController], providers: [AuthService], exports: [AuthService] })
export class AuthModule {}
