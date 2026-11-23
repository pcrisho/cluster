import type { ReactNode } from "react"

// `<accent>…</accent>` in a catalog title: the phrase in the accent face (t.rich), on its own line
// from sm up like the hero's (blur-text.tsx).
export const accent = (chunks: ReactNode) => (
  <>
    <br className="hidden sm:inline" />
    <span className="font-accent">{chunks}</span>
  </>
)
