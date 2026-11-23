import type { ReactNode } from "react"

export function Steps({ children }: { children: ReactNode }) {
  return (
    <div className="steps my-6 border-l-2 border-border pl-5 [&>ol]:list-decimal [&>ol]:space-y-3 [&>ol]:pl-4">
      {children}
    </div>
  )
}
