import { applyDecorators } from "@nestjs/common";
import { IsEmail, IsString, MaxLength } from "class-validator";

/**
 * A new password: only its type and a size guard here. The policy (password-policy.ts) needs the
 * person's context and answers with its own codes, so it runs in the service.
 */
export const IsValidPassword = () =>
  applyDecorators(IsString(), MaxLength(512));

export class SetPasswordDto {
  @IsString()
  token!: string;

  @IsValidPassword()
  password!: string;
}

export class SetInitialPasswordDto {
  @IsString()
  @MaxLength(100)
  challengeId!: string;

  @IsValidPassword()
  password!: string;
}

export class ForgotPasswordDto {
  @IsEmail()
  email!: string;
}

export class ChangePasswordDto {
  @IsString()
  @MaxLength(512)
  currentPassword!: string;

  @IsValidPassword()
  newPassword!: string;
}
