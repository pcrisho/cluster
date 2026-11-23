import type { Extensions } from "@tiptap/core"

/**
 * Collaboration keeps its own undo stack (so undo only reverts your own edits); the StarterKit
 * history would fight it. `configure` returns a copy, the shared schema is untouched.
 */
export function withoutHistory(extensions: Extensions): Extensions {
  return extensions.map((ext) =>
    ext.name === "starterKit" ? ext.configure({ undoRedo: false }) : ext
  )
}
