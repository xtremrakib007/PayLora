import { BadRequestException, Body, Controller, Delete, Get, Injectable, Logger, Module, OnModuleDestroy, OnModuleInit, Param, Patch, Post, Query } from '@nestjs/common';
import { and, asc, eq, gte, inArray, lte, or } from 'drizzle-orm';
import { z } from 'zod';
import { Ctx, CurrentCtx, isAdmin, RequireModule } from '../../common/context';
import { NotifyService } from '../../common/core';
import { deny, must } from '../../common/util';
import { optStr, parse } from '../../common/validate';
import { DB, InjectDb } from '../../db/db';
import { meetingAttendees, meetings, memberships, users } from '../../db/schema';

const MeetingDto = z.object({
  title: z.string().trim().min(1).max(200), description: optStr, location: optStr, onlineUrl: z.url().nullish().or(z.literal('').transform(() => null)),
  startAt: z.coerce.date(), endAt: z.coerce.date(), attendeeUserIds: z.array(z.uuid()).max(500).default([]),
});
const fmtTime = (d: Date) => d.toLocaleString('en-GB', { timeZone: process.env.APP_TZ || 'Asia/Kuala_Lumpur', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

@Injectable()
export class MeetingsService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private log = new Logger('Meetings');
  constructor(@InjectDb() private db: DB, private notify: NotifyService) {}

  onModuleInit() {
    if (process.env.DISABLE_JOBS === 'true') return;
    this.timer = setInterval(() => this.sendReminders().catch((e) => this.log.warn(e?.message)), 60_000);
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  /** Push a reminder ~15 minutes before each meeting (runs every minute). */
  async sendReminders() {
    const now = new Date(), soon = new Date(now.getTime() + 15 * 60_000);
    const due = await this.db.select().from(meetings).where(and(eq(meetings.reminderSent, false), gte(meetings.startAt, now), lte(meetings.startAt, soon)));
    for (const m of due) {
      await this.db.update(meetings).set({ reminderSent: true }).where(eq(meetings.id, m.id));
      const att = await this.db.select().from(meetingAttendees).where(and(eq(meetingAttendees.meetingId, m.id), inArray(meetingAttendees.response, ['PENDING', 'ACCEPTED'])));
      await this.notify.send(m.companyId, [m.organizerId, ...att.map((a) => a.userId)], { type: 'meeting.reminder', title: `Starting soon: ${m.title}`, body: `${fmtTime(m.startAt)}${m.location ? ' · ' + m.location : ''}`, link: `/meetings` });
    }
  }

  async list(c: Ctx, from?: string, to?: string, all = false) {
    const f = from ? new Date(from) : new Date(Date.now() - 7 * 86400000), t = to ? new Date(to) : new Date(Date.now() + 60 * 86400000);
    const mineIds = (await this.db.select({ id: meetingAttendees.meetingId }).from(meetingAttendees).where(eq(meetingAttendees.userId, c.userId))).map((r) => r.id);
    const rows = await this.db.select({ m: meetings, organizerName: users.name }).from(meetings).innerJoin(users, eq(users.id, meetings.organizerId))
      .where(and(eq(meetings.companyId, c.companyId), gte(meetings.endAt, f), lte(meetings.startAt, t),
        all && isAdmin(c) ? undefined : or(eq(meetings.organizerId, c.userId), inArray(meetings.id, mineIds.length ? mineIds : ['00000000-0000-0000-0000-000000000000']))))
      .orderBy(asc(meetings.startAt));
    const att = rows.length ? await this.db.select({ a: meetingAttendees, name: users.name }).from(meetingAttendees).innerJoin(users, eq(users.id, meetingAttendees.userId)).where(inArray(meetingAttendees.meetingId, rows.map((r) => r.m.id))) : [];
    return rows.map((r) => {
      const attendees = att.filter((a) => a.a.meetingId === r.m.id).map((a) => ({ userId: a.a.userId, name: a.name, response: a.a.response }));
      return { ...r.m, organizerName: r.organizerName, isOrganizer: r.m.organizerId === c.userId, myResponse: attendees.find((a) => a.userId === c.userId)?.response ?? null, attendees };
    });
  }

  /** People in this company that can be invited. */
  async people(c: Ctx) {
    return this.db.select({ userId: users.id, name: users.name, email: users.email }).from(memberships).innerJoin(users, eq(users.id, memberships.userId))
      .where(and(eq(memberships.companyId, c.companyId), eq(memberships.active, true))).orderBy(asc(users.name));
  }

  private async validAttendees(c: Ctx, ids: string[]) {
    if (!ids.length) return [];
    const ok = await this.db.select({ u: memberships.userId }).from(memberships).where(and(eq(memberships.companyId, c.companyId), eq(memberships.active, true), inArray(memberships.userId, ids)));
    return ok.map((o) => o.u).filter((u) => u !== c.userId);
  }

  async create(c: Ctx, b: unknown) {
    const d = parse(MeetingDto, b);
    if (d.endAt <= d.startAt) throw new BadRequestException('End time must be after start time');
    const attendees = await this.validAttendees(c, d.attendeeUserIds);
    const m = await this.db.transaction(async (tx) => {
      const [m] = await tx.insert(meetings).values({ companyId: c.companyId, title: d.title, description: d.description ?? null, location: d.location ?? null, onlineUrl: d.onlineUrl ?? null, startAt: d.startAt, endAt: d.endAt, organizerId: c.userId }).returning();
      if (attendees.length) await tx.insert(meetingAttendees).values(attendees.map((userId) => ({ meetingId: m.id, userId })));
      return m;
    });
    await this.notify.send(c.companyId, attendees, { type: 'meeting.invite', title: `Meeting invite: ${d.title}`, body: `${fmtTime(d.startAt)} · from ${c.name}`, link: '/meetings' });
    return m;
  }

  async update(c: Ctx, id: string, b: unknown) {
    const d = parse(MeetingDto.partial(), b);
    const m = must(await this.db.query.meetings.findFirst({ where: and(eq(meetings.id, id), eq(meetings.companyId, c.companyId)) }), 'Meeting');
    if (m.organizerId !== c.userId && !isAdmin(c)) deny('Only the organizer can edit this meeting');
    const startAt = d.startAt ?? m.startAt, endAt = d.endAt ?? m.endAt;
    if (endAt <= startAt) throw new BadRequestException('End time must be after start time');
    const { attendeeUserIds, ...rest } = d;
    const timeChanged = startAt.getTime() !== m.startAt.getTime();
    const [u] = await this.db.update(meetings).set({ ...rest, reminderSent: timeChanged ? false : m.reminderSent }).where(eq(meetings.id, id)).returning();
    let current = (await this.db.select().from(meetingAttendees).where(eq(meetingAttendees.meetingId, id))).map((a) => a.userId);
    if (attendeeUserIds) {
      const next = await this.validAttendees(c, attendeeUserIds);
      const add = next.filter((x) => !current.includes(x)), drop = current.filter((x) => !next.includes(x));
      if (drop.length) await this.db.delete(meetingAttendees).where(and(eq(meetingAttendees.meetingId, id), inArray(meetingAttendees.userId, drop)));
      if (add.length) await this.db.insert(meetingAttendees).values(add.map((userId) => ({ meetingId: id, userId })));
      await this.notify.send(c.companyId, add, { type: 'meeting.invite', title: `Meeting invite: ${u.title}`, body: `${fmtTime(u.startAt)} · from ${c.name}`, link: '/meetings' });
      current = next.filter((x) => !add.includes(x));
    }
    if (timeChanged) await this.notify.send(c.companyId, current, { type: 'meeting.updated', title: `Meeting moved: ${u.title}`, body: `Now ${fmtTime(u.startAt)}`, link: '/meetings' }, c.userId);
    return u;
  }

  async remove(c: Ctx, id: string) {
    const m = must(await this.db.query.meetings.findFirst({ where: and(eq(meetings.id, id), eq(meetings.companyId, c.companyId)) }), 'Meeting');
    if (m.organizerId !== c.userId && !isAdmin(c)) deny();
    const att = (await this.db.select().from(meetingAttendees).where(eq(meetingAttendees.meetingId, id))).map((a) => a.userId);
    await this.db.delete(meetings).where(eq(meetings.id, id));
    if (m.startAt > new Date()) await this.notify.send(c.companyId, att, { type: 'meeting.cancelled', title: `Meeting cancelled: ${m.title}`, body: fmtTime(m.startAt), link: '/meetings' }, c.userId);
    return { ok: true };
  }

  async respond(c: Ctx, id: string, b: unknown) {
    const { response } = parse(z.object({ response: z.enum(['ACCEPTED', 'DECLINED']) }), b);
    const m = must(await this.db.query.meetings.findFirst({ where: and(eq(meetings.id, id), eq(meetings.companyId, c.companyId)) }), 'Meeting');
    const r = await this.db.update(meetingAttendees).set({ response }).where(and(eq(meetingAttendees.meetingId, id), eq(meetingAttendees.userId, c.userId))).returning();
    if (!r.length) deny('You are not invited to this meeting');
    await this.notify.send(c.companyId, [m.organizerId], { type: 'meeting.rsvp', title: `${c.name} ${response === 'ACCEPTED' ? 'accepted' : 'declined'}`, body: m.title, link: '/meetings' }, c.userId);
    return { ok: true };
  }
}

@Controller('meetings')
@RequireModule('meetings')
export class MeetingsController {
  constructor(private s: MeetingsService) {}
  @Get() list(@CurrentCtx() c: Ctx, @Query('from') f?: string, @Query('to') t?: string, @Query('all') all?: string) { return this.s.list(c, f, t, !!all); }
  @Get('people') people(@CurrentCtx() c: Ctx) { return this.s.people(c); }
  @Post() create(@CurrentCtx() c: Ctx, @Body() b: unknown) { return this.s.create(c, b); }
  @Patch(':id') update(@CurrentCtx() c: Ctx, @Param('id') id: string, @Body() b: unknown) { return this.s.update(c, id, b); }
  @Delete(':id') remove(@CurrentCtx() c: Ctx, @Param('id') id: string) { return this.s.remove(c, id); }
  @Post(':id/respond') respond(@CurrentCtx() c: Ctx, @Param('id') id: string, @Body() b: unknown) { return this.s.respond(c, id, b); }
}

@Module({ controllers: [MeetingsController], providers: [MeetingsService] })
export class MeetingsModule {}
