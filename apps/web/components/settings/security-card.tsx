"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"

import { CodeInput } from "@/components/auth/code-input"
import { MfaEnroll } from "@/components/auth/mfa-enroll"
import { RecoveryCodes } from "@/components/auth/recovery-codes"
import { PasswordInput } from "@/components/shared/password-input"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { StatusBadge } from "@/components/ui/status-badge"
import { getErrorMessage } from "@/lib/api"
import { useAuth } from "@/lib/auth-context"
import { securityApi } from "@/lib/security-api"

type Open = "enroll" | "change" | "codes" | "off" | null
type Started = { qrSvg: string; secret: string }

/** Two-step verification of the signed-in person: turn it on or off, move it to a new device, new recovery codes. */
export function SecurityCard() {
  const t = useTranslations("settings.security")
  const { user, refreshUser } = useAuth()
  const [open, setOpen] = useState<Open>(null)
  if (!user) return null

  const close = () => setOpen(null)
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
        <CardAction>
          <StatusBadge tone={user.mfaEnabled ? "success" : "neutral"}>
            {t(user.mfaEnabled ? "on" : "off")}
          </StatusBadge>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {user.mfaEnabled && user.mfaRequired && (
          <p className="text-sm text-muted-foreground">{t("required")}</p>
        )}
        {user.recoveryCodesLeft !== null && (
          <p
            className={
              user.recoveryCodesLeft <= 3
                ? "text-sm text-warning-text"
                : "text-sm text-muted-foreground"
            }
          >
            {t("codesLeft", { count: user.recoveryCodesLeft })}
            {user.recoveryCodesLeft <= 3 && ` ${t("codesLow")}`}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {user.mfaEnabled ? (
            <>
              <Button variant="outline" onClick={() => setOpen("change")}>
                {t("changeDevice")}
              </Button>
              <Button variant="outline" onClick={() => setOpen("codes")}>
                {t("newCodes")}
              </Button>
              {!user.mfaRequired && (
                <Button variant="outline" onClick={() => setOpen("off")}>
                  {t("turnOff")}
                </Button>
              )}
            </>
          ) : (
            <Button onClick={() => setOpen("enroll")}>{t("turnOn")}</Button>
          )}
        </div>
      </CardContent>

      <Dialog
        open={open === "enroll" || open === "change"}
        onOpenChange={(o) => !o && close()}
      >
        <DialogContent className="sm:max-w-md">
          {(open === "enroll" || open === "change") && (
            <NewDevice
              change={open === "change"}
              onDone={() => {
                close()
                toast.success(t(open === "change" ? "changed" : "turnedOn"))
                void refreshUser()
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={open === "codes"} onOpenChange={(o) => !o && close()}>
        <DialogContent className="sm:max-w-md">
          {open === "codes" && (
            <NewCodes
              onDone={() => {
                close()
                void refreshUser()
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={open === "off"} onOpenChange={(o) => !o && close()}>
        <DialogContent className="sm:max-w-md">
          {open === "off" && (
            <Proof
              title={t("offTitle")}
              body={t("offBody")}
              withCode
              submitLabel={t("turnOff")}
              destructive
              onSubmit={async (password, code) => {
                await securityApi.disable(password, code)
                close()
                toast.success(t("turnedOff"))
                void refreshUser()
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </Card>
  )
}

function NewCodes({ onDone }: { onDone: () => void }) {
  const t = useTranslations("settings.security")
  const tm = useTranslations("auth.mfa")
  const [code, setCode] = useState("")
  const [codes, setCodes] = useState<string[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function submit(value = code) {
    if (value.length !== 6 || loading) return
    setLoading(true)
    setError(null)
    try {
      setCodes((await securityApi.newRecoveryCodes(value)).recoveryCodes)
    } catch (err) {
      setError(getErrorMessage(err))
      setCode("")
    } finally {
      setLoading(false)
    }
  }

  if (codes)
    return (
      <>
        <DialogHeader>
          <DialogTitle>{tm("codesTitle")}</DialogTitle>
          <DialogDescription>{tm("codesBody")}</DialogDescription>
        </DialogHeader>
        <RecoveryCodes codes={codes} />
        <DialogFooter>
          <Button onClick={onDone}>{t("done")}</Button>
        </DialogFooter>
      </>
    )

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      <DialogHeader>
        <DialogTitle>{t("newCodes")}</DialogTitle>
        <DialogDescription>{t("newCodesBody")}</DialogDescription>
      </DialogHeader>
      <Field data-invalid={error ? true : undefined}>
        <FieldLabel htmlFor="new-codes-code">{tm("codeLabel")}</FieldLabel>
        <CodeInput
          id="new-codes-code"
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
      <DialogFooter>
        <Button type="submit" disabled={loading || code.length !== 6}>
          {loading && <Spinner data-icon="inline-start" />}
          {t("generate")}
        </Button>
      </DialogFooter>
    </form>
  )
}

/**
 * The first device, or a new one that replaces the current device once confirmed: the password first
 * (and, for a new device, a code of the app or a recovery code), then the QR.
 */
function NewDevice({
  change,
  onDone,
}: {
  change: boolean
  onDone: () => void
}) {
  const t = useTranslations("settings.security")
  const [started, setStarted] = useState<Started | null>(null)

  if (!started)
    return (
      <Proof
        title={t(change ? "changeDevice" : "enrollTitle")}
        body={t(change ? "changeBody" : "enrollBody")}
        withCode={change}
        submitLabel={t("continue")}
        onSubmit={async (password, code) =>
          setStarted(
            await securityApi.startEnrollment(
              password,
              change ? code : undefined
            )
          )
        }
      />
    )
  return (
    <>
      <DialogHeader>
        <DialogTitle>{t(change ? "changeDevice" : "enrollTitle")}</DialogTitle>
      </DialogHeader>
      <MfaEnroll
        start={() => Promise.resolve(started)}
        confirm={async (code) =>
          (await securityApi.confirmEnrollment(code)).recoveryCodes
        }
        onDone={onDone}
      />
    </>
  )
}

/** The password, and a code of the app or a recovery code when `withCode`, before a change to 2FA. */
function Proof({
  title,
  body,
  withCode = false,
  submitLabel,
  destructive = false,
  onSubmit,
}: {
  title: string
  body: string
  withCode?: boolean
  submitLabel: string
  destructive?: boolean
  onSubmit: (password: string, code: string) => Promise<void>
}) {
  const t = useTranslations("settings.security")
  const tm = useTranslations("auth.mfa")
  const [password, setPassword] = useState("")
  const [code, setCode] = useState("")
  const [recovery, setRecovery] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const codeReady = recovery ? !!code.trim() : code.length === 6

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (loading || !password || (withCode && !codeReady)) return
    setLoading(true)
    setError(null)
    try {
      await onSubmit(password, code.trim())
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={submit}>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{body}</DialogDescription>
      </DialogHeader>
      <FieldGroup>
        <Field data-invalid={error && !withCode ? true : undefined}>
          <FieldLabel htmlFor="mfa-proof-password">{t("password")}</FieldLabel>
          <PasswordInput
            id="mfa-proof-password"
            value={password}
            onChange={setPassword}
            autoComplete="current-password"
            required
          />
          {error && !withCode && <FieldError>{error}</FieldError>}
        </Field>
        {withCode && (
          <Field data-invalid={error ? true : undefined}>
            <FieldLabel htmlFor="mfa-proof-code">
              {tm(recovery ? "recoveryLabel" : "codeLabel")}
            </FieldLabel>
            {recovery ? (
              <Input
                id="mfa-proof-code"
                value={code}
                onChange={(e) => {
                  setCode(e.target.value)
                  setError(null)
                }}
                placeholder={tm("recoveryPlaceholder")}
                autoComplete="off"
                autoFocus
                className="font-mono"
                aria-invalid={error ? true : undefined}
              />
            ) : (
              <CodeInput
                id="mfa-proof-code"
                value={code}
                onChange={(v) => {
                  setCode(v)
                  setError(null)
                }}
                invalid={!!error}
                disabled={loading}
                autoFocus={false}
              />
            )}
            {error && <FieldError>{error}</FieldError>}
            <Button
              type="button"
              variant="link"
              className="w-fit! px-0 text-muted-foreground"
              onClick={() => {
                setRecovery(!recovery)
                setCode("")
                setError(null)
              }}
            >
              {tm(recovery ? "useApp" : "useRecovery")}
            </Button>
          </Field>
        )}
      </FieldGroup>
      <DialogFooter>
        <Button
          type="submit"
          variant={destructive ? "destructive" : "default"}
          disabled={loading || !password || (withCode && !codeReady)}
        >
          {loading && <Spinner data-icon="inline-start" />}
          {submitLabel}
        </Button>
      </DialogFooter>
    </form>
  )
}
