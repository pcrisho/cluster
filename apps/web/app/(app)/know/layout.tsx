import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.pages.know")
  return { title: t("title"), description: t("description") }
}

export default function KnowLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <div className="flex flex-1 flex-col">{children}</div>
}
