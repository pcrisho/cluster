import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsUUID,
  Matches,
  Max,
  Min,
} from "class-validator";
import { PrincipalType } from "../../org/principal";

export class AssignmentRulesDto {
  @IsOptional()
  @IsBoolean()
  mandatory?: boolean;

  /** A calendar date, YYYY-MM-DD; null clears it. */
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: "dueAt must be a date (YYYY-MM-DD)",
  })
  @IsISO8601({ strict: true })
  dueAt?: string | null;

  /** Days after the person was reached; null clears it. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  dueInDays?: number | null;
}

export class CreateAssignmentDto extends AssignmentRulesDto {
  @IsEnum(PrincipalType)
  principalType!: PrincipalType;

  @IsUUID()
  principalId!: string;
}
