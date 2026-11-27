import {
  IsString,
  IsNotEmpty,
  MaxLength,
  IsOptional,
  IsArray,
  ArrayMaxSize,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsUUID,
  ValidateNested,
} from "class-validator"
import { Type } from "class-transformer"
import { PrincipalType } from "../../org/principal"

export enum PostType {
  POST = "POST",
  ANNOUNCEMENT = "ANNOUNCEMENT",
}

export class PostAudienceEntryDto {
  @IsEnum(PrincipalType)
  type!: PrincipalType

  @IsUUID()
  id!: string
}

export class CreatePostDto {
  @IsString()
  @IsOptional()
  @MaxLength(200)
  title?: string

  @IsString()
  @IsNotEmpty()
  body!: string

  @IsString()
  @IsOptional()
  @MaxLength(500)
  excerpt?: string

  @IsArray()
  @IsOptional()
  @IsString({ each: true })
  @ArrayMaxSize(10)
  images?: string[]

  @IsEnum(PostType)
  @IsOptional()
  type?: PostType

  @IsBoolean()
  @IsOptional()
  isPinned?: boolean

  @IsDateString()
  @IsOptional()
  pinnedExpiresAt?: string

  @IsBoolean()
  @IsOptional()
  restricted?: boolean

  @IsArray()
  @IsOptional()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => PostAudienceEntryDto)
  audience?: PostAudienceEntryDto[]
}
