import { StarterKit } from "@tiptap/starter-kit"
import Placeholder from "@tiptap/extension-placeholder"
import { tPlain } from "@/lib/i18n/plain"

/**
 * Extensions of the post composer. Their output is stored as the post body and the API
 * validates it against the shared editor schema, so every node, mark and attribute here
 * must exist there (post-editor-extensions.spec.ts checks it).
 */
export const POST_EDITOR_EXTENSIONS = [
  StarterKit,
  Placeholder.configure({
    placeholder: () => tPlain("connect.composer.placeholder"),
  }),
]
