import { Type } from "class-transformer";
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  IsIn,
  ValidateIf,
  ValidateNested,
} from "class-validator";
import { ModuleKey } from "@prisma/client";
import { SUPPORTED_LOCALES } from "../../../common/locale";
import { IsIanaTimeZone } from "../../../common/time-zone";
import { ThemeDto } from "../../../common/theme.dto";
import { GLASS_KEYS, type GlassKey } from "@cluster/theme";

/** The instance theme: the seeds every layer has, plus the glass level, which only the instance sets. */
export class InstanceThemeDto extends ThemeDto {
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsIn(GLASS_KEYS)
  glassKey?: GlassKey | null;
}

export class UpdateInstanceSettingsDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsBoolean()
  registrationOpen?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsEnum(ModuleKey, { each: true })
  availableModules?: ModuleKey[];

  @IsOptional()
  @IsIn(SUPPORTED_LOCALES)
  defaultLocale?: string;

  @IsOptional()
  @IsBoolean()
  orgThemingAllowed?: boolean;

  /** Check new passwords against Have I Been Pwned. */
  @IsOptional()
  @IsBoolean()
  passwordBreachCheck?: boolean;

  /** Master switch of node partitions; off is refused while an organization isolates its main nodes. */
  @IsOptional()
  @IsBoolean()
  nodeIsolationAllowed?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => InstanceThemeDto)
  theme?: InstanceThemeDto;
}

class OrganizationAdminDto {
  @IsEmail()
  email!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  firstName!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  lastName!: string;
}

export class CreateOrganizationDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @IsIanaTimeZone()
  timezone!: string;

  @ValidateNested()
  @Type(() => OrganizationAdminDto)
  admin!: OrganizationAdminDto;
}

export class UpdateOrganizationStatusDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  themingEnabled?: boolean;
}
