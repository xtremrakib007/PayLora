import { Body, Controller, Delete, Get, Module, Post, Query } from '@nestjs/common';
import { and, count, eq, inArray, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { AllowNoCompany, Ctx, CurrentCtx } from '../../common/context';
import { NotifyService } from '../../common/core';
import { parse } from '../../common/validate';
import { DB, InjectDb } from '../../db/db';
import { notifications, pushTokens } from '../../db/schema';

@Controller('notifications')
export class NotificationsController {
  constructor(@InjectDb() private db: DB, private notify: NotifyService) {}

  @Get() list(@CurrentCtx() c: Ctx, @Query('unread') unread?: string) { return this.notify.list(c, !!unread); }

  @Get('unread-count') async unread(@CurrentCtx() c: Ctx) {
    const [{ n }] = await this.db.select({ n: count() }).from(notifications).where(and(eq(notifications.userId, c.userId), eq(notifications.companyId, c.companyId), isNull(notifications.readAt)));
    return { count: n };
  }

  @Post('read') async read(@CurrentCtx() c: Ctx, @Body() b: unknown) {
    const d = parse(z.object({ ids: z.array(z.uuid()).max(500).optional() }), b);
    await this.db.update(notifications).set({ readAt: new Date() })
      .where(and(eq(notifications.userId, c.userId), eq(notifications.companyId, c.companyId), isNull(notifications.readAt), d.ids?.length ? inArray(notifications.id, d.ids) : undefined));
    return { ok: true };
  }

  /** Register an Expo push token for this device. */
  @AllowNoCompany() @Post('push-token') async register(@CurrentCtx() c: Ctx, @Body() b: unknown) {
    const d = parse(z.object({ token: z.string().min(10).max(300), platform: z.string().max(20).optional() }), b);
    await this.db.insert(pushTokens).values({ userId: c.userId, token: d.token, platform: d.platform ?? null })
      .onConflictDoUpdate({ target: pushTokens.token, set: { userId: c.userId, platform: d.platform ?? null } });
    return { ok: true };
  }

  @AllowNoCompany() @Delete('push-token') async unregister(@CurrentCtx() c: Ctx, @Body() b: { token?: string }) {
    if (b?.token) await this.db.delete(pushTokens).where(and(eq(pushTokens.token, b.token), eq(pushTokens.userId, c.userId)));
    return { ok: true };
  }
}

@Module({ controllers: [NotificationsController] })
export class NotificationsModule {}
