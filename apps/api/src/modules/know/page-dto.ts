import type {
  PageIconType,
  PageStatus,
  Prisma,
} from "@prisma/client";

export interface PageRow {
  id: string;
  title: string;
  content: Prisma.JsonValue;
  status: PageStatus;
  order: number;
  spaceId: string;
  parentId: string | null;
  iconType: PageIconType;
  icon: string | null;
  emoji: string | null;
  authorId: string;
  createdAt: Date;
  updatedAt: Date;
  publishedAt: Date | null;
  // Present only when the caller selected them (page tree, single page).
  author?: {
    id: string;
    firstName: string;
    lastName: string;
    avatarUrl?: string | null;
  } | null;
  lastEditedBy?: { id: string; firstName: string; lastName: string } | null;
  tags?: { tag: { id: string; name: string } }[];
  _count?: { children?: number; versions?: number };
}

export function toPageDto(p: PageRow) {
  return {
    id: p.id,
    title: p.title,
    content: p.content,
    status: p.status,
    order: p.order,
    spaceId: p.spaceId,
    parentId: p.parentId,
    iconType: p.iconType,
    icon: p.icon,
    emoji: p.emoji,
    authorId: p.authorId,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    publishedAt: p.publishedAt,
    ...(p.author !== undefined ? { author: p.author } : {}),
    ...(p.lastEditedBy !== undefined ? { lastEditedBy: p.lastEditedBy } : {}),
    ...(p.tags !== undefined ? { tags: p.tags } : {}),
    ...(p._count !== undefined ? { _count: p._count } : {}),
  };
}
