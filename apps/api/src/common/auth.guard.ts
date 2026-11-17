import { CanActivate, ExecutionContext, ForbiddenException, HttpException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { and, eq } from 'drizzle-orm';
import { DB, InjectDb } from '../db/db';
import { companies, memberships, plans, subscriptions, users } from '../db/schema';
import { Ctx, IS_PUBLIC, MODULE, NO_COMPANY, ROLES, SUPER_ADMIN, Role } from './context';

export type JwtPayload = { sub: string; cid?: string | null };

/**
 * Global guard. Verifies the bearer token, then re-reads the membership, company and
 * subscription on every request so role changes, deactivation and plan expiry apply immediately.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  private freePlan: { code: string; maxEmployees: number; modules: string[] } | null = null;

  constructor(private reflector: Reflector, private jwt: JwtService, @InjectDb() private db: DB) {}

  async canActivate(ec: ExecutionContext): Promise<boolean> {
    const meta = <T>(k: string) => this.reflector.getAllAndOverride<T>(k, [ec.getHandler(), ec.getClass()]);
    if (meta<boolean>(IS_PUBLIC)) return true;

    const req = ec.switchToHttp().getRequest();
    const header: string = req.headers.authorization || '';
    if (!header.startsWith('Bearer ')) throw new UnauthorizedException('Missing token');
    let payload: JwtPayload;
    try { payload = await this.jwt.verifyAsync<JwtPayload>(header.slice(7)); } catch { throw new UnauthorizedException('Invalid or expired token'); }

    const user = await this.db.query.users.findFirst({ where: eq(users.id, payload.sub) });
    if (!user) throw new UnauthorizedException('Account not found');
    const ctx = { userId: user.id, name: user.name, email: user.email, platformRole: user.platformRole } as Ctx;

    if (payload.cid) {
      const [row] = await this.db
        .select({ m: memberships, c: companies, s: subscriptions, p: plans })
        .from(memberships)
        .innerJoin(companies, eq(companies.id, memberships.companyId))
        .leftJoin(subscriptions, eq(subscriptions.companyId, companies.id))
        .leftJoin(plans, eq(plans.code, subscriptions.planCode))
        .where(and(eq(memberships.userId, user.id), eq(memberships.companyId, payload.cid), eq(memberships.active, true)));
      if (row) {
        let plan = row.p ? { code: row.p.code, maxEmployees: row.p.maxEmployees, modules: row.p.modules } : await this.getFree();
        const expired = row.s?.currentPeriodEnd && row.s.currentPeriodEnd.getTime() < Date.now();
        if (plan.code !== 'FREE' && (expired || row.s?.status === 'CANCELED')) plan = await this.getFree();
        Object.assign(ctx, {
          companyId: row.c.id, role: row.m.role as Role, employeeId: row.m.employeeId, plan,
          modules: plan.modules.filter((m) => !row.c.disabledModules.includes(m)),
        });
        if (row.c.status === 'SUSPENDED' && !meta<boolean>(NO_COMPANY)) {
          throw new HttpException({ statusCode: 403, code: 'COMPANY_SUSPENDED', message: 'This company account is suspended. Contact support.' }, 403);
        }
      }
    }
    req.ctx = ctx;

    if (meta<boolean>(SUPER_ADMIN)) {
      if (user.platformRole !== 'SUPER_ADMIN') throw new ForbiddenException('Super-admin only');
      return true;
    }
    if (!ctx.companyId) {
      if (meta<boolean>(NO_COMPANY)) return true;
      throw new HttpException({ statusCode: 403, code: 'NO_COMPANY', message: 'Select or create a company first' }, 403);
    }
    const roles = meta<Role[]>(ROLES);
    if (roles && !roles.includes(ctx.role)) throw new ForbiddenException('Your role cannot do this');
    const mod = meta<string>(MODULE);
    if (mod && !ctx.modules.includes(mod)) {
      throw new HttpException({ statusCode: 403, code: 'MODULE_UNAVAILABLE', module: mod, message: `The ${mod} module isn't enabled for your company. Upgrade your plan or turn it on in Settings.` }, 403);
    }
    return true;
  }

  private async getFree() {
    if (!this.freePlan) {
      const p = await this.db.query.plans.findFirst({ where: eq(plans.code, 'FREE') });
      this.freePlan = p ? { code: p.code, maxEmployees: p.maxEmployees, modules: p.modules } : { code: 'FREE', maxEmployees: 5, modules: [] };
    }
    return this.freePlan;
  }
}
