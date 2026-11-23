import type { ReactNode } from "react"

export function SectionHeader({
  title,
  subtitle,
}: {
  title: ReactNode
  subtitle: string
}) {
  return (
    <div className="mb-12 max-w-2xl sm:mb-16">
      <h2 className="text-display-2 text-display-tight font-semibold tracking-tight text-balance text-foreground">
        {title}
      </h2>
      <p className="mt-4 text-base leading-relaxed text-pretty text-foreground/75 sm:text-lg">
        {subtitle}
      </p>
    </div>
  )
}
