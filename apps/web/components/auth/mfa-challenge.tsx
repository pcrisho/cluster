"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"

import { Button } from "@/components/ui/button"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { api, getErrorCode, getErrorMessage } from "@/lib/api"
import { useAuth, type MfaChallenge } from "@/lib/auth-context"
import { CodeInput } from "./code-input"
import { MfaEnroll } from "./mfa-enroll"

/**
 * The step after a correct password when a code is due: enter it (or a recovery code), or, for a role
 * that requires 2FA and has none yet, set it up. The session starts when the step is done.
 */
export function MfaChallengeStep({
  challenge,
  onRestart,
}: {
  challenge: MfaChallenge
  /** Back to the password, with the reason when the step ended on its own. */
  onRestart: (message?: string) => void
}) {
  const t = useTranslations("auth.mfa")
  const accent = (chunks: React.ReactNode) => (
    <span className="font-medium text-primary">{chunks}</span>
  )
  const enroll = challenge.mfa === "ENROLL"
  return (
    <div className="mx-auto w-full max-w-sm">
      <h1 className="text-[clamp(1.875rem,3.5vw,2.5rem)] text-display-tight font-light text-foreground">
        {t.rich(enroll ? "enrollTitle" : "verifyTitle", { accent })}
      </h1>
      {enroll ? (
        <EnrollStep challengeId={challenge.challengeId} />
      ) : (
        <VerifyStep challengeId={challenge.challengeId} onRestart={onRestart} />
      )}
      <Button
        type="button"
        variant="link"
        className="mt-4 w-full text-muted-foreground"
        onClick={() => onRestart()}
      >
        {t("backToSignIn")}
      </Button>
    </div>
  )
}

function EnrollStep({ challengeId }: { challengeId: string }) {
  const t = useTranslations("auth.mfa")
  const { confirmEnrollment } = useAuth()
  const [finish, setFinish] = useState<(() => void) | null>(null)
  return (
    <>
      <p className="mt-3 mb-6 text-base text-muted-foreground">
        {t("enrollSubtitle")}
      </p>
      <MfaEnroll
        start={() =>
          api.post<{ qrSvg: string; secret: string }>(
            "/auth/mfa/enroll/start",
            { challengeId }
          )
        }
        confirm={async (code) => {
          const done = await confirmEnrollment(challengeId, code)
          // The session waits until the codes are saved: starting it now would leave this page.
          setFinish(() => done.finish)
          return done.recoveryCodes
        }}
        onDone={() => finish?.()}
      />
    </>
  )
}

function VerifyStep({
  challengeId,
  onRestart,
}: {
  challengeId: string
  onRestart: (message?: string) => void
}) {
  const t = useTranslations("auth.mfa")
  const { verifyMfa } = useAuth()
  const [recovery, setRecovery] = useState(false)
  const [value, setValue] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function submit(answer = value) {
    if (loading || !answer) return
    setLoading(true)
    setError(null)
    try {
      await verifyMfa(
        challengeId,
        recovery ? { recoveryCode: answer } : { code: answer }
      )
    } catch (err) {
      // Spent, expired or out of attempts: only a new sign-in helps.
      if (getErrorCode(err) === "CHALLENGE_ENDED")
        return onRestart(getErrorMessage(err))
      setError(
        recovery && getErrorCode(err) === "MFA_INVALID"
          ? t("recoveryInvalid")
          : getErrorMessage(err)
      )
      setValue("")
    } finally {
      setLoading(false)
    }
  }

  return (
    <form
      className="mt-8"
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      <p className="-mt-5 mb-6 text-base text-muted-foreground">
        {t(recovery ? "recoverySubtitle" : "verifySubtitle")}
      </p>
      <FieldGroup>
        <Field data-invalid={error ? true : undefined}>
          <FieldLabel htmlFor="mfa-code">
            {t(recovery ? "recoveryLabel" : "codeLabel")}
          </FieldLabel>
          {recovery ? (
            <Input
              id="mfa-code"
              value={value}
              onChange={(e) => {
                setValue(e.target.value)
                setError(null)
              }}
              placeholder={t("recoveryPlaceholder")}
              autoComplete="off"
              autoFocus
              className="font-mono"
              aria-invalid={error ? true : undefined}
            />
          ) : (
            <CodeInput
              id="mfa-code"
              value={value}
              onChange={(v) => {
                setValue(v)
                setError(null)
              }}
              onComplete={(v) => void submit(v)}
              invalid={!!error}
              disabled={loading}
            />
          )}
          {error && <FieldError>{error}</FieldError>}
        </Field>

        <Button
          type="submit"
          size="lg"
          className="w-full rounded-full"
          disabled={loading || (!recovery && value.length !== 6)}
        >
          {loading && <Spinner data-icon="inline-start" />}
          {loading ? t("verifying") : t("verify")}
        </Button>

        <Button
          type="button"
          variant="link"
          className="text-muted-foreground"
          onClick={() => {
            setRecovery(!recovery)
            setValue("")
            setError(null)
          }}
        >
          {t(recovery ? "useApp" : "useRecovery")}
        </Button>
      </FieldGroup>
    </form>
  )
}
