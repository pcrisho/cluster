"use client"

import { useEffect, useState } from "react"
import Link from "next/link"

import { AuthLayout } from "@/components/auth/auth-layout"
import { Button } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { adminApi } from "@/lib/admin-api"
import { getErrorMessage } from "@/lib/api"
import { useTranslations } from "next-intl"

export default function ForgotPasswordPage() {
  const t = useTranslations("auth.forgot")
  const [email, setEmail] = useState("")
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mailEnabled, setMailEnabled] = useState(true)

  useEffect(() => {
    adminApi
      .getPublicInstance()
      .then((i) => setMailEnabled(i.mailEnabled))
      .catch(() => {})
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      await adminApi.forgotPassword(email)
      setSent(true)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  const form = (
    <div className="mx-auto w-full max-w-sm">
      <h1 className="text-[clamp(1.875rem,3.5vw,2.5rem)] font-light text-foreground">
        {t.rich("title", {
          accent: (chunks) => (
            <span className="font-medium text-primary">{chunks}</span>
          ),
        })}
      </h1>
      {!mailEnabled ? (
        <p className="mt-3 text-base text-muted-foreground">{t("mailOff")}</p>
      ) : sent ? (
        <p className="mt-3 text-base text-muted-foreground">
          {t.rich("sent", {
            email,
            strong: (chunks) => <strong>{chunks}</strong>,
          })}
        </p>
      ) : (
        <>
          <p className="mt-3 text-base text-muted-foreground">{t("intro")}</p>
          <form onSubmit={handleSubmit} className="mt-8">
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="email">{t("email")}</FieldLabel>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </Field>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button
                type="submit"
                size="lg"
                className="w-full rounded-full"
                disabled={loading}
              >
                {loading && <Spinner data-icon="inline-start" />}
                {t("submit")}
              </Button>
            </FieldGroup>
          </form>
        </>
      )}
      <p className="mt-6 text-center text-sm text-muted-foreground">
        <Link
          href="/login"
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          {t("back")}
        </Link>
      </p>
    </div>
  )

  return <AuthLayout variant="centered" form={form} mock={null} />
}
