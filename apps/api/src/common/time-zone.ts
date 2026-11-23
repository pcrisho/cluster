import { registerDecorator, type ValidationOptions } from "class-validator"

let zones: Set<string> | undefined

/**
 * A canonical IANA zone with a region ("America/Lima") or "UTC". Offsets ("+05:00"),
 * abbreviations ("EST") and other spellings are rejected, so the stored zone always
 * follows its region's daylight saving rules.
 */
export function isIanaTimeZone(value: unknown): value is string {
  if (typeof value !== "string") return false
  if (value === "UTC") return true
  zones ??= new Set(Intl.supportedValuesOf("timeZone"))
  return zones.has(value)
}

export function IsIanaTimeZone(options?: ValidationOptions) {
  return (object: object, propertyName: string) =>
    registerDecorator({
      name: "isIanaTimeZone",
      target: object.constructor,
      propertyName,
      options: {
        message: `${propertyName} must be an IANA time zone such as "America/Lima"`,
        ...options,
      },
      validator: { validate: isIanaTimeZone },
    })
}
