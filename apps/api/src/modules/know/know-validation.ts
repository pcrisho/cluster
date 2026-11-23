import { BadRequestException } from "@nestjs/common";
import { assertValidDoc, InvalidDocError } from "@cluster/editor-schema";

/** Page bodies must be documents the shared editor schema accepts; the message names the offending node. Images must be keys of `orgId`. */
export function assertPageContent(content: unknown, orgId: string): void {
  try {
    assertValidDoc(content, { orgId });
  } catch (error) {
    if (error instanceof InvalidDocError) {
      throw new BadRequestException(error.message);
    }
    throw error;
  }
}

export { assertIconFields } from "../../common/icon-fields";
