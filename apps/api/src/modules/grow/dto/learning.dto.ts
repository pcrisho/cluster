import { Type } from "class-transformer";
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from "class-validator";

export class CatalogQuery {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  /** My state in the course. */
  @IsOptional()
  @IsIn(["NOT_STARTED", "IN_PROGRESS", "COMPLETED"])
  status?: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";

  /** The last course id of the previous page. */
  @IsOptional()
  @IsUUID()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}
