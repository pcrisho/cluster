import type {
  AccessRole,
  Prisma,
  SpaceIconType,
} from "@prisma/client";

export interface SpaceRow {
  id: string;
  name: string;
  icon: string;
  iconType: SpaceIconType;
  emoji: string | null;
  descriptionContent: Prisma.JsonValue | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  restricted: boolean;
  _count?: { pages: number };
}

export function toSpaceDto(
  s: SpaceRow,
  orgId: string,
  myRole: AccessRole,
  creator?: { id: string; firstName: string; lastName: string } | null,
) {
  return {
    id: s.id,
    name: s.name,
    icon: s.icon,
    iconType: s.iconType,
    emoji: s.emoji,
    descriptionContent: s.descriptionContent,
    restricted: s.restricted,
    myRole,
    organizationId: orgId,
    createdBy: s.createdBy,
    createdByUser: creator ?? null,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    _count: s._count,
  };
}
