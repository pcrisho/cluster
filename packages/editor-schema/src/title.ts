import { Document } from "@tiptap/extension-document"
import { Paragraph } from "@tiptap/extension-paragraph"
import { Text } from "@tiptap/extension-text"

/** Single-line document: exactly one paragraph, no marks. */
export const titleExtensions = [
  Document.extend({ content: "paragraph" }),
  Paragraph.extend({ marks: "" }),
  Text,
]
