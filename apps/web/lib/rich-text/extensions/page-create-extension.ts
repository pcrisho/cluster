"use client"

import { Extension } from "@tiptap/core"
import { Plugin, PluginKey } from "@tiptap/pm/state"

interface PageCreateOptions {
  /**
   * Called when the user types `[[Title]]`. Receives
   * the proposed title (text between `[[` and `]]`), the
   * editor instance, and the range to delete. The consumer
   * should create the page and replace the trigger text with
   * a pageMention node.
   */
  onCreate: (props: {
    proposedTitle: string
    editor: import("@tiptap/core").Editor
    triggerRange: { from: number; to: number }
  }) => void
}

const pageCreatePluginKey = new PluginKey("page-create")

/**
 * Input-rule based extension that detects the user typing
 * `[[Title]]` (Obsidian-style wiki link) and fires an
 * `onCreate` callback so the parent can create the page
 * directly. The trigger text remains in the doc until the
 * callback decides to remove it (e.g. after the page is
 * created and the mention is inserted).
 */
export const PageCreate = Extension.create<PageCreateOptions>({
  name: "pageCreate",

  addOptions() {
    return {
      onCreate: () => {},
    }
  },

  addProseMirrorPlugins() {
    const opts = this.options
    const editor = this.editor
    return [
      new Plugin({
        key: pageCreatePluginKey,
        props: {
          handleTextInput(view, from, to, text) {
            if (text !== "]") return false

            const $from = view.state.doc.resolve(from)
            const parentStart = $from.before()
            const before = view.state.doc.textBetween(
              parentStart,
              from,
              "\n",
              "\n"
            )

            // `before` ends with the first `]` of the closing pair: the
            // typed one is the second, and swallowing it leaves no stray `]`.
            const match = /\[\[([^[\]]+)\]$/.exec(before)
            if (!match) return false
            const title = match[1]
            const triggerFrom = parentStart + match.index
            const triggerTo = from

            queueMicrotask(() => {
              opts.onCreate({
                proposedTitle: title.trim(),
                editor,
                triggerRange: { from: triggerFrom, to: triggerTo },
              })
            })
            return true
          },
        },
      }),
    ]
  },
})
