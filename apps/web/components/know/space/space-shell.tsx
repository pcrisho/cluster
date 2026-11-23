"use client"

import { useState, type ReactNode } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { FileStackIcon, PanelLeftIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import { Skeleton } from "@/components/ui/skeleton"
import { useIsBelow } from "@/hooks/use-mobile"
import { SpaceProvider, useSpace } from "@/components/know/space/space-context"
import { SpaceSidebar } from "@/components/know/space/space-sidebar"
import { useTranslations } from "next-intl"

/** Frame shared by a space's home and its pages: a persistent page tree beside the content. */
export function SpaceShell({ children }: { children: ReactNode }) {
  const { spaceId } = useParams<{ spaceId: string }>()
  return (
    <SpaceProvider key={spaceId} spaceId={spaceId}>
      <Frame>{children}</Frame>
    </SpaceProvider>
  )
}

function Frame({ children }: { children: ReactNode }) {
  const t = useTranslations("know.space")
  const { space, isLoading, error } = useSpace()
  const [drawerOpen, setDrawerOpen] = useState(false)
  // Below 1024 px (a tablet, or a laptop with the app sidebar open) the page tree would leave the
  // content a narrow strip: it moves into the "Pages" sheet, as GROW's player does with its outline.
  const compact = useIsBelow(1024)

  if (isLoading) {
    return (
      <div className="flex flex-1">
        <div className="hidden w-72 shrink-0 flex-col gap-2 border-r p-3 lg:flex">
          <Skeleton className="h-9" />
          <Skeleton className="h-6 w-16" />
          <Skeleton className="h-7" />
          <Skeleton className="h-7" />
          <Skeleton className="h-7" />
        </div>
        <div className="flex-1 space-y-4 p-6">
          <Skeleton className="h-10 w-72" />
          <Skeleton className="h-4 w-96" />
        </div>
      </div>
    )
  }

  if (error || !space) {
    return (
      <Empty className="py-20">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FileStackIcon />
          </EmptyMedia>
          <EmptyTitle>{t("notFound")}</EmptyTitle>
          <EmptyDescription>{error ?? t("notFoundBody")}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button asChild variant="outline">
            <Link href="/know">{t("backToKnow")}</Link>
          </Button>
        </EmptyContent>
      </Empty>
    )
  }

  const content = (
    <div className="min-w-0 flex-1">
      <div className="flex items-center gap-2 border-b px-4 py-2 lg:hidden">
        <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" size="sm">
              <PanelLeftIcon data-icon="inline-start" />
              {t("pages")}
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 p-0">
            <SheetHeader className="sr-only">
              <SheetTitle>{t("pages")}</SheetTitle>
              <SheetDescription>{t("pagesOfSpace")}</SheetDescription>
            </SheetHeader>
            <div className="min-h-0 flex-1 overflow-y-auto pt-8">
              <SpaceSidebar onNavigate={() => setDrawerOpen(false)} />
            </div>
          </SheetContent>
        </Sheet>
      </div>
      {children}
    </div>
  )

  if (compact) return <div className="flex flex-1">{content}</div>

  return (
    // overflow visible on the group and its panels: the sidebar sticks to the viewport, which
    // any scrolling ancestor would break.
    <ResizablePanelGroup
      orientation="horizontal"
      className="h-auto flex-1"
      style={{ overflow: "visible" }}
    >
      <ResizablePanel
        id="sidebar"
        defaultSize="288px"
        minSize="200px"
        maxSize="480px"
        groupResizeBehavior="preserve-pixel-size"
        style={{ overflow: "visible" }}
      >
        <aside className="sticky top-16 h-[calc(100svh-4rem)]">
          <SpaceSidebar />
        </aside>
      </ResizablePanel>
      <ResizableHandle />
      <ResizablePanel id="content" style={{ overflow: "visible" }}>
        {content}
      </ResizablePanel>
    </ResizablePanelGroup>
  )
}
