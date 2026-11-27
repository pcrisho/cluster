import {
  IsString,
  IsOptional,
  MaxLength,
  IsArray,
  ArrayMaxSize,
  IsBoolean,
  IsDateString,
  IsEnum,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";
import { PostAudienceEntryDto, PostType } from "./create-post.dto";

export class UpdatePostDto {
  @IsString()
  @IsOptional()
  @MaxLength(200)
  title?: string;

  @IsString()
  @IsOptional()
  body?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  excerpt?: string;

  @IsArray()
  @IsOptional()
  @IsString({ each: true })
  @ArrayMaxSize(10)
  images?: string[];

  @IsEnum(PostType)
  @IsOptional()
  type?: PostType;

  @IsBoolean()
  @IsOptional()
  isPinned?: boolean;

  @IsDateString()
  @IsOptional()
  pinnedExpiresAt?: string;

  @IsBoolean()
  @IsOptional()
  restricted?: boolean;

  @IsArray()
  @IsOptional()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => PostAudienceEntryDto)
  audience?: PostAudienceEntryDto[];
}
