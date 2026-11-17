import { BadRequestException, Global, Injectable, Logger, Module } from '@nestjs/common';
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { DB, InjectDb } from '../db/db';
import { auditLogs, companies, employees, holidays, memberships, notifications, pushTokens } from '../db/schema';
import { Ctx, isAdmin } from './context';

/** Who can see / act on which employees. */
@Injectable()
export class AccessService {
  constructor(@InjectDb() private db: DB) {}

  /** Employee ids visible to the caller: null = everyone (Owner/HR). */
  async visibleEmployeeIds(c: Ctx): Promise<string[] | null> {
    if (isAdmin(c)) return null;
    if (!c.employeeId) return [];
    if (c.role === 'MANAGER') {
      const reports = await this.db.select({ id: employees.id }).from(employees)
        .where(and(eq(employees.companyId, c.companyId), eq(employees.managerId, c.employeeId)));
      return [c.employeeId, ...reports.map((r) => r.id)];
    }
    return [c.employeeId];
  }

  /** The caller's own employee id, or 400 when the account isn't linked to an employee profile. */
  self(c: Ctx): string {
    if (!c.employeeId) throw new BadRequestException('Your account is not linked to an employee profile. Ask HR to link it.');
    return c.employeeId;
  }

  /** Employee the caller is acting for: admins may pass any; others only themselves. */
  async actingFor(c: Ctx, employeeId?: string | null): Promise<string> {
    if (employeeId && isAdmin(c)) { await this.employee(c.companyId, employeeId); return employeeId; }
    return this.self(c);
  }

  /** Can the caller approve requests of this employee? Admins: anyone. Managers: direct reports. */
  async canApprove(c: Ctx, employeeId: string): Promise<boolean> {
    if (isAdmin(c)) return true;
    if (c.role !== 'MANAGER' || !c.employeeId || employeeId === c.employeeId) return false;
    const e = await this.db.query.employees.findFirst({ where: and(eq(employees.id, employeeId), eq(employees.companyId, c.companyId)) });
    return e?.managerId === c.employeeId;
  }

  async employee(companyId: string, id: string) {
    const e = await this.db.query.employees.findFirst({ where: and(eq(employees.id, id), eq(employees.companyId, companyId)) });
    if (!e) throw new BadRequestException('Employee not found in this company');
    return e;
  }

  async company(companyId: string) {
    const c = await this.db.query.companies.findFirst({ where: eq(companies.id, companyId) });
    if (!c) throw new BadRequestException('Company not found');
    return c;
  }

  async holidaySet(companyId: string) {
    const rows = await this.db.select({ d: holidays.date }).from(holidays).where(eq(holidays.companyId, companyId));
    return new Set(rows.map((r) => r.d));
  }

  async userIdsForEmployees(companyId: string, employeeIds: string[]) {
    if (!employeeIds.length) return [];
    const rows = await this.db.select({ u: memberships.userId }).from(memberships)
      .where(and(eq(memberships.companyId, companyId), eq(memberships.active, true), inArray(memberships.employeeId, employeeIds)));
    return rows.map((r) => r.u);
  }

  async adminUserIds(companyId: string) {
    const rows = await this.db.select({ u: memberships.userId }).from(memberships)
      .where(and(eq(memberships.companyId, companyId), eq(memberships.active, true), inArray(memberships.role, ['OWNER', 'HR'])));
    return rows.map((r) => r.u);
  }

  /** Users who should hear about a request from this employee: their manager plus HR/Owners. */
  async approverUserIds(companyId: string, employeeId: string) {
    const e = await this.employee(companyId, employeeId);
    const ids = new Set(await this.adminUserIds(companyId));
    if (e.managerId) (await this.userIdsForEmployees(companyId, [e.managerId])).forEach((u) => ids.add(u));
    return [...ids];
  }

  async allUserIds(companyId: string) {
    const rows = await this.db.select({ u: memberships.userId }).from(memberships)
      .where(and(eq(memberships.companyId, companyId), eq(memberships.active, true)));
    return rows.map((r) => r.u);
  }
}

export type NotifyInput = { type: string; title: string; body?: string; link?: string };

/** In-app notifications + Expo push delivery. */
@Injectable()
export class NotifyService {
  private log = new Logger('Notify');
  constructor(@InjectDb() private db: DB) {}

  async send(companyId: string, userIds: string[], n: NotifyInput, exceptUserId?: string) {
    const targets = [...new Set(userIds)].filter((u) => u && u !== exceptUserId);
    if (!targets.length) return;
    await this.db.insert(notifications).values(targets.map((userId) => ({ companyId, userId, ...n })));
    this.push(targets, n).catch((e) => this.log.warn(`push failed: ${e?.message}`));
  }

  private async push(userIds: string[], n: NotifyInput) {
    const toks = await this.db.select().from(pushTokens).where(inArray(pushTokens.userId, userIds));
    if (!toks.length) return;
    const messages = toks.map((t) => ({ to: t.token, title: n.title, body: n.body ?? '', sound: 'default', data: { link: n.link ?? null, type: n.type } }));
    for (let i = 0; i < messages.length; i += 100) {
      const res = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(messages.slice(i, i + 100)),
      });
      const json: any = await res.json().catch(() => null);
      // Drop tokens Expo reports as no longer registered
      (json?.data || []).forEach((r: any, k: number) => {
        if (r?.details?.error === 'DeviceNotRegistered') this.db.delete(pushTokens).where(eq(pushTokens.token, messages[i + k].to)).catch(() => {});
      });
    }
  }

  list(c: Ctx, unreadOnly = false, limit = 50) {
    const where = and(eq(notifications.userId, c.userId), eq(notifications.companyId, c.companyId), unreadOnly ? isNull(notifications.readAt) : undefined);
    return this.db.select().from(notifications).where(where).orderBy(desc(notifications.createdAt)).limit(limit);
  }
}

@Injectable()
export class AuditService {
  constructor(@InjectDb() private db: DB) {}
  log(c: Pick<Ctx, 'companyId' | 'userId'> | null, action: string, entity: string, entityId?: string | null, meta?: unknown) {
    return this.db.insert(auditLogs).values({ companyId: c?.companyId ?? null, userId: c?.userId ?? null, action, entity, entityId: entityId ?? null, meta: meta as any })
      .catch(() => undefined);
  }
}

@Global()
@Module({ providers: [AccessService, NotifyService, AuditService], exports: [AccessService, NotifyService, AuditService] })
export class CoreModule {}
