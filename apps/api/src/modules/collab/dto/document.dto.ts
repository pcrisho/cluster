import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsNotEmpty,
  IsObject,
  IsString,
  ValidateNested,
} from "class-validator";

export class SeedDocumentDto {
  /** Yjs state, base64. */
  @IsString()
  @IsNotEmpty()
  ydoc!: string;
}

export class DocumentFieldsDto {
  @IsObject()
  body!: Record<string, unknown>;

  @IsString()
  title!: string;
}

export class StoreDocumentDto extends SeedDocumentDto {
  @ValidateNested()
  @Type(() => DocumentFieldsDto)
  fields!: DocumentFieldsDto;

  /** User ids that edited since the last save, oldest first. */
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  editors!: string[];
}
