import { IsString, IsBoolean, IsOptional, IsIn } from "class-validator";

export class ToggleReactionDto {
  @IsString()
  targetUserId!: string;

  @IsString()
  @IsIn(["BIRTHDAY", "ANNIVERSARY"])
  type!: "BIRTHDAY" | "ANNIVERSARY";

  @IsString()
  @IsIn(["🎉", "🎂", "👏", "❤️"])
  emoji!: string;
}

export class UpdateCelebrationsSettingsDto {
  @IsBoolean()
  @IsOptional()
  celebrationsEnabled?: boolean;

  @IsBoolean()
  @IsOptional()
  showBirthdays?: boolean;

  @IsBoolean()
  @IsOptional()
  showAnniversaries?: boolean;
}
