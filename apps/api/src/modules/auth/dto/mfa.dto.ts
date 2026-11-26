import { IsOptional, IsString, MaxLength } from "class-validator";

export class MfaVerifyDto {
  @IsString()
  @MaxLength(64)
  challengeId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  recoveryCode?: string;
}

/** Without a challenge the enrollment routes act for the signed-in person (Bearer). */
export class MfaChallengeDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  challengeId?: string;
}

/**
 * The signed-in person proves it is them: the password, plus a code of the app or a recovery code when
 * 2FA is already on (a new device). A sign-in challenge needs neither.
 */
export class MfaEnrollStartDto extends MfaChallengeDto {
  @IsOptional()
  @IsString()
  @MaxLength(512)
  currentPassword?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  code?: string;
}

export class MfaEnrollConfirmDto extends MfaChallengeDto {
  @IsString()
  @MaxLength(16)
  code!: string;
}

export class MfaCodeDto {
  @IsString()
  @MaxLength(16)
  code!: string;
}

export class MfaDisableDto {
  @IsString()
  @MaxLength(512)
  currentPassword!: string;

  /** A code of the app, or a recovery code when the phone is gone. */
  @IsString()
  @MaxLength(32)
  code!: string;
}
