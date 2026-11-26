import { IsOptional, IsString, IsUUID, MaxLength } from "class-validator";

export const MARKDOWN_MAX_CHARS = 500_000;

export class ImportMarkdownDto {
  @IsString()
  @MaxLength(MARKDOWN_MAX_CHARS)
  markdown!: string;

  /** Used when the Markdown does not start with a `# Title`; usually the file name. */
  @IsString()
  @IsOptional()
  @MaxLength(200)
  title?: string;

  @IsUUID()
  @IsOptional()
  parentId?: string;
}
