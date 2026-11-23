"use client"

import { useState } from "react"
import { CheckIcon, CopyIcon } from "lucide-react"
import { useTranslations } from "next-intl"

// The first install step, copyable. Shown only once the repository is public (NEXT_PUBLIC_GITHUB_URL).
export function CopyCommand({ command }: { command: string }) {
  const t = useTranslations("hero")
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(command)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // No clipboard (insecure context, denied): the command stays selectable.
    }
  }

  return (
    <div className="flex h-11 max-w-full items-center gap-3 rounded-lg glass-panel pr-1.5 pl-4 font-mono text-sm text-foreground">
      <span className="text-primary select-none" aria-hidden>
        $
      </span>
      <code className="truncate">{command}</code>
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? t("copied") : t("copyCommand")}
        className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
      >
        {copied ? (
          <CheckIcon className="size-4 text-success" aria-hidden />
        ) : (
          <CopyIcon className="size-4" aria-hidden />
        )}
      </button>
    </div>
  )
}
