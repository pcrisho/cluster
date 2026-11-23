import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

export type MockFocus = keyof typeof vignettes

const vignettes = {
  none: "",
  center: "vignette-center",
  left: "vignette-left",
  right: "vignette-right",
} as const

export function MockStage({
  children,
  description,
  focus = "none",
}: {
  children: ReactNode
  description: string
  /** Where the eye goes: the rest of the mock melts into the page. */
  focus?: keyof typeof vignettes
}) {
  return (
    <figure className="w-full">
      <figcaption className="sr-only">{description}</figcaption>
      <div aria-hidden="true" inert className={cn(vignettes[focus])}>
        {children}
      </div>
    </figure>
  )
}
