import { applyDecorators } from "@nestjs/common"
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Matches,
  Min,
  ValidateIf,
} from "class-validator"
import { Transform, Type } from "class-transformer"
import { ModuleKey, UserRole } from "@prisma/client"
import { IsIanaTimeZone } from "../../../common/time-zone"
import { SUPPORTED_LOCALES } from "../../../common/locale"

export class UpdateOrganizationDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name?: string

  @IsOptional()
  @IsIanaTimeZone()
  timezone?: string

  /** Storage key of an upload of this organization; null removes the logo. */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  logoUrl?: string | null

  /** Language for members with no choice of their own; null = follow the instance. */
  @IsOptional()
  @IsIn(SUPPORTED_LOCALES)
  locale?: string | null

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsEnum(ModuleKey, { each: true })
  enabledModules?: ModuleKey[]

  /** Require 2FA of the organization's ADMINs at their next sign-in (docs/specs/auth/hardening R-19). */
  @IsOptional()
  @IsBoolean()
  requireAdminMfa?: boolean

  /** Members who are not ADMIN may edit their own name, avatar, phone and bio (docs/specs/org/member-data). */
  @IsOptional()
  @IsBoolean()
  memberProfileEditing?: boolean

  /** Each main node isolates its people and structure (docs/specs/org/node-partitions); needs the instance switch. */
  @IsOptional()
  @IsBoolean()
  isolateRootNodes?: boolean
}

const trim = ({ value }: { value: unknown }) => (typeof value === "string" ? value.trim() : value)
/** Absent is fine, null is not (the column is required). */
const NotNull = () => ValidateIf((_: object, value: unknown) => value !== undefined)
/** A calendar day, `YYYY-MM-DD`, that exists. */
const IsDay = () => applyDecorators(Matches(/^\d{4}-\d{2}-\d{2}$/), IsISO8601({ strict: true }))

export class CreateMemberDto {
  @IsEmail()
  email!: string

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  firstName!: string

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  lastName!: string

  @IsEnum(UserRole)
  role!: UserRole

  /** The member's area; required for a COLLABORATOR while nodes are isolated (docs/specs/org/node-partitions). */
  @IsOptional()
  @IsUUID()
  orgNodeId?: string

  @IsOptional()
  @IsUUID()
  positionId?: string
}

export class UpdateMemberDto {
  @NotNull()
  @IsEnum(UserRole)
  role?: UserRole

  @NotNull()
  @IsBoolean()
  isActive?: boolean

  @NotNull()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  firstName?: string

  @NotNull()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  lastName?: string

  @NotNull()
  @Transform(({ value }: { value: unknown }) => (typeof value === "string" ? value.trim().toLowerCase() : value))
  @IsEmail()
  email?: string

  /** Stored in `orgColaboratorId`; null clears it. */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  employeeCode?: string | null

  /** null or "" clears it. */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(30)
  phone?: string | null

  /** null clears it. */
  @IsOptional()
  @IsDay()
  birthDate?: string | null

  @NotNull()
  @IsDay()
  joinedAt?: string
}

export class ActivityQueryDto {
  @IsOptional()
  @IsString()
  cursor?: string

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number
}

/** `ENABLED` is everyone not deactivated: active people and those with an invitation still pending. */
export const MEMBER_STATES = ["ACTIVE", "PENDING", "DEACTIVATED", "ENABLED"] as const
export type MemberState = (typeof MEMBER_STATES)[number]

/** `GET /org/members`: one page of the organization's people. */
export class ListMembersQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string

  @IsOptional()
  @IsIn(MEMBER_STATES)
  status?: MemberState

  @IsOptional()
  @IsUUID()
  orgNodeId?: string

  @IsOptional()
  @IsIn(["name", "role"])
  sort?: "name" | "role"

  @IsOptional()
  @IsIn(["asc", "desc"])
  order?: "asc" | "desc"

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  page?: number

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number
}
