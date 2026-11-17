import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { ModuleCode } from './plans';

export type Role = 'OWNER' | 'HR' | 'MANAGER' | 'EMPLOYEE';

/** Request context resolved by AuthGuard from the JWT and a fresh membership lookup. */
export interface Ctx {
  userId: string;
  name: string;
  email: string;
  platformRole: 'USER' | 'SUPER_ADMIN';
  companyId: string;
  role: Role;
  employeeId: string | null;
  plan: { code: string; maxEmployees: number; modules: string[] };
  modules: string[]; // modules available to this company right now
}

export const IS_PUBLIC = 'isPublic';
export const ROLES = 'roles';
export const SUPER_ADMIN = 'superAdmin';
export const MODULE = 'module';
export const NO_COMPANY = 'noCompany';

/** Route needs no authentication. */
export const Public = () => SetMetadata(IS_PUBLIC, true);
/** Route needs one of these company roles. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES, roles);
/** Route is for platform super-admins only. */
export const SuperAdminOnly = () => SetMetadata(SUPER_ADMIN, true);
/** Route belongs to a product module (plan + company toggle checked). */
export const RequireModule = (m: ModuleCode) => SetMetadata(MODULE, m);
/** Authenticated route that also works for a user with no company (e.g. super-admin, switch company). */
export const AllowNoCompany = () => SetMetadata(NO_COMPANY, true);

export const CurrentCtx = createParamDecorator((_: unknown, ctx: ExecutionContext): Ctx => ctx.switchToHttp().getRequest().ctx);

export const isAdmin = (c: Ctx) => c.role === 'OWNER' || c.role === 'HR';
