"use client"

import type { ReactNode } from "react"
import Link from "next/link"
import { motion } from "motion/react"
import { useTranslations } from "next-intl"
import { ClusterWordmark } from "@/components/shared/cluster-wordmark"

interface AuthLayoutProps {
  form: ReactNode
  mock: ReactNode
  variant?: "centered" | "split"
}

export function AuthLayout({ form, mock, variant = "split" }: AuthLayoutProps) {
  const t = useTranslations("auth.layout")
  return (
    <div className="relative flex min-h-svh flex-col overflow-hidden bg-background">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-grid-fade opacity-30"
      />

      {/* Logo */}
      <header className="absolute top-0 left-0 z-10 p-6">
        <Link href="/" aria-label={t("home")}>
          <ClusterWordmark label="Cluster" className="h-8 w-auto text-foreground" />
        </Link>
      </header>

      {variant === "centered" ? (
        // pt-24 clears the logo when the content is taller than the screen (2FA setup on a phone).
        <main className="relative flex flex-1 items-center justify-center px-4 pt-24 pb-12 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          >
            {form}
          </motion.div>
        </main>
      ) : (
        <main className="relative flex flex-1 items-center justify-center px-4 py-12 sm:px-6 lg:px-8">
          <div className="grid w-full max-w-6xl grid-cols-1 items-center gap-12 lg:grid-cols-2 lg:gap-16">
            <motion.div
              className="order-1 flex justify-center lg:order-2 lg:justify-end"
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className="w-full max-w-[420px]">{mock}</div>
            </motion.div>

            <motion.div
              className="order-2 lg:order-1"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
            >
              {form}
            </motion.div>
          </div>
        </main>
      )}
    </div>
  )
}
