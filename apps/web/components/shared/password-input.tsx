"use client"

import { useState } from "react"
import { EyeIcon, EyeOffIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  InputGroup,
  InputGroupInput,
  InputGroupAddon,
} from "@/components/ui/input-group"
import { useTranslations } from "next-intl"

/** Score and the key of its label in `shared.password`. */
function passwordStrength(pw: string): {
  score: 0 | 1 | 2 | 3 | 4
  label: "empty" | "weak" | "fair" | "strong" | "veryStrong"
} {
  if (!pw) return { score: 0, label: "empty" }
  // Length is what makes a password strong (NIST SP 800-63B-4); a mix of characters adds a step.
  const length = [...pw].length
  if (length < 12) return { score: 1, label: "weak" }
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) =>
    r.test(pw)
  ).length
  const score = Math.min(
    4,
    (length >= 20 ? 4 : length >= 16 ? 3 : 2) + (classes >= 3 ? 1 : 0)
  )
  return {
    score: score as 2 | 3 | 4,
    label: score === 2 ? "fair" : score === 3 ? "strong" : "veryStrong",
  }
}

const SEGMENT_COLORS: Record<number, string> = {
  0: "bg-border",
  1: "bg-destructive",
  2: "bg-amber-500",
  3: "bg-emerald-500",
  4: "bg-emerald-600",
}

const LABEL_COLORS: Record<
  ReturnType<typeof passwordStrength>["label"],
  string
> = {
  empty: "text-muted-foreground",
  weak: "text-destructive",
  fair: "text-amber-500",
  strong: "text-emerald-500",
  veryStrong: "text-emerald-600",
}

interface PasswordInputProps {
  value: string
  onChange: (v: string) => void
  error?: string
  showStrength?: boolean
  id?: string
  placeholder?: string
  required?: boolean
  autoComplete?: string
  minLength?: number
}

export function PasswordInput({
  value,
  onChange,
  error,
  showStrength = false,
  id,
  placeholder,
  required,
  autoComplete,
  minLength,
}: PasswordInputProps) {
  const t = useTranslations("shared.password")
  const [visible, setVisible] = useState(false)
  const { score, label } = passwordStrength(value)

  return (
    <div className="flex flex-col gap-2">
      <InputGroup>
        <InputGroupInput
          id={id}
          type={visible ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          required={required}
          autoComplete={autoComplete}
          minLength={minLength}
          aria-invalid={error ? true : undefined}
        />
        <InputGroupAddon align="inline-end">
          <Button
            variant="ghost"
            size="icon"
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? t("hide") : t("show")}
            tabIndex={-1}
          >
            {visible ? <EyeOffIcon /> : <EyeIcon />}
          </Button>
        </InputGroupAddon>
      </InputGroup>

      {showStrength && (
        <div className="space-y-1.5">
          <div className="flex gap-1">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className={cn(
                  "h-1 flex-1 rounded-full transition-colors",
                  score >= i ? SEGMENT_COLORS[score] : "bg-border"
                )}
              />
            ))}
          </div>
          <p className={cn("text-xs", LABEL_COLORS[label])}>{t(label)}</p>
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
