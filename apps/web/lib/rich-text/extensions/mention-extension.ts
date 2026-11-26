"use client"

import type { Editor, Range } from "@tiptap/core"
import { ReactRenderer } from "@tiptap/react"
import { Suggestion } from "@tiptap/suggestion"
import { PluginKey } from "@tiptap/pm/state"
import { PageMentionNode } from "@cluster/editor-schema"

import type { PageMentionSearchResult } from "@/lib/documents/types"
import { pageMentionsApi } from "@/lib/documents/api"
import {
  createSuggestionPopup,
  type SuggestionPopup,
} from "@/lib/rich-text/suggestion-popup"

import {
  MentionList,
  type MentionListRef,
} from "@/components/shared/rich-text-editor/MentionList"

const PAGE_MENTION_PLUGIN_KEY = new PluginKey("pageMention")

interface PageMentionOptions {
  /** Character that opens the page search. */
  char: string
}

/**
 * View layer of the shared `pageMention` node: the `@` search
 * popup. The schema (attributes, `<a class="page-mention">` output)
 * lives in `@cluster/editor-schema`.
 *
 * Behaviour:
 *   - Trigger: `@`.
 *   - Items: search results from `GET /know/pages/search`
 *     (cross-space, COLLABORATOR-gated to PUBLISHED, sorted by
 *     recency).
 *   - Selection: insert a pageMention node with the page's id, title,
 *     space and archived flag. The link is rebuilt from `id`, so
 *     renames do not break mentions.
 *
 * The suggestion popup is a `ReactRenderer` mounting `<MentionList>`
 * (search, keyboard nav, click handling), positioned by
 * `createSuggestionPopup` (`lib/rich-text/suggestion-popup.ts`).
 */
export const PageMention = PageMentionNode.extend<PageMentionOptions>({
  addOptions() {
    return { char: "@" }
  },

  addProseMirrorPlugins() {
    return [
      Suggestion<PageMentionSearchResult>({
        editor: this.editor,
        // Own key: the slash-command menu also uses Suggestion, and ProseMirror
        // rejects two plugins with the default "suggestion" key (editor crash).
        pluginKey: PAGE_MENTION_PLUGIN_KEY,
        char: this.options.char,
        allowSpaces: false,
        startOfLine: false,
        items: async ({ query }) => {
          try {
            const res = await pageMentionsApi.search(query, { limit: 10 })
            return res.data
          } catch (err) {
            // The popup will render the error inline.
            console.error("page-mention search failed", err)
            return []
          }
        },
        render: () => {
          let component: ReactRenderer<MentionListRef> | null = null
          let popup: SuggestionPopup | null = null
          return {
            onStart: (props) => {
              component = new ReactRenderer(MentionList, {
                props,
                editor: props.editor,
              })
              popup = createSuggestionPopup()
              popup.show(component.element, () => props.clientRect?.() ?? null)
            },
            onUpdate: (props) => {
              component?.updateProps(props)
              popup?.update(() => props.clientRect?.() ?? null)
            },
            onKeyDown: (props) => {
              if (props.event.key === "Escape") {
                popup?.hide()
                return true
              }
              return component?.ref?.onKeyDown(props) ?? false
            },
            onExit: () => {
              popup?.destroy()
              component?.destroy()
              popup = null
              component = null
            },
          }
        },
        command: ({
          editor,
          range,
          props,
        }: {
          editor: Editor
          range: Range
          props: PageMentionSearchResult
        }) => {
          editor
            .chain()
            .focus()
            .deleteRange(range)
            .insertContent([
              {
                type: "pageMention",
                attrs: {
                  id: props.id,
                  label: props.title,
                  spaceId: props.spaceId,
                  spaceName: props.spaceName,
                  archived: props.archived,
                },
              },
              { type: "text", text: " " },
            ])
            .run()
        },
      }),
    ]
  },
})
