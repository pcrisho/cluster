"use client"

import dynamic from "next/dynamic"
import { SilkFallback } from "@/components/silk/silk-fallback"

export const HeroSilk = dynamic(
  () =>
    import("@/components/silk/silk-background").then((m) => m.SilkBackground),
  {
    ssr: false,
    loading: () => <SilkFallback />,
  }
)
