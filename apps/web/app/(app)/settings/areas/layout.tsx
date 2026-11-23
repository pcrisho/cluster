import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.pages.areas")
  return { title: t("title"), description: t("description") }
}

export default function AreasLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
