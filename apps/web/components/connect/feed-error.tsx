"use client"

import { Button } from "@/components/ui/button"
import { useTranslations } from "next-intl"

interface FeedErrorProps {
  message: string
  onRetry: () => void
}

export function FeedError({ message, onRetry }: FeedErrorProps) {
  const t = useTranslations("connect.feed")
  return (
    <div className="flex flex-col items-center justify-center gap-6 py-20">
      <div className="rounded-full bg-muted p-6">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="48"
          height="48"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-muted-foreground"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </div>
      <div className="text-center">
        <h3 className="text-lg font-medium">{t("error")}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{message}</p>
      </div>
      <Button variant="outline" onClick={onRetry}>
        {t("tryAgain")}
      </Button>
    </div>
  )
}
