import {
  FONT_KEYS,
  RADIUS_KEYS,
  type FontKey,
  type RadiusKey,
} from "@cluster/theme";
import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from "class-validator";

// Colours are checked in `themeData` (INVALID_COLOR), so here only their shape; `null` resets.
export class ThemeDto {
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(16)
  brandPrimary?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(16)
  brandSecondary?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsIn(FONT_KEYS)
  fontKey?: FontKey | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsIn(RADIUS_KEYS)
  radiusKey?: RadiusKey | null;
}
