"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

import { useAuth } from "@/lib/auth-context"
import { homePath } from "@/lib/modules"

/** Generic entry point: sends the user to the first module enabled for them. */
export default function DashboardPage() {
  const { user } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (user) router.replace(homePath(user))
  }, [user, router])

  return null
}
