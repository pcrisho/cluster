import { BadRequestException } from "@nestjs/common";
import type { PageIconType, SpaceIconType } from "@prisma/client";

/** Spaces, pages and courses share the same icon rules: LUCIDE needs `icon`, EMOJI needs `emoji`. */
export function assertIconFields(
  iconType: SpaceIconType | PageIconType,
  icon: string | null | undefined,
  emoji: string | null | undefined,
) {
  if (iconType === "LUCIDE" && (icon == null || icon.trim() === "")) {
    throw new BadRequestException("icon is required when iconType is LUCIDE");
  }
  if (iconType === "EMOJI" && (emoji == null || emoji.trim() === "")) {
    throw new BadRequestException("emoji is required when iconType is EMOJI");
  }
}
