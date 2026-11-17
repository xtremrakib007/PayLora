import { Body, Controller, Delete, Get, Injectable, Module, Param, Patch, Post } from '@nestjs/common';
import { and, count, desc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { Ctx, CurrentCtx, isAdmin, RequireModule, Roles } from '../../common/context';
import { AccessService, NotifyService } from '../../common/core';
import { deny, ids, must } from '../../common/util';
import { optStr, parse, zDate } from '../../common/validate';
import { DB, InjectDb } from '../../db/db';
import { courses, employees, enrollments } from '../../db/schema';

const CourseDto = z.object({ title: z.string().trim().min(2).max(160), description: optStr, provider: optStr, durationHours: z.coerce.number().min(0).max(10000).default(0), url: z.url().nullish().or(z.literal('').transform(() => null)) });
const AssignDto = z.object({ employeeIds: z.array(z.uuid()).min(1).max(1000), dueDate: zDate.nullish() });

@Injectable()
export class TrainingService {
  constructor(@InjectDb() private db: DB, private access: AccessService, private notify: NotifyService) {}

  async courses(c: Ctx) {
    const rows = await this.db.select({ c: courses, enrolled: count(enrollments.employeeId), completed: sql<number>`count(*) filter (where ${enrollments.status} = 'COMPLETED')`.mapWith(Number) })
      .from(courses).leftJoin(enrollments, eq(enrollments.courseId, courses.id)).where(eq(courses.companyId, c.companyId)).groupBy(courses.id).orderBy(desc(courses.createdAt));
    return rows.map((r) => ({ ...r.c, enrolled: r.enrolled, completed: r.completed }));
  }
  async addCourse(c: Ctx, b: unknown) { const [r] = await this.db.insert(courses).values({ ...parse(CourseDto, b), companyId: c.companyId }).returning(); return r; }
  async updateCourse(c: Ctx, id: string, b: unknown) { const [r] = await this.db.update(courses).set(parse(CourseDto.partial(), b)).where(and(eq(courses.id, id), eq(courses.companyId, c.companyId))).returning(); return must(r, 'Course'); }
  async removeCourse(c: Ctx, id: string) { await this.db.delete(courses).where(and(eq(courses.id, id), eq(courses.companyId, c.companyId))); return { ok: true }; }

  async assign(c: Ctx, courseId: string, b: unknown) {
    const d = parse(AssignDto, b);
    const course = must(await this.db.query.courses.findFirst({ where: and(eq(courses.id, courseId), eq(courses.companyId, c.companyId)) }), 'Course');
    const valid = (await this.db.select({ id: employees.id }).from(employees).where(and(eq(employees.companyId, c.companyId), inArray(employees.id, d.employeeIds)))).map((e) => e.id);
    if (valid.length) await this.db.insert(enrollments).values(valid.map((employeeId) => ({ companyId: c.companyId, courseId, employeeId, dueDate: d.dueDate ?? null }))).onConflictDoNothing();
    await this.notify.send(c.companyId, await this.access.userIdsForEmployees(c.companyId, valid), { type: 'training.assigned', title: 'New training assigned', body: course.title, link: '/me/training' });
    return { assigned: valid.length };
  }

  async enrollments(c: Ctx, courseId?: string, mine = false) {
    const vis = mine ? [this.access.self(c)] : await this.access.visibleEmployeeIds(c);
    const rows = await this.db.select({ e: enrollments, employeeName: employees.name, course: courses }).from(enrollments)
      .innerJoin(employees, eq(employees.id, enrollments.employeeId)).innerJoin(courses, eq(courses.id, enrollments.courseId))
      .where(and(eq(enrollments.companyId, c.companyId), courseId ? eq(enrollments.courseId, courseId) : undefined, vis ? inArray(enrollments.employeeId, ids(vis)) : undefined));
    return rows.map((r) => ({ ...r.e, employeeName: r.employeeName, course: r.course }));
  }

  async setStatus(c: Ctx, id: string, b: unknown) {
    const { status } = parse(z.object({ status: z.enum(['ASSIGNED', 'IN_PROGRESS', 'COMPLETED']) }), b);
    const e = must(await this.db.query.enrollments.findFirst({ where: and(eq(enrollments.id, id), eq(enrollments.companyId, c.companyId)) }), 'Enrollment');
    if (!(isAdmin(c) || e.employeeId === c.employeeId)) deny();
    const [u] = await this.db.update(enrollments).set({ status, completedAt: status === 'COMPLETED' ? new Date() : null }).where(eq(enrollments.id, id)).returning();
    return u;
  }

  async unassign(c: Ctx, id: string) { await this.db.delete(enrollments).where(and(eq(enrollments.id, id), eq(enrollments.companyId, c.companyId))); return { ok: true }; }
}

@Controller('training')
@RequireModule('training')
export class TrainingController {
  constructor(private s: TrainingService) {}
  @Get('courses') courses(@CurrentCtx() c: Ctx) { return this.s.courses(c); }
  @Roles('OWNER', 'HR') @Post('courses') add(@CurrentCtx() c: Ctx, @Body() b: unknown) { return this.s.addCourse(c, b); }
  @Roles('OWNER', 'HR') @Patch('courses/:id') upd(@CurrentCtx() c: Ctx, @Param('id') id: string, @Body() b: unknown) { return this.s.updateCourse(c, id, b); }
  @Roles('OWNER', 'HR') @Delete('courses/:id') del(@CurrentCtx() c: Ctx, @Param('id') id: string) { return this.s.removeCourse(c, id); }
  @Roles('OWNER', 'HR', 'MANAGER') @Post('courses/:id/assign') assign(@CurrentCtx() c: Ctx, @Param('id') id: string, @Body() b: unknown) { return this.s.assign(c, id, b); }
  @Get('enrollments') list(@CurrentCtx() c: Ctx) { return this.s.enrollments(c); }
  @Get('enrollments/mine') mine(@CurrentCtx() c: Ctx) { return this.s.enrollments(c, undefined, true); }
  @Get('courses/:id/enrollments') byCourse(@CurrentCtx() c: Ctx, @Param('id') id: string) { return this.s.enrollments(c, id); }
  @Patch('enrollments/:id') status(@CurrentCtx() c: Ctx, @Param('id') id: string, @Body() b: unknown) { return this.s.setStatus(c, id, b); }
  @Roles('OWNER', 'HR') @Delete('enrollments/:id') unassign(@CurrentCtx() c: Ctx, @Param('id') id: string) { return this.s.unassign(c, id); }
}

@Module({ controllers: [TrainingController], providers: [TrainingService] })
export class TrainingModule {}
