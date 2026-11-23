import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
} from "class-validator";

export const DOCUMENT_NAME = /^[a-z]+(\.[a-z]+)*:[0-9a-f-]{36}$/;

export class AuthorizeDto {
  @IsString()
  @IsNotEmpty()
  token!: string;

  @Matches(DOCUMENT_NAME)
  documentName!: string;
}

export class AuthorizeUserDto {
  @IsString()
  @IsNotEmpty()
  userId!: string;

  @Matches(DOCUMENT_NAME)
  documentName!: string;

  /** The connection's auth session (from the authorization that opened it). */
  @IsOptional()
  @IsUUID()
  sessionId?: string;
}
