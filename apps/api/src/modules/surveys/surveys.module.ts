import { BadRequestException, Body, Controller, Delete, Get, Injectable, Module, Param, Patch, Post } from '@nestjs/common';
import { createHash } from 'crypto';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { Ctx, CurrentCtx, isAdmin, RequireModule, Roles } from '../../common/context';
import { AccessService, NotifyService } from '../../common/core';
import { deny, must } from '../../common/util';
import { optStr, parse } from '../../common/validate';
import { DB, InjectDb } from '../../db/db';
import { surveyResponses, surveys } from '../../db/schema';

const Q = z.object({ id: z.string().min(1).max(40), type: z.enum(['rating', 'text', 'choice']), label: z.string().trim().min(1).max(300), options: z.array(z.string().trim().min(1).max(120)).max(20).optional() });
const SurveyDto = z.object({ title: z.string().trim().min(2).max(160), description: optStr, questions: z.array(Q).min(1).max(50), anonymous: z.boolean().default(true), status: z.enum(['DRAFT', 'OPEN', 'CLOSED']).default('DRAFT') });

@Injectable()
export class SurveysService {
  constructor(@InjectDb() private db: DB, private access: AccessService, private notify: NotifyService) {}
  private key(c: Ctx, surveyId: string) { return createHash('sha256').update(`${surveyId}:${c.userId}:${process.env.JWT_SECRET}`).digest('hex'); }

  async list(c: Ctx) {
    const rows = await this.db.select().from(surveys).where(and(eq(surveys.companyId, c.companyId), isAdmin(c) ? undefined : inArray(surveys.status, ['OPEN', 'CLOSED']))).orderBy(desc(surveys.createdAt));
    const mine = rows.length ? await this.db.select({ s: surveyResponses.surveyId, k: surveyResponses.respondentKey }).from(surveyResponses).where(inArray(surveyResponses.surveyId, rows.map((r) => r.id))) : [];
    const counts = new Map<string, number>(); mine.forEach((m) => counts.set(m.s, (counts.get(m.s) ?? 0) + 1));
    return rows.map((s) => ({ ...s, responses: counts.get(s.id) ?? 0, answered: mine.some((m) => m.s === s.id && m.k === this.key(c, s.id)) }));
  }

  async create(c: Ctx, b: unknown) {
    const d = parse(SurveyDto, b);
    const [s] = await this.db.insert(surveys).values({ ...d, companyId: c.companyId }).returning();
    if (d.status === 'OPEN') await this.announce(c, s.title);
    return s;
  }
  async update(c: Ctx, id: string, b: unknown) {
    const d = parse(SurveyDto.partial(), b);
    const cur = must(await this.db.query.surveys.findFirst({ where: and(eq(surveys.id, id), eq(surveys.companyId, c.companyId)) }), 'Survey');
    const [s] = await this.db.update(surveys).set(d).where(eq(surveys.id, id)).returning();
    if (d.status === 'OPEN' && cur.status === 'DRAFT') await this.announce(c, s.title);
    return s;
  }
  private async announce(c: Ctx, title: string) {
    await this.notify.send(c.companyId, await this.access.allUserIds(c.companyId), { type: 'survey.open', title: 'New survey', body: title, link: '/surveys' }, c.userId);
  }
  async remove(c: Ctx, id: string) { await this.db.delete(surveys).where(and(eq(surveys.id, id), eq(surveys.companyId, c.companyId))); return { ok: true }; }

  async respond(c: Ctx, id: string, b: unknown) {
    const s = must(await this.db.query.surveys.findFirst({ where: and(eq(surveys.id, id), eq(surveys.companyId, c.companyId)) }), 'Survey');
    if (s.status !== 'OPEN') throw new BadRequestException('This survey is not open');
    const { answers } = parse(z.object({ answers: z.record(z.string(), z.union([z.string().max(5000), z.number()])) }), b);
    for (const q of s.questions) {
      const a = answers[q.id];
      if (a === undefined || a === '') continue;
      if (q.type === 'rating' && !(typeof a === 'number' && a >= 1 && a <= 5)) throw new BadRequestException(`"${q.label}" needs a rating from 1 to 5`);
      if (q.type === 'choice' && !(q.options || []).includes(String(a))) throw new BadRequestException(`"${q.label}" has an invalid choice`);
    }
    const clean = Object.fromEntries(s.questions.filter((q) => answers[q.id] !== undefined && answers[q.id] !== '').map((q) => [q.id, answers[q.id]]));
    try {
      await this.db.insert(surveyResponses).values({ companyId: c.companyId, surveyId: id, respondentKey: this.key(c, id), respondentName: s.anonymous ? null : c.name, answers: clean });
    } catch { throw new BadRequestException('You already answered this survey'); }
    return { ok: true };
  }

  /** Aggregated results: averages and distributions for ratings, counts for choices, text answers listed. */
  async results(c: Ctx, id: string) {
    if (!isAdmin(c)) deny();
    const s = must(await this.db.query.surveys.findFirst({ where: and(eq(surveys.id, id), eq(surveys.companyId, c.companyId)) }), 'Survey');
    const rs = await this.db.select().from(surveyResponses).where(eq(surveyResponses.surveyId, id));
    return {
      survey: s, responses: rs.length,
      questions: s.questions.map((q) => {
        const vals = rs.map((r) => ({ v: r.answers[q.id], who: r.respondentName })).filter((x) => x.v !== undefined);
        if (q.type === 'rating') {
          const nums = vals.map((x) => Number(x.v));
          return { ...q, count: nums.length, average: nums.length ? Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 100) / 100 : null, distribution: [1, 2, 3, 4, 5].map((n) => nums.filter((x) => x === n).length) };
        }
        if (q.type === 'choice') return { ...q, count: vals.length, tally: (q.options || []).map((o) => ({ option: o, count: vals.filter((x) => x.v === o).length })) };
        return { ...q, count: vals.length, answers: vals.map((x) => ({ text: String(x.v), by: x.who })) };
      }),
    };
  }
}

@Controller('surveys')
@RequireModule('surveys')
export class SurveysController {
  constructor(private s: SurveysService) {}
  @Get() list(@CurrentCtx() c: Ctx) { return this.s.list(c); }
  @Roles('OWNER', 'HR') @Post() create(@CurrentCtx() c: Ctx, @Body() b: unknown) { return this.s.create(c, b); }
  @Roles('OWNER', 'HR') @Patch(':id') update(@CurrentCtx() c: Ctx, @Param('id') id: string, @Body() b: unknown) { return this.s.update(c, id, b); }
  @Roles('OWNER', 'HR') @Delete(':id') remove(@CurrentCtx() c: Ctx, @Param('id') id: string) { return this.s.remove(c, id); }
  @Post(':id/responses') respond(@CurrentCtx() c: Ctx, @Param('id') id: string, @Body() b: unknown) { return this.s.respond(c, id, b); }
  @Get(':id/results') results(@CurrentCtx() c: Ctx, @Param('id') id: string) { return this.s.results(c, id); }
}

@Module({ controllers: [SurveysController], providers: [SurveysService] })
export class SurveysModule {}
