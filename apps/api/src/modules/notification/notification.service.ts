import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { WsGateway } from "../../common/ws.gateway";

export interface NotifyParams {
  /** "<module>:<thing>:<event>"; the web writes the title of a known type in the reader's language. */
  type: string;
  /** English fallback for a type the web does not know. */
  title: string;
  body?: string;
  link?: string;
  /** Free data; `payload.params` holds the values the web's title for this type needs. */
  payload?: unknown;
}

export interface ListOpts {
  cursor?: string;
  limit?: number;
  unreadOnly?: boolean;
}

export interface ListMeta {
  cursor: string | null;
  limit: number;
}

const TITLE_MAX = 200;
const BODY_MAX = 500;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly wsGateway: WsGateway,
  ) {}

  async notify(userId: string, params: NotifyParams) {
    this.validateParams(params);

    const notification = await this.prisma.notification.create({
      data: {
        userId,
        type: params.type,
        title: params.title,
        body: params.body ?? null,
        link: params.link ?? null,
        payload: (params.payload as never) ?? undefined,
      },
    });

    this.emitSafe(
      userId,
      "notification:new",
      this.toSocketPayload(notification),
    );

    return notification;
  }

  async notifyMany(userIds: string[], params: NotifyParams) {
    if (userIds.length === 0) return { count: 0 };
    this.validateParams(params);

    const results = await Promise.all(
      userIds.map((userId) => this.notify(userId, params)),
    );

    return { count: results.length };
  }

  async listForUser(userId: string, opts: ListOpts = {}) {
    const limit = this.clampLimit(opts.limit);
    const where: Record<string, unknown> = { userId };
    if (opts.unreadOnly) {
      where.readAt = null;
    }
    if (opts.cursor) {
      where.createdAt = { lt: new Date(opts.cursor) };
    }

    const items = await this.prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit + 1,
    });

    const hasMore = items.length > limit;
    const data = hasMore ? items.slice(0, limit) : items;
    const nextCursor = hasMore
      ? data[data.length - 1].createdAt.toISOString()
      : null;

    return { data, meta: { cursor: nextCursor, limit } };
  }

  async unreadCount(userId: string) {
    return this.prisma.notification.count({
      where: { userId, readAt: null },
    });
  }

  async markRead(notificationId: string, userId: string) {
    const existing = await this.prisma.notification.findFirst({
      where: { id: notificationId, userId },
    });

    if (!existing) {
      throw new NotFoundException("Notification not found");
    }

    if (existing.readAt) {
      return existing;
    }

    return this.prisma.notification.update({
      where: { id: notificationId },
      data: { readAt: new Date() },
    });
  }

  async markAllRead(userId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });

    return { updated: result.count };
  }

  private validateParams(params: NotifyParams) {
    if (!params.type || params.type.trim().length === 0) {
      throw new BadRequestException("type is required");
    }
    if (!params.title || params.title.trim().length === 0) {
      throw new BadRequestException("title is required");
    }
    if (params.title.length > TITLE_MAX) {
      throw new BadRequestException(
        `title must be at most ${TITLE_MAX} characters`,
      );
    }
    if (params.body && params.body.length > BODY_MAX) {
      throw new BadRequestException(
        `body must be at most ${BODY_MAX} characters`,
      );
    }
  }

  private clampLimit(limit?: number): number {
    if (!limit || limit <= 0) return DEFAULT_LIMIT;
    return Math.min(limit, MAX_LIMIT);
  }

  private emitSafe(userId: string, event: string, data: unknown) {
    try {
      this.wsGateway.emitToUser(userId, event, data);
    } catch (err) {
      this.logger.warn(
        `Socket emit failed for user ${userId} (event ${event}): ${
          (err as Error).message
        }`,
      );
    }
  }

  private toSocketPayload(n: {
    id: string;
    type: string;
    title: string;
    body: string | null;
    link: string | null;
    payload: unknown;
    createdAt: Date;
  }) {
    return {
      id: n.id,
      type: n.type,
      title: n.title,
      body: n.body,
      link: n.link,
      payload: n.payload,
      createdAt: n.createdAt.toISOString(),
    };
  }
}
