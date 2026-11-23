"use client"

import { Suspense, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"

import { AuthLayout } from "@/components/auth/auth-layout"
import { MfaChallengeStep } from "@/components/auth/mfa-challenge"
import type { MfaChallenge } from "@/lib/auth-context"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import { PasswordInput } from "@/components/shared/password-input"
import { useAuth } from "@/lib/auth-context"
import { homePath } from "@/lib/modules"
import { getErrorMessage } from "@/lib/api"
import { useTranslations } from "next-intl"

/** Target of invitation and password-reset emails: /set-password?token=… */
function SetPasswordForm() {
  const t = useTranslations("auth.setPassword")
  const tv = useTranslations("auth.validation")
  const searchParams = useSearchParams()
  // Read once: the token then leaves the address bar and the history (docs/specs/auth/hardening R-33).
  const [token] = useState(() => searchParams.get("token") ?? "")
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has("token"))
      window.history.replaceState(null, "", window.location.pathname)
  }, [])
  const { setPassword, user } = useAuth()
  const router = useRouter()
  const [password, setPasswordValue] = useState("")
  const [confirm, setConfirm] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [challenge, setChallenge] = useState<MfaChallenge | null>(null)

  useEffect(() => {
    if (done && user) router.push(homePath(user))
  }, [done, user, router])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirm) {
      setError(tv("passwordMismatch"))
      return
    }
    setLoading(true)
    setError(null)
    try {
      // The password is set either way; with 2FA the session waits for the code.
      setChallenge(await setPassword(token, password))
      setDone(true)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  if (challenge)
    return (
      <MfaChallengeStep
        challenge={challenge}
        onRestart={() => router.push("/login")}
      />
    )

  return (
    <div className="mx-auto w-full max-w-sm">
      <h1 className="text-[clamp(1.875rem,3.5vw,2.5rem)] font-light text-foreground">
        {t.rich("title", {
          accent: (chunks) => (
            <span className="font-medium text-primary">{chunks}</span>
          ),
        })}
      </h1>
      {!token ? (
        <p className="mt-3 text-base text-muted-foreground">
          {t.rich("incomplete", {
            link: (chunks) => (
              <Link
                href="/forgot-password"
                className="text-primary underline-offset-4 hover:underline"
              >
                {chunks}
              </Link>
            ),
          })}
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="mt-8">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="password">{t("newPassword")}</FieldLabel>
              <PasswordInput
                id="password"
                value={password}
                onChange={setPasswordValue}
                showStrength
                required
                minLength={12}
                autoComplete="new-password"
              />
              <FieldDescription>{tv("passwordRule")}</FieldDescription>
            </Field>
            <Field data-invalid={!!error}>
              <FieldLabel htmlFor="confirm">{t("confirmPassword")}</FieldLabel>
              <PasswordInput
                id="confirm"
                value={confirm}
                onChange={setConfirm}
                required
                autoComplete="new-password"
              />
              <FieldError>{error}</FieldError>
            </Field>
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
      )}
    </div>
  )
}

export default function SetPasswordPage() {
  return (
    <AuthLayout
      variant="centered"
      mock={null}
      form={
        <Suspense fallback={null}>
          <SetPasswordForm />
        </Suspense>
      }
    />
  )
}
