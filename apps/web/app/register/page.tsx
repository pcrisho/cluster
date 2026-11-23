"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { motion, AnimatePresence } from "motion/react"
import { ArrowRightIcon, ArrowLeftIcon, CheckIcon } from "lucide-react"

import { useAuth } from "@/lib/auth-context"
import { adminApi } from "@/lib/admin-api"
import { homePath } from "@/lib/modules"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import {
  Field,
  FieldLabel,
  FieldGroup,
  FieldError,
} from "@/components/ui/field"
import { PasswordInput } from "@/components/shared/password-input"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

import { AuthLayout } from "@/components/auth/auth-layout"
import { browserTimeZone } from "@/lib/time-zone"
import { getErrorMessage } from "@/lib/api"
import { useTranslations } from "next-intl"

interface FormData {
  firstName: string
  lastName: string
  organizationName: string
  email: string
  password: string
  confirmPassword: string
}

type FormErrors = Partial<Record<keyof FormData, string>>

/** Keys in `auth.register.steps`. */
const STEPS = ["about", "account"] as const

function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

/** The key in `auth.validation` of what is wrong with a password, or null. */
function validatePassword(pw: string): "required" | "passwordRule" | null {
  if (!pw) return "required"
  // Mirrors the API's length rule (password-policy.ts); the API also refuses common passwords.
  if ([...pw].length < 12) return "passwordRule"
  return null
}

const slideVariants = {
  enter: (dir: number) => ({ x: dir > 0 ? 28 : -28, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir > 0 ? -28 : 28, opacity: 0 }),
}

export default function RegisterPage() {
  const tv = useTranslations("auth.validation")
  const t = useTranslations("auth.register")
  const [form, setForm] = useState<FormData>({
    firstName: "",
    lastName: "",
    organizationName: "",
    email: "",
    password: "",
    confirmPassword: "",
  })
  const [step, setStep] = useState(0)
  const [direction, setDirection] = useState(1)
  const [errors, setErrors] = useState<FormErrors>({})
  const [generalError, setGeneralError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const { register, isAuthenticated, isLoading, user } = useAuth()
  const router = useRouter()
  // null while loading; private instances disable public sign-up.
  const [registrationOpen, setRegistrationOpen] = useState<boolean | null>(null)

  useEffect(() => {
    adminApi
      .getPublicInstance()
      .then((i) => setRegistrationOpen(i.registrationOpen))
      .catch(() => setRegistrationOpen(true))
  }, [])

  useEffect(() => {
    if (!isLoading && isAuthenticated && user) {
      router.push(homePath(user))
    }
  }, [isLoading, isAuthenticated, user, router])

  const update = useCallback((field: keyof FormData, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }))
    setErrors((prev) => {
      if (!prev[field]) return prev
      const next = { ...prev }
      delete next[field]
      return next
    })
    setGeneralError(null)
  }, [])

  function validateStep(): boolean {
    const next: FormErrors = {}
    if (step === 0) {
      if (!form.firstName.trim()) next.firstName = tv("required")
      if (!form.lastName.trim()) next.lastName = tv("required")
      if (!form.organizationName.trim()) next.organizationName = tv("required")
    } else {
      if (!form.email.trim()) next.email = tv("required")
      else if (!validateEmail(form.email)) next.email = tv("invalidEmail")
      const pwErr = validatePassword(form.password)
      if (pwErr) next.password = tv(pwErr)
      if (!form.confirmPassword) next.confirmPassword = tv("required")
      else if (form.confirmPassword !== form.password)
        next.confirmPassword = tv("passwordMismatch")
    }
    setErrors(next)
    return Object.keys(next).length === 0
  }

  function goNext() {
    if (!validateStep()) return
    setDirection(1)
    setStep(1)
  }

  function goBack() {
    setDirection(-1)
    setStep(0)
    setErrors({})
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validateStep()) return
    setGeneralError(null)
    setLoading(true)
    try {
      await register({
        email: form.email,
        password: form.password,
        firstName: form.firstName,
        lastName: form.lastName,
        organizationName: form.organizationName,
        timezone: browserTimeZone(),
      })
      toast.success(t("created"))
    } catch (err) {
      const message = err instanceof Error ? getErrorMessage(err) : t("failed")
      setGeneralError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }

  if (isLoading || registrationOpen === null) return null
  if (isAuthenticated) return null

  if (!registrationOpen) {
    return (
      <AuthLayout
        variant="centered"
        mock={null}
        form={
          <div className="mx-auto w-full max-w-sm text-center">
            <h1 className="text-3xl font-light text-foreground">
              {t.rich("closedTitle", {
                accent: (chunks) => (
                  <span className="font-medium text-primary">{chunks}</span>
                ),
              })}
            </h1>
            <p className="mt-3 text-muted-foreground">{t("closedBody")}</p>
            <Button asChild size="lg" className="mt-8 rounded-full">
              <Link href="/login">{t("goToSignIn")}</Link>
            </Button>
          </div>
        }
      />
    )
  }

  const stepKey = STEPS[step]!

  const formNode = (
    <div className="mx-auto w-full max-w-sm">
      <motion.h1
        className="text-[clamp(1.75rem,3.5vw,2.5rem)] text-display-tight font-light text-foreground"
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
        className="mt-2 text-base text-muted-foreground"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut", delay: 0.06 }}
      >
        {t(`steps.${stepKey}.subtitle`)}
      </motion.p>

      {/* Step indicator */}
      <div className="mt-8 mb-8">
        <div className="flex items-center justify-center gap-0">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center">
              <div className="flex flex-col items-center gap-1.5">
                <span
                  className={cn(
                    "flex size-7 items-center justify-center rounded-full text-xs font-semibold transition-colors",
                    i === step
                      ? "bg-primary text-primary-foreground"
                      : i < step
                        ? "bg-primary/30 text-primary"
                        : "bg-muted text-muted-foreground"
                  )}
                >
                  {i < step ? <CheckIcon className="size-3" /> : i + 1}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div
                  className={cn(
                    "mx-2 h-px w-12 transition-colors",
                    i < step ? "bg-primary" : "bg-border"
                  )}
                />
              )}
            </div>
          ))}
        </div>
        <div className="mt-3 flex justify-center gap-8">
          {STEPS.map((s, i) => (
            <div
              key={s}
              className="flex flex-col items-center gap-0.5 text-center"
            >
              <span
                className={cn(
                  "text-xs font-semibold transition-colors",
                  i <= step ? "text-foreground" : "text-muted-foreground"
                )}
              >
                {t(`steps.${s}.title`)}
              </span>
            </div>
          ))}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="overflow-hidden">
        <AnimatePresence mode="wait" custom={direction}>
          {step === 0 ? (
            <motion.div
              key="step-0"
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            >
              <FieldGroup>
                <Field data-invalid={!!errors.firstName}>
                  <FieldLabel htmlFor="firstName">{t("firstName")}</FieldLabel>
                  <Input
                    id="firstName"
                    value={form.firstName}
                    onChange={(e) => update("firstName", e.target.value)}
                    required
                    autoComplete="given-name"
                    aria-invalid={!!errors.firstName}
                  />
                  <FieldError>{errors.firstName}</FieldError>
                </Field>

                <Field data-invalid={!!errors.lastName}>
                  <FieldLabel htmlFor="lastName">{t("lastName")}</FieldLabel>
                  <Input
                    id="lastName"
                    value={form.lastName}
                    onChange={(e) => update("lastName", e.target.value)}
                    required
                    autoComplete="family-name"
                    aria-invalid={!!errors.lastName}
                  />
                  <FieldError>{errors.lastName}</FieldError>
                </Field>

                <Field data-invalid={!!errors.organizationName}>
                  <FieldLabel htmlFor="organizationName">
                    {t("organization")}
                  </FieldLabel>
                  <Input
                    id="organizationName"
                    value={form.organizationName}
                    onChange={(e) => update("organizationName", e.target.value)}
                    required
                    maxLength={100}
                    autoComplete="organization"
                    aria-invalid={!!errors.organizationName}
                  />
                  <FieldError>{errors.organizationName}</FieldError>
                </Field>

                <Button
                  type="button"
                  size="lg"
                  onClick={goNext}
                  className="w-full rounded-full"
                >
                  {t("continue")}
                  <ArrowRightIcon data-icon="inline-end" />
                </Button>
              </FieldGroup>
            </motion.div>
          ) : (
            <motion.div
              key="step-1"
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            >
              <FieldGroup>
                <Field data-invalid={!!errors.email}>
                  <FieldLabel htmlFor="email">{t("email")}</FieldLabel>
                  <Input
                    id="email"
                    type="email"
                    placeholder={t("emailPlaceholder")}
                    value={form.email}
                    onChange={(e) => update("email", e.target.value)}
                    required
                    autoComplete="email"
                    aria-invalid={!!errors.email}
                  />
                  <FieldError>{errors.email}</FieldError>
                </Field>

                <Field data-invalid={!!errors.password}>
                  <FieldLabel htmlFor="password">{t("password")}</FieldLabel>
                  <PasswordInput
                    id="password"
                    value={form.password}
                    onChange={(v) => update("password", v)}
                    showStrength
                    placeholder={t("passwordPlaceholder")}
                    required
                    autoComplete="new-password"
                    minLength={12}
                  />
                  <FieldError>{errors.password}</FieldError>
                </Field>

                <Field data-invalid={!!errors.confirmPassword}>
                  <FieldLabel htmlFor="confirmPassword">
                    {t("confirmPassword")}
                  </FieldLabel>
                  <PasswordInput
                    id="confirmPassword"
                    value={form.confirmPassword}
                    onChange={(v) => update("confirmPassword", v)}
                    placeholder={t("confirmPlaceholder")}
                    required
                    autoComplete="new-password"
                  />
                  <FieldError>{errors.confirmPassword}</FieldError>
                </Field>

                {generalError && (
                  <motion.p
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-sm text-destructive"
                  >
                    {generalError}
                  </motion.p>
                )}

                <div className="flex items-center gap-3">
                  <Button
                    type="button"
                    variant="ghost"
                    size="lg"
                    onClick={goBack}
                    className="rounded-full"
                  >
                    <ArrowLeftIcon data-icon="inline-start" />
                    {t("back")}
                  </Button>
                  <Button
                    type="submit"
                    size="lg"
                    className="flex-1 rounded-full"
                    disabled={loading}
                  >
                    {loading && <Spinner data-icon="inline-start" />}
                    {loading ? t("submitting") : t("submit")}
                  </Button>
                </div>

                <p className="text-center text-sm text-muted-foreground">
                  {t("haveAccount")}{" "}
                  <Link
                    href="/login"
                    className="font-medium text-primary underline-offset-4 hover:underline"
                  >
                    {t("signIn")}
                  </Link>
                </p>
              </FieldGroup>
            </motion.div>
          )}
        </AnimatePresence>
      </form>
    </div>
  )

  return <AuthLayout variant="centered" form={formNode} mock={null} />
}
