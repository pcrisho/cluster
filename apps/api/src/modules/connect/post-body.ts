import { BadRequestException } from "@nestjs/common"
import { assertValidDoc, extractText, InvalidDocError } from "@cluster/editor-schema"

const EXCERPT_LENGTH = 150

/**
 * A post body is a serialized TipTap document that the shared editor schema accepts, the
 * same rule KNOW applies to pages. Raw HTML is never stored, so the feed renders documents
 * with the schema's own renderer instead of injecting markup. Returns the body to store
 * (normalized JSON) and its plain-text excerpt.
 */
export function parsePostBody(raw: string, orgId: string): { body: string; excerpt: string } {
  let doc: unknown
  try {
    doc = JSON.parse(raw)
  } catch {
    throw new BadRequestException("Post body must be a rich-text document")
  }
  try {
    assertValidDoc(doc, { orgId })
  } catch (error) {
    if (error instanceof InvalidDocError) throw new BadRequestException(error.message)
    throw error
  }
  const text = extractText(doc).replace(/\s+/g, " ").trim()
  if (!text) throw new BadRequestException("Post body is required")
  return { body: JSON.stringify(doc), excerpt: text.slice(0, EXCERPT_LENGTH) }
}
