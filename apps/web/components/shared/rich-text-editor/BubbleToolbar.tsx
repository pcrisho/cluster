"use client"

import type { ReactNode } from "react"
import { useEditorState, type Editor } from "@tiptap/react"
import { BubbleMenu, type BubbleMenuProps } from "@tiptap/react/menus"
import {
  BoldIcon,
  CodeIcon,
  ItalicIcon,
  StrikethroughIcon,
  UnderlineIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"
import { useTranslations } from "next-intl"

// Replaces the plugin default, so it keeps the default focus check and adds
// the rules this toolbar needs: no marks inside code blocks, nothing to
// format on an empty selection, nothing to do when read-only.
const shouldShowBubble: NonNullable<BubbleMenuProps["shouldShow"]> = ({
  editor,
  element,
  view,
  state,
  from,
  to,
}) => {
  if (!editor.isEditable || editor.isActive("codeBlock")) return false
  if (state.selection.empty || !state.doc.textBetween(from, to).length) {
    return false
  }
  return view.hasFocus() || element.contains(document.activeElement)
}

// Module-level: BubbleMenu sends an options update whenever this identity changes.
const BUBBLE_OPTIONS: BubbleMenuProps["options"] = { placement: "top" }

export function BubbleToolbar({ editor }: { editor: Editor }) {
  const t = useTranslations("editor")
  const active = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      bold: current.isActive("bold"),
      italic: current.isActive("italic"),
      underline: current.isActive("underline"),
      strike: current.isActive("strike"),
      code: current.isActive("code"),
    }),
  })

  return (
    <BubbleMenu
      editor={editor}
      options={BUBBLE_OPTIONS}
      shouldShow={shouldShowBubble}
      className="flex w-fit items-center gap-0.5 rounded-lg border bg-background p-1 shadow-sm"
    >
      <FormatButton
        label={t("bold")}
        pressed={active.bold}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <BoldIcon />
      </FormatButton>
      <FormatButton
        label={t("italic")}
        pressed={active.italic}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <ItalicIcon />
      </FormatButton>
      <FormatButton
        label={t("underline")}
        pressed={active.underline}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
      >
        <UnderlineIcon />
      </FormatButton>
      <Separator orientation="vertical" className="h-5" />
      <FormatButton
        label={t("strike")}
        pressed={active.strike}
        onClick={() => editor.chain().focus().toggleStrike().run()}
      >
        <StrikethroughIcon />
      </FormatButton>
      <FormatButton
        label={t("code")}
        pressed={active.code}
        onClick={() => editor.chain().focus().toggleCode().run()}
      >
        <CodeIcon />
      </FormatButton>
    </BubbleMenu>
  )
}

function FormatButton({
  label,
  pressed,
  onClick,
  children,
}: {
  label: string
  pressed: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      className={cn(pressed && "bg-muted text-foreground")}
      onClick={onClick}
    >
      {children}
    </Button>
  )
}
