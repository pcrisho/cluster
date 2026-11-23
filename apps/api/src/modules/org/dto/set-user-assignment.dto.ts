import { IsOptional, IsUUID } from "class-validator";

export class SetUserAssignmentDto {
  /**
   * ADR-001: position and orgNode are admin-assigned.
   * Both are optional — send only the one you want to set.
   * Pass null explicitly to clear.
   */
  @IsOptional()
  @IsUUID()
  orgNodeId?: string | null;

  @IsOptional()
  @IsUUID()
  positionId?: string | null;
}
