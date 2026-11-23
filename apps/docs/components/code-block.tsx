"use client"

import * as React from "react"
import { CheckIcon, CopyIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"

function subscribeNoop() {
  return () => {}
}

export function CodeBlock({ children, ...props }: React.ComponentPropsWithoutRef<"pre">) {
  const t = useTranslations("ui")
  const preRef = React.useRef<HTMLPreElement>(null)
  const mounted = React.useSyncExternalStore(subscribeNoop, () => true, () => false)
  const [copied, setCopied] = React.useState(false)

  const handleCopy = async () => {
    const text = preRef.current?.innerText ?? ""
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      // Clipboard may be unavailable in restricted contexts.
    }
  }

  return (
    <div className="group relative my-4">
      <pre
        ref={preRef}
        className="overflow-x-auto rounded-xl border border-border bg-muted p-4 text-sm leading-relaxed"
        {...props}
      >
        {children}
      </pre>
      {mounted ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={handleCopy}
          aria-label={copied ? t("copied") : t("copy")}
          title={copied ? t("copied") : t("copy")}
          className="absolute top-2.5 right-2.5 bg-background/80 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
        >
          {copied ? <CheckIcon aria-hidden /> : <CopyIcon aria-hidden />}
        </Button>
      ) : null}
    </div>
  )
}
