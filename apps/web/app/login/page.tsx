"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { motion } from "motion/react"

import { useAuth } from "@/lib/auth-context"
import { adminApi } from "@/lib/admin-api"
import { homePath } from "@/lib/modules"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { CircleAlertIcon } from "lucide-react"
import {
  Field,
  FieldLabel,
  FieldGroup,
  FieldError,
} from "@/components/ui/field"
import { PasswordInput } from "@/components/shared/password-input"

import { AuthLayout } from "@/components/auth/auth-layout"
import { MfaChallengeStep } from "@/components/auth/mfa-challenge"
import { PasswordChangeStep } from "@/components/auth/password-change-step"
import type { MfaChallenge } from "@/lib/auth-context"
import { getErrorCode, getErrorMessage } from "@/lib/api"
import { useTranslations } from "next-intl"

export default function LoginPage() {
  const t = useTranslations("auth.login")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  // One message for the whole form: it says what failed (credentials, rate limit, inactive account,
  // server) without saying which field was wrong, so it never confirms that an email exists.
  const [error, setError] = useState<{
    message: string
    code: string | null
  } | null>(null)
  const [loading, setLoading] = useState(false)
  const [challenge, setChallenge] = useState<MfaChallenge | null>(null)
  const { login, isAuthenticated, isLoading, user } = useAuth()
  const router = useRouter()

  const [registrationOpen, setRegistrationOpen] = useState(false)

  useEffect(() => {
    adminApi
      .getPublicInstance()
      .then((i) => setRegistrationOpen(i.registrationOpen))
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!isLoading && isAuthenticated && user) {
      router.push(homePath(user))
    }
  }, [isLoading, isAuthenticated, router, user])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      setChallenge(await login(email, password))
    } catch (err) {
      setError({
        message: err instanceof Error ? getErrorMessage(err) : t("failed"),
        code: getErrorCode(err),
      })
    } finally {
      setLoading(false)
    }
  }

  if (isLoading) return null
  if (isAuthenticated) return null

  // Back to the sign-in form, with the reason when the step ended on its own.
  const restart = (message?: string) => {
    setChallenge(null)
    setPassword("")
    setError(message ? { message, code: null } : null)
  }

  if (challenge)
    return (
      <AuthLayout
        variant="centered"
        mock={null}
        form={
          challenge.mfa === "PASSWORD_CHANGE" ? (
            <PasswordChangeStep challenge={challenge} onRestart={restart} />
          ) : (
            <MfaChallengeStep challenge={challenge} onRestart={restart} />
          )
        }
      />
    )

  const emailInvalid = error?.code === "VALIDATION_FAILED"
  const wrongCredentials = error?.code === "INVALID_CREDENTIALS"

  const form = (
    <div className="mx-auto w-full max-w-sm">
      <motion.h1
        className="text-[clamp(1.875rem,3.5vw,2.5rem)] text-display-tight font-light text-foreground"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
      >
        {t.rich("title", {
          accent: (chunks) => (
            <span className="font-medium text-primary">{chunks}</span>
          ),
        })}
      </motion.h1>
      <motion.p
        className="mt-3 text-base text-muted-foreground"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut", delay: 0.06 }}
      >
        {t("subtitle")}
      </motion.p>

      <form onSubmit={handleSubmit} className="mt-8">
        <FieldGroup>
          <Field
            data-invalid={emailInvalid || wrongCredentials ? true : undefined}
          >
            <FieldLabel htmlFor="email">{t("email")}</FieldLabel>
            <Input
              id="email"
              type="email"
              placeholder={t("emailPlaceholder")}
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                setError(null)
              }}
              required
              autoComplete="email"
              aria-invalid={emailInvalid || wrongCredentials ? true : undefined}
            />
            {emailInvalid && <FieldError>{t("emailInvalid")}</FieldError>}
          </Field>

          <Field data-invalid={wrongCredentials ? true : undefined}>
            <div className="flex items-center justify-between">
              <FieldLabel htmlFor="password">{t("password")}</FieldLabel>
              <Link
                href="/forgot-password"
                className="text-xs text-muted-foreground underline-offset-4 transition-colors hover:text-foreground"
              >
                {t("forgot")}
              </Link>
            </div>
            <PasswordInput
              id="password"
              value={password}
              onChange={(v) => {
                setPassword(v)
                setError(null)
              }}
              placeholder={t("passwordPlaceholder")}
              required
              autoComplete="current-password"
            />
          </Field>

          {error && !emailInvalid && (
            <Alert variant="destructive">
              <CircleAlertIcon />
              <AlertDescription>{error.message}</AlertDescription>
            </Alert>
          )}

          <Button
            type="submit"
            size="lg"
            className="w-full rounded-full"
            disabled={loading}
          >
            {loading && <Spinner data-icon="inline-start" />}
            {loading ? t("submitting") : t("submit")}
          </Button>

          {registrationOpen && (
            <p className="text-center text-sm text-muted-foreground">
              {t("noAccount")}{" "}
              <Link
                href="/register"
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                {t("signUp")}
              </Link>
            </p>
          )}
        </FieldGroup>
      </form>
    </div>
  )

  return <AuthLayout variant="centered" form={form} mock={null} />
}
