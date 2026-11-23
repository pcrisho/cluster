import { IsString, MinLength, IsOptional } from "class-validator";

export class SearchQueryDto {
  @IsString()
  @MinLength(1)
  q!: string;

  @IsString()
  @IsOptional()
  spaceId?: string;
}
