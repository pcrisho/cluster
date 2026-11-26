"use client"

import { REGEXP_ONLY_DIGITS } from "input-otp"

import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from "@/components/ui/input-otp"

/** The six digits of an authenticator app, as 3 + 3 boxes; `onComplete` fires on the sixth. */
export function CodeInput({
  id,
  value,
  onChange,
  onComplete,
  invalid,
  disabled,
  autoFocus = true,
}: {
  id: string
  value: string
  onChange: (value: string) => void
  onComplete?: (value: string) => void
  invalid?: boolean
  disabled?: boolean
  autoFocus?: boolean
}) {
  const slot = (index: number) => (
    <InputOTPSlot
      key={index}
      index={index}
      aria-invalid={invalid || undefined}
      className="size-11 text-lg"
    />
  )
  return (
    <InputOTP
      id={id}
      maxLength={6}
      pattern={REGEXP_ONLY_DIGITS}
      inputMode="numeric"
      autoComplete="one-time-code"
      // The default widens the hidden input past the boxes, which scrolls a dialog sideways.
      pushPasswordManagerStrategy="none"
      autoFocus={autoFocus}
      value={value}
      onChange={onChange}
      onComplete={onComplete}
      disabled={disabled}
      aria-invalid={invalid || undefined}
    >
      <InputOTPGroup>{[0, 1, 2].map(slot)}</InputOTPGroup>
      <InputOTPSeparator />
      <InputOTPGroup>{[3, 4, 5].map(slot)}</InputOTPGroup>
    </InputOTP>
  )
}
