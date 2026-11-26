import { IsOptional, IsString, MaxLength } from "class-validator";

/**
 * Body for `POST /documents/:id/versions`. The new file is
 * uploaded as `multipart/form-data` with the field name `file`.
 *
 * The version number is server-side: the next available
 * `(max(version) + 1)` for the document, never a client value.
 * Mimetype MUST match the document's previous version's
 * mimetype — clients cannot change the file type via
 * re-uploading.
 */
export class CreateDocumentVersionDto {
  @IsString()
  @IsOptional()
  @MaxLength(500)
  note?: string;
}
