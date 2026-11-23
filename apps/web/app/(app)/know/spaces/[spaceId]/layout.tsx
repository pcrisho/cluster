import type { Metadata } from "next"

import { SpaceShell } from "@/components/know/space/space-shell"
import { getTranslations } from "next-intl/server"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.pages.space")
  return { title: t("title"), description: t("description") }
}

export default function SpaceLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <SpaceShell>{children}</SpaceShell>
}
