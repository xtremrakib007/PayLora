import { Body, Controller, Get, Injectable, Module, Param, Patch, Post, Query } from '@nestjs/common';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { Ctx, CurrentCtx, isAdmin, RequireModule } from '../../common/context';
import { AccessService, NotifyService } from '../../common/core';
import { deny, ids, must } from '../../common/util';
import { parse } from '../../common/validate';
import { DB, InjectDb } from '../../db/db';
import { employees, serviceRequests } from '../../db/schema';

export const SERVICE_CATEGORIES = ['Employment letter', 'Salary / payroll query', 'Leave query', 'Benefits & insurance', 'IT & equipment', 'Document update', 'Facilities', 'Other'];
const CreateDto = z.object({ category: z.string().trim().min(1).max(60), subject: z.string().trim().min(3).max(160), body: z.string().trim().min(3).max(5000) });

/** HR helpdesk: employees raise requests, HR replies and resolves. */
@Injectable()
export class ServicesService {
  constructor(@InjectDb() private db: DB, private access: AccessService, private notify: NotifyService) {}

  async list(c: Ctx, q: { status?: string; mine?: string }) {
    const vis = q.mine || !isAdmin(c) ? [this.access.self(c)] : null;
    const rows = await this.db.select({ r: serviceRequests, employeeName: employees.name }).from(serviceRequests).innerJoin(employees, eq(employees.id, serviceRequests.employeeId))
      .where(and(eq(serviceRequests.companyId, c.companyId), vis ? inArray(serviceRequests.employeeId, ids(vis)) : undefined, q.status ? eq(serviceRequests.status, q.status as any) : undefined))
      .orderBy(desc(serviceRequests.updatedAt)).limit(300);
    return rows.map((r) => ({ ...r.r, employeeName: r.employeeName }));
  }

  async create(c: Ctx, b: unknown) {
    const d = parse(CreateDto, b);
    const empId = this.access.self(c);
    const [r] = await this.db.insert(serviceRequests).values({ ...d, companyId: c.companyId, employeeId: empId }).returning();
    await this.notify.send(c.companyId, await this.access.adminUserIds(c.companyId), { type: 'service.new', title: `New request: ${d.subject}`, body: `${c.name} · ${d.category}`, link: '/services' }, c.userId);
    return r;
  }

  private async get(c: Ctx, id: string) {
    const r = must(await this.db.query.serviceRequests.findFirst({ where: and(eq(serviceRequests.id, id), eq(serviceRequests.companyId, c.companyId)) }), 'Request');
    if (!isAdmin(c) && r.employeeId !== c.employeeId) deny();
    return r;
  }

  async reply(c: Ctx, id: string, b: unknown) {
    const { text } = parse(z.object({ text: z.string().trim().min(1).max(5000) }), b);
    const r = await this.get(c, id);
    const staff = isAdmin(c);
    const thread = [...r.thread, { by: c.userId, name: c.name, text, at: new Date().toISOString(), staff }];
    const [u] = await this.db.update(serviceRequests).set({ thread, status: staff && r.status === 'OPEN' ? 'IN_PROGRESS' : r.status === 'RESOLVED' && !staff ? 'OPEN' : r.status }).where(eq(serviceRequests.id, id)).returning();
    const to = staff ? await this.access.userIdsForEmployees(c.companyId, [r.employeeId]) : await this.access.adminUserIds(c.companyId);
    await this.notify.send(c.companyId, to, { type: 'service.reply', title: `Reply on "${r.subject}"`, body: text.slice(0, 120), link: staff ? '/me/services' : '/services' }, c.userId);
    return u;
  }

  async setStatus(c: Ctx, id: string, b: unknown) {
    const { status } = parse(z.object({ status: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']) }), b);
    const r = await this.get(c, id);
    if (!isAdmin(c) && status !== 'CLOSED') deny('You can only close your own request');
    const [u] = await this.db.update(serviceRequests).set({ status }).where(eq(serviceRequests.id, id)).returning();
    if (isAdmin(c) && status === 'RESOLVED') await this.notify.send(c.companyId, await this.access.userIdsForEmployees(c.companyId, [r.employeeId]), { type: 'service.resolved', title: 'Request resolved', body: r.subject, link: '/me/services' });
    return u;
  }
}

@Controller('services')
@RequireModule('services')
export class ServicesController {
  constructor(private s: ServicesService) {}
  @Get('categories') cats() { return SERVICE_CATEGORIES; }
  @Get() list(@CurrentCtx() c: Ctx, @Query() q: any) { return this.s.list(c, q); }
  @Post() create(@CurrentCtx() c: Ctx, @Body() b: unknown) { return this.s.create(c, b); }
  @Post(':id/reply') reply(@CurrentCtx() c: Ctx, @Param('id') id: string, @Body() b: unknown) { return this.s.reply(c, id, b); }
  @Patch(':id/status') status(@CurrentCtx() c: Ctx, @Param('id') id: string, @Body() b: unknown) { return this.s.setStatus(c, id, b); }
}

@Module({ controllers: [ServicesController], providers: [ServicesService] })
export class ServicesModule {}
