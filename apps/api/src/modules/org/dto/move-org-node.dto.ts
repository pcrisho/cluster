import { IsOptional, IsUUID, ValidateIf } from "class-validator";

export class MoveOrgNodeDto {
  /** New parent; `null` makes it a top-level area; omitted keeps the current parent. */
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  newParentId?: string | null;

  /** Sibling to place the area before; omitted or `null` places it last. */
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  beforeId?: string | null;
}
