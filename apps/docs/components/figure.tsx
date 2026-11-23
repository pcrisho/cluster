import type { ComponentPropsWithoutRef } from "react"
import { darkSibling } from "@/lib/figure-src"
import { cn } from "@/lib/utils"

const IMG = "w-full rounded-xl border border-border bg-card"

export function Figure({ src, alt, title }: ComponentPropsWithoutRef<"img">) {
  const light = typeof src === "string" ? src : undefined
  const dark = light ? darkSibling(light) : undefined
  return (
    <figure className="my-6">
      {/* eslint-disable-next-line @next/next/no-img-element -- static export, unoptimized assets */}
      <img src={light} alt={alt ?? ""} className={cn(IMG, dark && "dark:hidden")} />
      {dark ? (
        // Without JS no `dark` class is set, so the light image shows.
        // eslint-disable-next-line @next/next/no-img-element -- static export, unoptimized assets
        <img src={dark} alt={alt ?? ""} loading="lazy" className={cn(IMG, "hidden dark:block")} />
      ) : null}
      {title ? (
        <figcaption className="mt-2 text-sm text-muted-foreground">{title}</figcaption>
      ) : null}
    </figure>
  )
}
