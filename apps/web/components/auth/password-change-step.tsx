"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"

import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import { PasswordInput } from "@/components/shared/password-input"
import { getErrorCode, getErrorMessage } from "@/lib/api"
import { useAuth, type MfaChallenge } from "@/lib/auth-context"
import { MfaChallengeStep } from "./mfa-challenge"

/**
 * The step after a correct initial password (docs/specs/auth/access-without-mail): the person chooses their own.
 * Then the 2FA step when it is due; otherwise the session starts and the sign-in page leaves for home.
 */
export function PasswordChangeStep({
  challenge,
  onRestart,
}: {
  challenge: MfaChallenge
  /** Back to the sign-in form, with the reason when the step ended on its own. */
  onRestart: (message?: string) => void
}) {
  const t = useTranslations("auth.passwordChange")
  const tv = useTranslations("auth.validation")
  const { setInitialPassword } = useAuth()
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [next, setNext] = useState<MfaChallenge | null>(null)

  if (next) return <MfaChallengeStep challenge={next} onRestart={onRestart} />

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirm) {
      setError(tv("passwordMismatch"))
      return
    }
    setLoading(true)
    setError(null)
    try {
      const step = await setInitialPassword(challenge.challengeId, password)
      if (step) setNext(step)
    } catch (err) {
      // The step is over (time or attempts): start again from the sign-in form.
      if (getErrorCode(err) === "CHALLENGE_ENDED") {
        onRestart(getErrorMessage(err))
        return
      }
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-sm">
      <h1 className="text-[clamp(1.875rem,3.5vw,2.5rem)] text-display-tight font-light text-foreground">
        {t.rich("title", {
          accent: (chunks) => <span className="font-medium text-primary">{chunks}</span>,
        })}
      </h1>
      <p className="mt-3 text-base text-muted-foreground">{t("subtitle")}</p>
      <form onSubmit={handleSubmit} className="mt-8">
        <FieldGroup>
          <Field data-invalid={!!error}>
            <FieldLabel htmlFor="new-password">{t("newPassword")}</FieldLabel>
            <PasswordInput
              id="new-password"
              value={password}
              onChange={setPassword}
              showStrength
              required
              minLength={12}
              autoComplete="new-password"
            />
            <FieldDescription>{tv("passwordRule")}</FieldDescription>
          </Field>
          <Field data-invalid={!!error}>
            <FieldLabel htmlFor="confirm-password">{t("confirmPassword")}</FieldLabel>
            <PasswordInput
              id="confirm-password"
              value={confirm}
              onChange={setConfirm}
              required
              autoComplete="new-password"
            />
            <FieldError>{error}</FieldError>
          </Field>
          <Button type="submit" size="lg" className="w-full rounded-full" disabled={loading}>
            {loading && <Spinner data-icon="inline-start" />}
            {t("submit")}
          </Button>
        </FieldGroup>
      </form>
      <Button
        type="button"
        variant="link"
        className="mt-4 w-full text-muted-foreground"
        onClick={() => onRestart()}
      >
        {t("back")}
      </Button>
    </div>
  )
}
