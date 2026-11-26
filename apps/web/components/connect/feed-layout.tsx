import { type ReactNode } from "react"

interface FeedLayoutProps {
  children: ReactNode
}

export function FeedLayout({ children }: FeedLayoutProps) {
  return <div className="mx-auto w-full max-w-2xl px-4 py-6">{children}</div>
}
