import { IsString, IsOptional, IsInt, Min, Max } from "class-validator";
import { Type } from "class-transformer";

export class CursorPaginationDto {
  @IsString()
  @IsOptional()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 20;
}
