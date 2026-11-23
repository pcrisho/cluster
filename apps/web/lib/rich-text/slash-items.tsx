import type { ReactNode } from "react"
import type { Editor, Range } from "@tiptap/core"
import { toast } from "sonner"
import {
  CheckSquareIcon,
  CodeIcon,
  FileTextIcon,
  Heading1Icon,
  Heading2Icon,
  Heading3Icon,
  ImageIcon,
  ListIcon,
  ListOrderedIcon,
  QuoteIcon,
  TextIcon,
} from "lucide-react"

import { acceptAttribute, uploadProblem } from "@/lib/documents/file-types"
import type { FileCardAttrs } from "@/lib/rich-text/extensions/file-card-extension"
import { getErrorMessage } from "@/lib/api"
import { tPlain } from "@/lib/i18n/plain"

export type FileUploadHandler = (file: File) => Promise<FileCardAttrs>
/** Uploads an image and returns the storage key the `image` node stores as `src`. */
export type ImageUploadHandler = (file: File) => Promise<string>

export interface SlashItem {
  title: string
  description: string
  searchTerms: string[]
  icon: ReactNode
  command: (props: { editor: Editor; range: Range }) => void
}

/**
 * The `/` menu items, in the current language (build them when the menu opens). "Image" and
 * "File" are only offered when the host can upload them.
 */
export function getSlashItems(
  onFileUpload?: FileUploadHandler,
  onImageUpload?: ImageUploadHandler
): SlashItem[] {
  return [
    {
      title: tPlain("editor.slash.text"),
      description: tPlain("editor.slash.textHint"),
      searchTerms: ["p", "paragraph"],
      icon: <TextIcon size={18} />,
      command: ({ editor, range }) => {
        editor
          .chain()
          .focus()
          .deleteRange(range)
          .toggleNode("paragraph", "paragraph")
          .run()
      },
    },
    ...(onImageUpload
      ? [
          {
            title: tPlain("editor.slash.image"),
            description: tPlain("editor.slash.imageHint"),
            searchTerms: ["image", "images", "picture", "photo", "upload"],
            icon: <ImageIcon size={18} />,
            command: ({ editor, range }: { editor: Editor; range: Range }) => {
              openFilePicker(editor, range, acceptAttribute("image"), (file) =>
                uploadImageFromFile(file, editor, onImageUpload)
              )
            },
          },
        ]
      : []),
    ...(onFileUpload
      ? [
          {
            title: tPlain("editor.slash.file"),
            description: tPlain("editor.slash.fileHint"),
            searchTerms: [
              "file",
              "files",
              "attach",
              "attachment",
              "document",
              "pdf",
              "upload",
            ],
            icon: <FileTextIcon size={18} />,
            command: ({ editor, range }: { editor: Editor; range: Range }) => {
              openFilePicker(
                editor,
                range,
                acceptAttribute("document"),
                (file) => uploadFileCardFromFile(file, editor, onFileUpload)
              )
            },
          },
        ]
      : []),
    {
      title: tPlain("editor.slash.h1"),
      description: tPlain("editor.slash.h1Hint"),
      searchTerms: ["title", "big", "large"],
      icon: <Heading1Icon size={18} />,
      command: ({ editor, range }) => {
        editor
          .chain()
          .focus()
          .deleteRange(range)
          .setNode("heading", { level: 1 })
          .run()
      },
    },
    {
      title: tPlain("editor.slash.h2"),
      description: tPlain("editor.slash.h2Hint"),
      searchTerms: ["subtitle", "medium"],
      icon: <Heading2Icon size={18} />,
      command: ({ editor, range }) => {
        editor
          .chain()
          .focus()
          .deleteRange(range)
          .setNode("heading", { level: 2 })
          .run()
      },
    },
    {
      title: tPlain("editor.slash.h3"),
      description: tPlain("editor.slash.h3Hint"),
      searchTerms: ["subtitle", "small"],
      icon: <Heading3Icon size={18} />,
      command: ({ editor, range }) => {
        editor
          .chain()
          .focus()
          .deleteRange(range)
          .setNode("heading", { level: 3 })
          .run()
      },
    },
    {
      title: tPlain("editor.slash.bullets"),
      description: tPlain("editor.slash.bulletsHint"),
      searchTerms: ["unordered", "point"],
      icon: <ListIcon size={18} />,
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).toggleBulletList().run()
      },
    },
    {
      title: tPlain("editor.slash.numbered"),
      description: tPlain("editor.slash.numberedHint"),
      searchTerms: ["ordered"],
      icon: <ListOrderedIcon size={18} />,
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).toggleOrderedList().run()
      },
    },
    {
      title: tPlain("editor.slash.todo"),
      description: tPlain("editor.slash.todoHint"),
      searchTerms: ["todo", "task", "list", "check", "checkbox"],
      icon: <CheckSquareIcon size={18} />,
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).toggleTaskList().run()
      },
    },
    {
      title: tPlain("editor.slash.quote"),
      description: tPlain("editor.slash.quoteHint"),
      searchTerms: ["blockquote"],
      icon: <QuoteIcon size={18} />,
      command: ({ editor, range }) =>
        editor
          .chain()
          .focus()
          .deleteRange(range)
          .toggleNode("paragraph", "paragraph")
          .toggleBlockquote()
          .run(),
    },
    {
      title: tPlain("editor.slash.code"),
      description: tPlain("editor.slash.codeHint"),
      searchTerms: ["codeblock"],
      icon: <CodeIcon size={18} />,
      command: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).toggleCodeBlock().run(),
    },
  ]
}

function openFilePicker(
  editor: Editor,
  range: Range,
  accept: string,
  onFile: (file: File) => void
) {
  editor.chain().focus().deleteRange(range).run()

  const input = document.createElement("input")
  input.type = "file"
  input.accept = accept
  input.style.display = "none"
  document.body.appendChild(input)
  input.addEventListener("change", () => {
    const file = input.files?.[0]
    if (file) onFile(file)
    input.remove()
  })
  input.addEventListener("cancel", () => {
    input.remove()
  })
  input.click()
}

async function uploadFileCardFromFile(
  file: File,
  editor: Editor,
  onUpload: FileUploadHandler
) {
  const problem = uploadProblem("document", file)
  if (problem) {
    toast.error(problem)
    return
  }
  try {
    const attrs = await onUpload(file)
    editor
      .chain()
      .focus()
      .insertContentAt(editor.state.selection.from, { type: "fileCard", attrs })
      .run()
  } catch (err) {
    toast.error(
      err instanceof Error
        ? getErrorMessage(err)
        : tPlain("editor.slash.uploadFileFailed")
    )
  }
}

async function uploadImageFromFile(
  file: File,
  editor: Editor,
  onUpload: ImageUploadHandler
) {
  const problem = uploadProblem("image", file)
  if (problem) {
    toast.error(problem)
    return
  }
  try {
    const src = await onUpload(file)
    editor
      .chain()
      .focus()
      .insertContentAt(editor.state.selection.from, {
        type: "image",
        attrs: { src, alt: file.name },
      })
      .run()
  } catch (err) {
    toast.error(
      err instanceof Error
        ? getErrorMessage(err)
        : tPlain("editor.slash.uploadImageFailed")
    )
  }
}
