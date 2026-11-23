import { IsOptional, IsString, MaxLength } from "class-validator";

/**
 * Body for `POST /pages/:pageId/documents`. The actual file is
 * uploaded as `multipart/form-data` with the field name `file`.
 * The body fields are validated separately as JSON if the
 * client uses `multipart/form-data` with a `note` field, or
 * they default when omitted.
 *
 * `name` is optional: if absent, the original filename of the
 * upload is used.
 */
export class CreateDocumentDto {
  @IsString()
  @IsOptional()
  @MaxLength(200)
  name?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  note?: string;
}
