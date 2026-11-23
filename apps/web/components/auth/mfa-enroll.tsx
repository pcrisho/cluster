"use client"

import { useEffect, useState } from "react"
import { CopyIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import { getErrorMessage } from "@/lib/api"
import { RecoveryCodes } from "./recovery-codes"
import { CodeInput } from "./code-input"

type Started = { qrSvg: string; secret: string }

/**
 * Turning on two-step verification: scan the QR (or type the key), confirm a code, save the recovery
 * codes. The caller says how to start and confirm: from a sign-in challenge or for the signed-in person.
 */
export function MfaEnroll({
  start,
  confirm,
  onDone,
}: {
  start: () => Promise<Started>
  /** Returns the recovery codes. */
  confirm: (code: string) => Promise<string[]>
  onDone: () => void
}) {
  const t = useTranslations("auth.mfa")
  const [started, setStarted] = useState<Started | null>(null)
  const [code, setCode] = useState("")
  const [codes, setCodes] = useState<string[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    start()
      .then(setStarted)
      .catch((err) => setError(getErrorMessage(err)))
    // Once: every start makes a new secret, which would invalidate the QR on screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function submit(value = code) {
    if (value.length !== 6 || loading) return
    setLoading(true)
    setError(null)
    try {
      setCodes(await confirm(value))
    } catch (err) {
      setError(getErrorMessage(err))
      setCode("")
    } finally {
      setLoading(false)
    }
  }

  if (codes)
    return (
      <div className="flex flex-col gap-4">
        <div>
          <h2 className="font-medium text-foreground">{t("codesTitle")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("codesBody")}</p>
        </div>
        <RecoveryCodes codes={codes} />
        <Button type="button" className="w-full rounded-full" onClick={onDone}>
          {t("codesSaved")}
        </Button>
      </div>
    )

  if (!started)
    return error ? (
      <p role="alert" className="text-sm text-destructive">
        {error}
      </p>
    ) : (
      <div className="flex justify-center py-10">
        <Spinner />
      </div>
    )

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      <p className="text-sm text-muted-foreground">{t("scan")}</p>
      {/* White behind the code in both themes: scanners need the contrast. */}
      {/* eslint-disable-next-line @next/next/no-img-element -- an inline SVG made by the API, not an asset */}
      <img
        src={`data:image/svg+xml;utf8,${encodeURIComponent(started.qrSvg)}`}
        alt={t("qrAlt")}
        className="mx-auto size-44 rounded-lg bg-white p-2"
      />
      <div className="flex flex-col gap-1.5">
        <p className="text-sm text-muted-foreground">{t("manual")}</p>
        <div className="flex items-center gap-2">
          <code className="flex-1 rounded-md bg-muted px-2 py-1.5 font-mono text-sm">
            {started.secret.match(/.{1,4}/g)?.join(" ")}
          </code>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t("copyKey")}
            onClick={() =>
              void navigator.clipboard
                .writeText(started.secret)
                .then(() => toast.success(t("copied")))
            }
          >
            <CopyIcon />
          </Button>
        </div>
      </div>
      <Field data-invalid={error ? true : undefined}>
        <FieldLabel htmlFor="mfa-enroll-code">{t("appCodeLabel")}</FieldLabel>
        <CodeInput
          id="mfa-enroll-code"
          value={code}
          onChange={(v) => {
            setCode(v)
            setError(null)
          }}
          onComplete={(v) => void submit(v)}
          invalid={!!error}
          disabled={loading}
        />
        {error && <FieldError>{error}</FieldError>}
      </Field>
      <Button
        type="submit"
        className="w-full rounded-full"
        disabled={loading || code.length !== 6}
      >
        {loading && <Spinner data-icon="inline-start" />}
        {loading ? t("turningOn") : t("turnOn")}
      </Button>
    </form>
  )
}
