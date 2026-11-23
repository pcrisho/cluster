"use client"

import * as React from "react"

import { cn } from "@/lib/utils"
import { useTranslations } from "next-intl"

export interface TocItem {
  id: string
  text: string
  level: number
}

interface PageTocProps {
  items: TocItem[]
  className?: string
}

export function PageToc({ items, className }: PageTocProps) {
  const t = useTranslations("know.toc")
  const [activeId, setActiveId] = React.useState<string | null>(
    items[0]?.id ?? null
  )

  React.useEffect(() => {
    if (items.length === 0) return
    const headings = items
      .map((i) => document.getElementById(i.id))
      .filter((el): el is HTMLElement => el !== null)

    if (headings.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort(
            (a, b) =>
              a.target.getBoundingClientRect().top -
              b.target.getBoundingClientRect().top
          )
        if (visible[0]) {
          setActiveId(visible[0].target.id)
        }
      },
      { rootMargin: "-80px 0px -60% 0px", threshold: [0, 1] }
    )

    headings.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [items])

  if (items.length === 0) return null

  return (
    <nav
      aria-label={t("label")}
      className={cn(
        "sticky top-20 hidden max-h-[calc(100vh-5rem)] overflow-y-auto xl:block",
        className
      )}
    >
      <ul className="space-y-1 text-sm">
        {items.map((item) => {
          const isActive = activeId === item.id
          return (
            <li
              key={item.id}
              style={{ paddingLeft: `${(item.level - 1) * 12 + 12}px` }}
            >
              <a
                href={`#${item.id}`}
                className={cn(
                  "-ml-px block border-l-2 py-1 pl-3 leading-snug transition-colors",
                  isActive
                    ? "border-foreground font-medium text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                {item.text}
              </a>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

export function extractToc(content: string): TocItem[] {
  if (!content) return []
  let doc: { type?: string; content?: TocNode[] } | null = null
  try {
    doc = JSON.parse(content)
  } catch {
    return []
  }
  if (!doc || doc.type !== "doc" || !Array.isArray(doc.content)) return []

  const items: TocItem[] = []
  const slugCounts = new Map<string, number>()

  const slugify = (text: string) =>
    text
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 60) || "section"

  const walk = (nodes: TocNode[]) => {
    for (const node of nodes) {
      if (!node || node.type !== "heading") continue
      const level = typeof node.attrs?.level === "number" ? node.attrs.level : 0
      if (level < 1 || level > 3) continue
      const text = (node.content ?? [])
        .map((c) => (typeof c.text === "string" ? c.text : ""))
        .join("")
        .trim()
      if (!text) continue
      let id = slugify(text)
      const count = slugCounts.get(id) ?? 0
      slugCounts.set(id, count + 1)
      if (count > 0) id = `${id}-${count}`
      items.push({ id, text, level })
    }
  }

  walk(doc.content)
  return items
}

interface TocNode {
  type?: string
  attrs?: { level?: number }
  text?: string
  content?: TocNode[]
}
