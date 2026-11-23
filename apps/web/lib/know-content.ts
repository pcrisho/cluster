/**
 * @deprecated Import from `@/lib/rich-text/content` instead. This
 * file is kept as a thin re-export so existing consumers keep
 * working without changes. Will be removed once all consumers
 * are updated.
 */

export {
  emptyRichText,
  parseRichText,
  serializeRichText,
  extractPlainTextFromContent,
} from "@/lib/rich-text/content"

export type {
  RichTextDoc,
  RichTextNode,
  RichTextMark,
} from "@/lib/rich-text/types"
