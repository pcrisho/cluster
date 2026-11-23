/**
 * TipTap extensions for the client-side rich-text editor.
 *
 * The schema (nodes, marks, attributes, HTML rules) comes from
 * `@cluster/editor-schema`, shared with the API. This module adds the
 * view layer on top: the React card for `fileCard`, the upload plugins
 * for `image` and `fileCard`, the `@` popup for `pageMention`, the `/`
 * menu.
 *
 * Only safe to import from a Client Component (`"use client"`).
 */

import { toast } from "sonner"
import type { Extensions as TiptapExtensions } from "@tiptap/core"
// Type-only: these add the chain commands (toggleBold, toggleTaskList, ...)
// to `Editor`; the schema's StarterKit and TaskList provide them at runtime.
import type {} from "@tiptap/starter-kit"
import type {} from "@tiptap/extension-task-list"
import { Plugin, PluginKey } from "@tiptap/pm/state"
import type { EditorView } from "@tiptap/pm/view"
import Placeholder from "@tiptap/extension-placeholder"
import { schemaExtensions } from "@cluster/editor-schema"

import { ImageUpload } from "@/components/shared/rich-text-editor/image-upload-extension"
import {
  acceptAttribute,
  bodyUploadKind,
  uploadProblem,
} from "@/lib/documents/file-types"
import { SlashCommand } from "@/components/shared/rich-text-editor/SlashMenu"
import {
  FileCard,
  type FileCardAttrs,
} from "@/lib/rich-text/extensions/file-card-extension"
import { PageCreate } from "@/lib/rich-text/extensions/page-create-extension"
import { PageMention } from "@/lib/rich-text/extensions/mention-extension"
import { withoutHistory } from "@/lib/rich-text/collaborative-schema"
import { getErrorMessage } from "@/lib/api"
import { tPlain } from "@/lib/i18n/plain"

export interface GetClientEditorExtensionsOptions {
  /** Hook called when the user pastes / drops an image. */
  onImageUpload?: (file: File) => Promise<string>
  /**
   * Hook called when the user pastes / drops a file that is not an inline
   * image (HEIC and SVG included)
   * (or invokes the document slash command). Returns the
   * document data so the editor can insert a `fileCard` node.
   */
  onFileUpload?: (file: File) => Promise<FileCardAttrs>
  /**
   * Hook called when the user invokes the page-create slash
   * command or `[[Title]]`. The host component is expected to
   * create the page and return its data; the editor inserts a
   * `pageMention` to it.
   */
  onCreatePage?: (proposedTitle: string) => Promise<{
    id: string
    title: string
    spaceId: string
    spaceName: string
  } | null>
  /** Placeholder shown when the editor is empty. */
  placeholder?: string
  /** Extra extensions to append. */
  extra?: TiptapExtensions
  /** Collaborative editing: drops the StarterKit history, `Collaboration` has its own. */
  collaborative?: boolean
  /** The `@` popup that links KNOW pages. Off outside KNOW (features never call each other). */
  pageMentions?: boolean
}

export function getClientEditorExtensions(
  opts: GetClientEditorExtensionsOptions = {}
): TiptapExtensions {
  return [
    ...schemaWithViews(opts),
    Placeholder.configure({
      placeholder: opts.placeholder ?? tPlain("editor.placeholder"),
    }),
    SlashCommand.configure({
      onFileUpload: opts.onFileUpload,
      onImageUpload: opts.onImageUpload,
    }),
    ...(opts.onCreatePage
      ? [
          PageCreate.configure({
            onCreate: async ({ proposedTitle, editor, triggerRange }) => {
              const result = await opts.onCreatePage!(proposedTitle)
              if (!result) return
              // Replace the trigger text with a pageMention.
              editor
                .chain()
                .focus()
                .deleteRange(triggerRange)
                .insertContent([
                  {
                    type: "pageMention",
                    attrs: {
                      id: result.id,
                      label: result.title,
                      spaceId: result.spaceId,
                      spaceName: result.spaceName,
                      archived: false,
                    },
                  },
                  { type: "text", text: " " },
                ])
                .run()
            },
          }),
        ]
      : []),
    ...(opts.extra ?? []),
  ]
}

/**
 * The shared schema with the view layer attached to its three custom
 * nodes. Each schema extension keeps its place; the nodes are swapped
 * for their extended versions by name, so every name appears once.
 */
function schemaWithViews(
  opts: GetClientEditorExtensionsOptions
): TiptapExtensions {
  const schema = opts.collaborative
    ? withoutHistory(schemaExtensions)
    : schemaExtensions
  return schema.map((ext) => {
    switch (ext.name) {
      case "image":
        return ImageUpload.configure({ onUpload: opts.onImageUpload })
      case "fileCard":
        return opts.onFileUpload
          ? fileCardWithUpload(opts.onFileUpload)
          : FileCard
      case "pageMention":
        return opts.pageMentions === false ? ext : PageMention
      default:
        return ext
    }
  })
}

/** A pasted or dropped file that becomes a file card rather than an image. */
function isAttachment(file: File): boolean {
  return bodyUploadKind(file) === "document"
}

/**
 * `fileCard` with the upload triggers: `/file` followed by a space,
 * pasted files and dropped files.
 */
function fileCardWithUpload(onUpload: (file: File) => Promise<FileCardAttrs>) {
  return FileCard.extend({
    addProseMirrorPlugins() {
      return [
        new Plugin({
          key: new PluginKey("file-card-upload"),
          props: {
            handleTextInput(view, from, to, text) {
              if (text !== " ") return false

              const $from = view.state.doc.resolve(from)
              const parentStart = $from.before()
              const before = view.state.doc.textBetween(
                parentStart,
                from,
                "\n",
                "\n"
              )

              const slash = before.lastIndexOf("/file")
              if (slash === -1) return false
              const charBefore = slash > 0 ? before[slash - 1] : " "
              if (!/\s/.test(charBefore) && slash !== 0) return false

              const triggerFrom = parentStart + slash
              const triggerTo = from

              // Delete the trigger text
              view.dispatch(view.state.tr.delete(triggerFrom, triggerTo))

              // Programmatically open a file picker
              const input = document.createElement("input")
              input.type = "file"
              input.accept = acceptAttribute("document")
              input.style.display = "none"
              document.body.appendChild(input)
              input.addEventListener("change", () => {
                const file = input.files?.[0]
                if (file) {
                  void uploadFileCard(view, file, onUpload, triggerFrom)
                }
                document.body.removeChild(input)
              })
              input.addEventListener("cancel", () => {
                document.body.removeChild(input)
              })
              input.click()
              return true
            },
            handlePaste: (view: EditorView, event: ClipboardEvent) => {
              const files = event.clipboardData?.files
              if (!files || files.length === 0) return false
              const file = Array.from(files).find(isAttachment)
              if (!file) return false
              event.preventDefault()
              void uploadFileCard(view, file, onUpload)
              return true
            },
            handleDrop: (view: EditorView, event: DragEvent) => {
              const files = event.dataTransfer?.files
              if (!files || files.length === 0) return false
              const file = Array.from(files).find(isAttachment)
              if (!file) return false
              event.preventDefault()
              const coords = {
                left: event.clientX,
                top: event.clientY,
              }
              void uploadFileCard(view, file, onUpload, coords)
              return true
            },
          },
        }),
      ]
    },
  })
}

async function uploadFileCard(
  view: EditorView,
  file: File,
  onUpload: (file: File) => Promise<FileCardAttrs>,
  pos?: { left: number; top: number } | number
) {
  const problem = uploadProblem("document", file)
  if (problem) {
    toast.error(problem)
    return
  }
  try {
    const attrs = await onUpload(file)
    let insertAt: number | null | undefined
    if (typeof pos === "number") {
      insertAt = pos
    } else if (pos) {
      insertAt = view.posAtCoords({ left: pos.left, top: pos.top })?.pos
    } else {
      insertAt = view.state.selection.from
    }
    if (insertAt == null) return
    const node = view.state.schema.nodes.fileCard?.create(attrs)
    if (!node) return
    view.dispatch(view.state.tr.insert(insertAt, node))
  } catch (err) {
    toast.error(
      err instanceof Error
        ? getErrorMessage(err)
        : tPlain("editor.slash.uploadFileFailed")
    )
  }
}
