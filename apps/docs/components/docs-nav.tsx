import Link from "next/link"
import { useTranslations } from "next-intl"
import { cn } from "@/lib/utils"
import type { NavSection } from "@/lib/nav"

// The section tree. Shared by the desktop sidebar and the menu below 1024 px.
export function DocsNav({ locale, nav, current }: { locale: string; nav: NavSection[]; current?: string }) {
  const t = useTranslations("sections")
  return (
    <ul className="flex flex-col gap-6 text-sm">
      {nav.map(({ section, items }) => (
        <li key={section}>
          <p className="mb-2 font-medium text-foreground">{t(section)}</p>
          <ul className="flex flex-col gap-1 border-l border-border">
            {items.map((page) => {
              const active = page.path === current
              return (
                <li key={page.path}>
                  <Link
                    href={`/${locale}/${page.path}/`}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "-ml-px block border-l-2 border-transparent py-1 pl-3 text-muted-foreground transition-colors hover:text-foreground",
                      active && "border-primary font-medium text-foreground"
                    )}
                  >
                    {page.frontmatter.title}
                  </Link>
                </li>
              )
            })}
          </ul>
        </li>
      ))}
    </ul>
  )
}
