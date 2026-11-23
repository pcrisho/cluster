"use client"

import * as React from "react"
import Link from "next/link"
import { SearchIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { resolveResultUrl, toSearchResult, type PagefindResultData, type SearchResult } from "@/lib/search"
import type { NavSection } from "@/lib/nav"

type PagefindClient = {
  init?: () => Promise<void>
  search: (query: string) => Promise<{
    results: Array<{ data: () => Promise<PagefindResultData> }>
  }>
}

function subscribeNoop() {
  return () => {}
}

async function loadPagefind(locale: string): Promise<PagefindClient | null> {
  try {
    const dynamicImport = new Function("p", "return import(p)") as (p: string) => Promise<PagefindClient>
    const mod = await dynamicImport(`/${locale}/pagefind/pagefind.js`)
    if (mod.init) await mod.init()
    return mod
  } catch {
    return null
  }
}

export function DocsSearch({
  locale,
  nav = [],
}: {
  locale: string
  nav?: NavSection[]
}) {
  const t = useTranslations("search")
  const tSections = useTranslations("sections")
  // Hidden on SSR / without JavaScript (spec: search form is hidden when JS is off).
  const mounted = React.useSyncExternalStore(subscribeNoop, () => true, () => false)
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState("")
  const [results, setResults] = React.useState<SearchResult[]>([])
  const [loading, setLoading] = React.useState(false)
  const [unavailable, setUnavailable] = React.useState(false)
  const clientRef = React.useRef<PagefindClient | null>(null)

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        setOpen((prev) => !prev)
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  const handleQueryChange = (value: string) => {
    setQuery(value)
    if (!value.trim()) {
      setResults([])
      setLoading(false)
    } else {
      setLoading(true)
    }
  }

  React.useEffect(() => {
    if (!open) return
    const trimmed = query.trim()
    if (!trimmed) return
    let cancelled = false
    ;(async () => {
      if (!clientRef.current) {
        clientRef.current = await loadPagefind(locale)
      }
      if (cancelled) return
      const client = clientRef.current
      if (!client) {
        setUnavailable(true)
        setResults([])
        setLoading(false)
        return
      }
      setUnavailable(false)
      const response = await client.search(trimmed)
      const loaded = await Promise.all(response.results.slice(0, 12).map((r) => r.data()))
      if (cancelled) return
      const mapped = loaded
        .map((item) => toSearchResult(trimmed, { ...item, url: resolveResultUrl(locale, item.url) }))
        .filter((item): item is SearchResult => item !== null)
      setResults(mapped)
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [open, query, locale])

  if (!mounted) return null

  const trimmed = query.trim()

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-label={t("button")}
          className="gap-2 text-muted-foreground"
        >
          <SearchIcon aria-hidden />
          <span className="hidden sm:inline">{t("button")}</span>
          <kbd className="hidden rounded border border-border bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground md:inline">
            {t("shortcut")}
          </kbd>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription className="sr-only">{t("description")}</DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 rounded-lg border border-input bg-background px-3">
          <SearchIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(event) => handleQueryChange(event.target.value)}
            placeholder={t("placeholder")}
            aria-label={t("placeholder")}
            autoFocus
            className="h-10 w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
        </div>

        <div className="max-h-80 overflow-y-auto">
          {!trimmed ? (
            <div className="flex flex-col gap-2 py-1">
              <p className="text-xs font-medium text-muted-foreground">{t("sections")}</p>
              <ul className="grid gap-1 sm:grid-cols-2">
                {nav.map((section) => {
                  const first = section.items[0]
                  if (!first) return null
                  return (
                    <li key={section.section}>
                      <Link
                        href={`/${locale}/${first.path}/`}
                        onClick={() => setOpen(false)}
                        className="flex items-center justify-between rounded-md px-2.5 py-2 text-sm text-foreground hover:bg-muted"
                      >
                        <span>{tSections(section.section)}</span>
                        <span className="text-xs text-muted-foreground">{first.frontmatter.title}</span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </div>
          ) : loading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{t("loading")}</p>
          ) : unavailable ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{t("unavailable")}</p>
          ) : results.length === 0 ? (
            <div className="flex flex-col items-center gap-1 py-6 text-center">
              <p className="text-sm font-medium text-foreground">
                {t("noResults", { query: trimmed })}
              </p>
              <p className="text-xs text-muted-foreground">{t("browseHint")}</p>
            </div>
          ) : (
            <ul className="flex flex-col gap-1">
              {results.map((item) => (
                <li key={item.url}>
                  <Link
                    href={item.url}
                    onClick={() => setOpen(false)}
                    className="flex flex-col gap-1 rounded-md px-3 py-2 hover:bg-muted"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-foreground">{item.title}</span>
                      {item.section ? (
                        <Badge variant="secondary">{item.section}</Badge>
                      ) : null}
                    </div>
                    {item.excerpt.length > 0 ? (
                      <p className="line-clamp-2 text-xs text-muted-foreground">
                        {item.excerpt.map((part, idx) =>
                          part.hit ? (
                            <mark
                              key={idx}
                              className="rounded bg-primary/15 px-0.5 text-foreground"
                            >
                              {part.text}
                            </mark>
                          ) : (
                            <React.Fragment key={idx}>{part.text}</React.Fragment>
                          )
                        )}
                      </p>
                    ) : null}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
