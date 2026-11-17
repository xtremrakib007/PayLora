import { Body, Controller, Delete, Get, Injectable, Module, Param, Post, Query } from '@nestjs/common';
import { and, asc, desc, eq, inArray, lt, sql } from 'drizzle-orm';
import { z } from 'zod';
import { Ctx, CurrentCtx, isAdmin, RequireModule } from '../../common/context';
import { AccessService, NotifyService } from '../../common/core';
import { deny, must } from '../../common/util';
import { parse } from '../../common/validate';
import { DB, InjectDb } from '../../db/db';
import { postComments, postReactions, posts, users } from '../../db/schema';

const PostDto = z.object({ content: z.string().trim().min(1).max(5000), announcement: z.boolean().default(false), pinned: z.boolean().default(false) });

@Injectable()
export class FeedService {
  constructor(@InjectDb() private db: DB, private access: AccessService, private notify: NotifyService) {}

  async list(c: Ctx, before?: string) {
    const rows = await this.db.select({
      p: posts, authorName: users.name,
      likes: sql<number>`(select count(*) from ${postReactions} r where r.post_id = ${posts.id})`.mapWith(Number),
      liked: sql<boolean>`exists(select 1 from ${postReactions} r where r.post_id = ${posts.id} and r.user_id = ${c.userId})`,
      comments: sql<number>`(select count(*) from ${postComments} pc where pc.post_id = ${posts.id})`.mapWith(Number),
    }).from(posts).innerJoin(users, eq(users.id, posts.authorId))
      .where(and(eq(posts.companyId, c.companyId), before ? lt(posts.createdAt, new Date(before)) : undefined))
      .orderBy(desc(posts.pinned), desc(posts.createdAt)).limit(30);
    const ids = rows.map((r) => r.p.id);
    const cm = ids.length ? await this.db.select({ c: postComments, authorName: users.name }).from(postComments).innerJoin(users, eq(users.id, postComments.authorId)).where(inArray(postComments.postId, ids)).orderBy(asc(postComments.createdAt)) : [];
    return rows.map((r) => ({ ...r.p, authorName: r.authorName, likes: r.likes, liked: !!r.liked, commentCount: r.comments, mine: r.p.authorId === c.userId,
      comments: cm.filter((x) => x.c.postId === r.p.id).slice(-5).map((x) => ({ ...x.c, authorName: x.authorName })) }));
  }

  async create(c: Ctx, b: unknown) {
    const d = parse(PostDto, b);
    if ((d.announcement || d.pinned) && !isAdmin(c)) deny('Only HR can post announcements');
    const [p] = await this.db.insert(posts).values({ ...d, companyId: c.companyId, authorId: c.userId }).returning();
    if (d.announcement) await this.notify.send(c.companyId, await this.access.allUserIds(c.companyId), { type: 'feed.announcement', title: `📣 Announcement from ${c.name}`, body: d.content.slice(0, 140), link: '/feed' }, c.userId);
    return p;
  }

  async remove(c: Ctx, id: string) {
    const p = must(await this.db.query.posts.findFirst({ where: and(eq(posts.id, id), eq(posts.companyId, c.companyId)) }), 'Post');
    if (p.authorId !== c.userId && !isAdmin(c)) deny();
    await this.db.delete(posts).where(eq(posts.id, id));
    return { ok: true };
  }

  async like(c: Ctx, id: string) {
    const p = must(await this.db.query.posts.findFirst({ where: and(eq(posts.id, id), eq(posts.companyId, c.companyId)) }), 'Post');
    const del = await this.db.delete(postReactions).where(and(eq(postReactions.postId, p.id), eq(postReactions.userId, c.userId))).returning();
    if (!del.length) await this.db.insert(postReactions).values({ postId: p.id, userId: c.userId }).onConflictDoNothing();
    return { liked: !del.length };
  }

  async comment(c: Ctx, id: string, b: unknown) {
    const { content } = parse(z.object({ content: z.string().trim().min(1).max(2000) }), b);
    const p = must(await this.db.query.posts.findFirst({ where: and(eq(posts.id, id), eq(posts.companyId, c.companyId)) }), 'Post');
    const [cm] = await this.db.insert(postComments).values({ postId: p.id, authorId: c.userId, content }).returning();
    await this.notify.send(c.companyId, [p.authorId], { type: 'feed.comment', title: `${c.name} commented on your post`, body: content.slice(0, 120), link: '/feed' }, c.userId);
    return cm;
  }
}

@Controller('feed')
@RequireModule('feed')
export class FeedController {
  constructor(private s: FeedService) {}
  @Get() list(@CurrentCtx() c: Ctx, @Query('before') before?: string) { return this.s.list(c, before); }
  @Post() create(@CurrentCtx() c: Ctx, @Body() b: unknown) { return this.s.create(c, b); }
  @Delete(':id') remove(@CurrentCtx() c: Ctx, @Param('id') id: string) { return this.s.remove(c, id); }
  @Post(':id/like') like(@CurrentCtx() c: Ctx, @Param('id') id: string) { return this.s.like(c, id); }
  @Post(':id/comments') comment(@CurrentCtx() c: Ctx, @Param('id') id: string, @Body() b: unknown) { return this.s.comment(c, id, b); }
}

@Module({ controllers: [FeedController], providers: [FeedService] })
export class FeedModule {}
