import { IsObject } from "class-validator";

export class SubmitAttemptDto {
  /** Option ids for a choice question, text for a written one; checked against the attempt (`grade.ts`). */
  @IsObject()
  answers!: Record<string, unknown>;
}

export class GradeAttemptDto {
  /** Points for each written answer waiting for review. */
  @IsObject()
  scores!: Record<string, unknown>;
}
