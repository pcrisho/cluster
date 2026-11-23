import { IsString, IsBoolean, IsOptional, MaxLength } from "class-validator"

export class UpdateMyProfileDto {
  @IsString()
  @MaxLength(500)
  @IsOptional()
  bio?: string

  @IsString()
  @MaxLength(30)
  @IsOptional()
  phone?: string

  @IsBoolean()
  @IsOptional()
  showBirthday?: boolean
}
