import type { ReactNode } from "react"

import { AppHeader, type AppCrumb } from "./app-header"
import { AppSidebar } from "./app-sidebar"

// `sidebar` shows the whole shell (the hero); without it the window is the screen's content only.
export function AppWindow({
  children,
  crumbs,
  sidebar,
}: {
  children: ReactNode
  crumbs: AppCrumb[]
  sidebar?: boolean
}) {
  return (
    <div className="mock-window relative w-full overflow-hidden rounded-xl border border-border bg-background shadow-2xl">
      <div
        className={`flex min-w-[560px] bg-background text-foreground ${sidebar ? "xl:min-w-[1080px]" : ""}`}
      >
        {sidebar && <AppSidebar />}
        <div className="flex min-w-0 flex-1 flex-col">
          <AppHeader crumbs={crumbs} />
          <div className="min-h-0 flex-1">{children}</div>
        </div>
      </div>
    </div>
  )
}
