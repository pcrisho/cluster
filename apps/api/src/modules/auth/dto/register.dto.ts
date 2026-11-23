import { IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator"
import { IsIanaTimeZone } from "../../../common/time-zone"
import { IsValidPassword } from "./password.dto"

/** Public sign-up: creates a new organization with the caller as its ADMIN. */
export class RegisterDto {
  @IsEmail()
  email!: string

  @IsValidPassword()
  password!: string

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  firstName!: string

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  lastName!: string

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  organizationName!: string

  /** The organization's zone; the web sends the browser's. */
  @IsOptional()
  @IsIanaTimeZone()
  timezone?: string
}
