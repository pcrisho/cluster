import {
  IsString,
  IsOptional,
  IsInt,
  Min,
  Max,
  IsBoolean,
} from "class-validator";
import { Type } from "class-transformer";

export class ListNotificationsQueryDto {
  @IsString()
  @IsOptional()
  cursor?: string;

  @IsInt()
  @Min(1)
  @Max(50)
  @IsOptional()
  @Type(() => Number)
  limit?: number;

  @IsBoolean()
  @IsOptional()
  @Type(() => Boolean)
  unreadOnly?: boolean;
}
