import { useTranslations } from "next-intl"
import { CheckIcon } from "lucide-react"

import { accent } from "./accent"
import { Aurora } from "./aurora"
import { SectionHeader } from "./section-header"
import { Button } from "@/components/ui/button"
import { getDemoUrl } from "@/lib/demo-url"
import { cn } from "@/lib/utils"

// What is free (MIT) and what the commercial plan adds. The paid items are offered on request:
// none of them is in the product yet, so nothing here says they ship.
function Column({
  items,
  note,
  title,
  children,
  highlight = false,
}: {
  items: string[]
  note: string
  title: string
  children?: React.ReactNode
  highlight?: boolean
}) {
  return (
    <div
      className={cn(
        "flex flex-col rounded-2xl glass-panel p-6 sm:p-8",
        highlight && "ring-1 ring-primary/40"
      )}
    >
      <div className="flex items-baseline justify-between gap-4">
        <h3 className="text-xl font-semibold tracking-tight text-foreground">
          {title}
        </h3>
        <span className="font-accent text-lg text-muted-foreground">
          {note}
        </span>
      </div>
      <ul className="mt-6 flex flex-1 flex-col gap-3">
        {items.map((item) => (
          <li
            className="flex items-start gap-3 text-sm text-foreground"
            key={item}
          >
            <CheckIcon
              className="mt-0.5 size-4 shrink-0 text-primary"
              aria-hidden
            />
            {item}
          </li>
        ))}
      </ul>
      {children}
    </div>
  )
}

export function OpenCoreSection() {
  const t = useTranslations("openCore")
  const demoUrl = getDemoUrl()
  const isExternal = Boolean(demoUrl && demoUrl.startsWith("https:"))

  return (
    <section
      id="open-core"
      className="relative isolate scroll-mt-20 py-20 sm:py-28"
    >
      <Aurora />
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <SectionHeader
          title={t.rich("title", { accent })}
          subtitle={t("subtitle")}
        />
        <div className="grid gap-4 lg:grid-cols-2">
          <Column
            title={t("free.title")}
            note={t("free.note")}
            items={[1, 2, 3, 4, 5].map((n) => t(`free.item${n}`))}
          />
          <Column
            highlight
            title={t("paid.title")}
            note={t("paid.note")}
            items={[1, 2, 3, 4].map((n) => t(`paid.item${n}`))}
          >
            <Button asChild className="mt-8 self-start">
              <a
                href={demoUrl ?? "#contact"}
                {...(isExternal
                  ? { target: "_blank", rel: "noopener noreferrer" }
                  : {})}
              >
                {t("paid.cta")}
              </a>
            </Button>
          </Column>
        </div>
      </div>
    </section>
  )
}
