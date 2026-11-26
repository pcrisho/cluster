"use client"

import { useEffect, useState } from "react"
import { ArrowUpIcon } from "lucide-react"
import { useTranslations } from "next-intl"

import { Button } from "@/components/ui/button"

const SHOW_AFTER_PX = 800

/** Floating button that brings the feed back to the top once the reader has scrolled down. */
export function BackToTop() {
  const t = useTranslations("connect.feed")
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > SHOW_AFTER_PX)
    // A reload can restore a scrolled position: read it once, out of the effect body.
    queueMicrotask(onScroll)
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  if (!visible) return null

  return (
    <Button
      type="button"
      size="icon"
      variant="secondary"
      className="fixed right-4 bottom-4 z-40 rounded-full shadow-md md:right-8 md:bottom-8"
      aria-label={t("backToTop")}
      title={t("backToTop")}
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
    >
      <ArrowUpIcon />
    </Button>
  )
}
