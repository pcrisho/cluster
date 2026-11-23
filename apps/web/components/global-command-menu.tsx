"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import {
  FileTextIcon,
  CornerDownLeftIcon,
  CompassIcon,
  ClockIcon,
} from "lucide-react"

import { knowApi, type SearchResult } from "@/lib/know-api"
import { visibleNavGroups, type NavRoute } from "@/lib/navigation"
import { useAuth } from "@/lib/auth-context"
import { onOpenCommandMenu } from "@/lib/command-menu"
import {
  getRecentPages,
  subscribeRecentPages,
  addRecentPage,
  type RecentPage,
} from "@/lib/recent-pages"
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command"
import { Skeleton } from "@/components/ui/skeleton"
import { useTranslations } from "next-intl"

const SEARCH_DEBOUNCE_MS = 200

export function GlobalCommandMenu() {
  const router = useRouter()
  const { user } = useAuth()
  const t = useTranslations("shell.commandMenu")
  const tNav = useTranslations("shell.nav")
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState("")
  const [results, setResults] = React.useState<SearchResult[]>([])
  const [isSearching, setIsSearching] = React.useState(false)
  const [searchError, setSearchError] = React.useState(false)
  const [recent, setRecent] = React.useState<RecentPage[]>([])
  const requestIdRef = React.useRef(0)

  const trimmed = query.trim()

  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((prev) => !prev)
      }
    }
    document.addEventListener("keydown", down)
    const unsubscribe = onOpenCommandMenu(() => setOpen(true))
    return () => {
      document.removeEventListener("keydown", down)
      unsubscribe()
    }
  }, [])

  React.useEffect(() => {
    if (!open) return
    // Schedule the recent-pages read out of the effect body to
    // satisfy the set-state-in-effect rule.
    queueMicrotask(() => setRecent(getRecentPages()))
    const unsubscribe = subscribeRecentPages(() => {
      setRecent(getRecentPages())
    })
    return unsubscribe
  }, [open])

  React.useEffect(() => {
    if (!open) {
      queueMicrotask(() => {
        setQuery("")
        setResults([])
        setIsSearching(false)
        setSearchError(false)
      })
      return
    }
    if (!trimmed) {
      queueMicrotask(() => {
        setResults([])
        setSearchError(false)
      })
      return
    }
    const currentRequest = ++requestIdRef.current
    queueMicrotask(() => {
      setIsSearching(true)
      setSearchError(false)
    })
    const timer = setTimeout(async () => {
      try {
        const res = await knowApi.search(trimmed)
        if (requestIdRef.current === currentRequest) {
          setResults(res.data)
          setIsSearching(false)
        }
      } catch {
        if (requestIdRef.current === currentRequest) {
          setResults([])
          setSearchError(true)
          setIsSearching(false)
        }
      }
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [trimmed, open])

  const handleSelectResult = (result: SearchResult) => {
    addRecentPage({
      id: result.id,
      title: result.title,
      spaceId: result.space.id,
      spaceName: result.space.name,
    })
    setOpen(false)
    router.push(
      `/know/spaces/${result.space.id}/${result.id}`
    )
  }

  const handleSelectRecent = (page: RecentPage) => {
    setOpen(false)
    router.push(`/know/spaces/${page.spaceId}/${page.id}`)
  }

  const handleSelectRoute = (route: NavRoute) => {
    setOpen(false)
    router.push(route.href)
  }

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <Command shouldFilter={false} label={t("label")}>
        <CommandInput
          placeholder={t("placeholder")}
          value={query}
          onValueChange={setQuery}
        />
        <CommandList>
          {trimmed ? (
            <>
              {isSearching ? (
                <CommandGroup heading={t("pages")}>
                  {Array.from({ length: 3 }).map((_, i) => (
                    <CommandItem key={i} value={`loading-${i}`} disabled>
                      <Skeleton className="size-4 shrink-0" />
                      <div className="min-w-0 flex-1 space-y-1">
                        <Skeleton className="h-3.5 w-3/4" />
                        <Skeleton className="h-3 w-1/2" />
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : searchError ? (
                <CommandEmpty>{t("unavailable")}</CommandEmpty>
              ) : results.length === 0 ? (
                <CommandEmpty>{t("noResults", { query: trimmed })}</CommandEmpty>
              ) : (
                <CommandGroup heading={t("pages")}>
                  {results.map((result) => (
                    <CommandItem
                      key={result.id}
                      value={`${result.title} ${result.space.name}`}
                      onSelect={() => handleSelectResult(result)}
                    >
                      <FileTextIcon />
                      <span className="truncate">{result.title}</span>
                      <span className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
                        {result.space.name}
                        <CornerDownLeftIcon className="size-3 opacity-0 group-data-[selected=true]/command-item:opacity-100" />
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </>
          ) : (
            <>
              {recent.length > 0 && (
                <CommandGroup heading={t("recent")}>
                  {recent.map((page) => (
                    <CommandItem
                      key={page.id}
                      value={`recent-${page.title} ${page.spaceName}`}
                      onSelect={() => handleSelectRecent(page)}
                    >
                      <ClockIcon />
                      <span className="truncate">{page.title}</span>
                      <span className="ml-auto text-xs text-muted-foreground">
                        {page.spaceName}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}

              {recent.length > 0 && <CommandSeparator />}

              {visibleNavGroups(user).map((group) => (
                <CommandGroup
                  key={group.title}
                  heading={group.module ? group.title : tNav("settings")}
                >
                  {group.subgroups
                    .flatMap((subgroup) => subgroup.items)
                    .map((item) => {
                      const Icon = item.icon
                      return (
                        <CommandItem
                          key={item.href}
                          value={`${group.title} ${tNav(item.label)} ${item.href}`}
                          onSelect={() => handleSelectRoute(item)}
                          className="group/command-item"
                        >
                          <Icon />
                          <span className="truncate">{tNav(item.label)}</span>
                            <CornerDownLeftIcon className="ml-auto size-3 shrink-0 opacity-0 group-data-[selected=true]/command-item:opacity-100" />
                        </CommandItem>
                      )
                    })}
                </CommandGroup>
              ))}

              {recent.length === 0 && (
                <div className="flex items-center gap-2 px-2 py-3 text-center text-xs text-muted-foreground">
                  <CompassIcon className="mx-auto size-4 opacity-50" />
                  <span>{t("hint")}</span>
                </div>
              )}
            </>
          )}
        </CommandList>
      </Command>
    </CommandDialog>
  )
}
