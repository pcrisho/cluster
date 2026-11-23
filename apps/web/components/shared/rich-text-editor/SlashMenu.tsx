"use client"

import { Extension } from "@tiptap/core"
import { PluginKey } from "@tiptap/pm/state"
import { ReactRenderer } from "@tiptap/react"
import { Suggestion, type SuggestionProps } from "@tiptap/suggestion"

import {
  SlashMenuList,
  type SlashMenuListRef,
} from "@/components/shared/rich-text-editor/SlashMenuList"
import { filterSlashItems } from "@/lib/rich-text/slash-filter"
import {
  createSuggestionPopup,
  type SuggestionPopup,
  type SuggestionRect,
} from "@/lib/rich-text/suggestion-popup"
import {
  getSlashItems,
  type FileUploadHandler,
  type ImageUploadHandler,
  type SlashItem,
} from "@/lib/rich-text/slash-items"

export interface SlashCommandOptions {
  /** Shows the "File" item and receives the chosen file. */
  onFileUpload?: FileUploadHandler
  /** Shows the "Image" item and receives the chosen image. */
  onImageUpload?: ImageUploadHandler
}

// Own key: `pageMention` also runs a Suggestion, and two plugins with the
// same key make ProseMirror reject the editor.
const SLASH_PLUGIN_KEY = new PluginKey("slashCommand")

/** The `/` command menu. */
export const SlashCommand = Extension.create<SlashCommandOptions>({
  name: "slashCommand",

  addOptions() {
    return {}
  },

  addProseMirrorPlugins() {
    const { onFileUpload, onImageUpload } = this.options
    return [
      Suggestion<SlashItem>({
        editor: this.editor,
        pluginKey: SLASH_PLUGIN_KEY,
        char: "/",
        startOfLine: false,
        allow: ({ state, range }) =>
          state.doc.resolve(range.from).parent.type.name !== "codeBlock",
        // Built on every keystroke so the titles follow the current language.
        items: ({ query }) =>
          filterSlashItems(getSlashItems(onFileUpload, onImageUpload), query),
        command: ({ editor, range, props }) => props.command({ editor, range }),
        render: renderSlashMenu,
      }),
    ]
  },
})

function rectOf(props: SuggestionProps<SlashItem>): SuggestionRect {
  return () => props.clientRect?.() ?? null
}

function renderSlashMenu() {
  let component: ReactRenderer<SlashMenuListRef> | null = null
  let popup: SuggestionPopup | null = null
  // Escape hides the menu until this trigger ends; keys then reach the editor.
  let dismissed = false

  return {
    onStart: (props: SuggestionProps<SlashItem>) => {
      dismissed = false
      component = new ReactRenderer(SlashMenuList, {
        props,
        editor: props.editor,
      })
      popup = createSuggestionPopup()
      popup.show(component.element, rectOf(props))
    },
    onUpdate: (props: SuggestionProps<SlashItem>) => {
      component?.updateProps(props)
      if (!dismissed) popup?.update(rectOf(props))
    },
    onKeyDown: (props: { event: KeyboardEvent }) => {
      if (dismissed) return false
      if (props.event.key === "Escape") {
        dismissed = true
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
}
