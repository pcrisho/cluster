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
} from "class-validator"

export enum PostType {
  POST = "POST",
  ANNOUNCEMENT = "ANNOUNCEMENT",
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
}
