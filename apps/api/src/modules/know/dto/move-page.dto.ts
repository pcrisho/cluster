import { IsInt, IsOptional, IsUUID, Max, Min } from "class-validator";

export class MovePageDto {
  /** New parent; `null` makes the page a root of its space; omitted keeps the current parent (reorder only). */
  @IsUUID()
  @IsOptional()
  parentId?: string | null;

  /** Position among the new siblings, counted from 0. */
  @IsInt()
  @Min(0)
  @Max(10000)
  index!: number;
}
