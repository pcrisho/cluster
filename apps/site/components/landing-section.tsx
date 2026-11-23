import type { ReactNode } from "react"

import { CheckIcon } from "lucide-react"

import { Aurora } from "./aurora"

export function LandingSection({
  bullets,
  children,
  description,
  id,
  name,
  role,
  title,
}: {
  bullets: string[]
  children: ReactNode
  description: string
  id: string
  name: string
  role: string
  title: ReactNode
}) {
  return (
    <section id={id} className="relative isolate scroll-mt-20 py-20 sm:py-28">
      <Aurora />
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:gap-16">
          <div className="flex flex-col items-start">
            {/* The module's name is what the header and the app call it; the role says what it is for. */}
            <p className="flex items-baseline gap-2 text-sm">
              <span className="font-semibold tracking-wide text-primary">
                {name}
              </span>
              <span className="text-muted-foreground">{role}</span>
            </p>
            <h2 className="mt-4 max-w-2xl text-display-2 text-display-tight font-semibold tracking-tight text-balance text-foreground">
              {title}
            </h2>
          </div>
          <div className="flex flex-col items-start lg:pt-9">
            <p className="max-w-2xl text-base leading-relaxed text-pretty text-foreground/75 sm:text-lg">
              {description}
            </p>
            <ul className="mt-6 flex flex-col gap-3">
              {bullets.map((bullet) => (
                <li
                  className="flex items-start gap-3 text-sm text-foreground"
                  key={bullet}
                >
                  <CheckIcon
                    className="mt-0.5 size-4 shrink-0 text-primary"
                    aria-hidden
                  />
                  <span>{bullet}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="mt-12 sm:mt-16">{children}</div>
      </div>
    </section>
  )
}
