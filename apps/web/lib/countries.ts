export interface Country {
  code: string
  name: string
  dial: string
}

export const countries: Country[] = [
  { code: "PE", name: "Peru", dial: "+51" },
  { code: "MX", name: "Mexico", dial: "+52" },
  { code: "AR", name: "Argentina", dial: "+54" },
  { code: "CO", name: "Colombia", dial: "+57" },
  { code: "CL", name: "Chile", dial: "+56" },
  { code: "BR", name: "Brasil", dial: "+55" },
  { code: "US", name: "United States", dial: "+1" },
  { code: "CA", name: "Canada", dial: "+1" },
  { code: "ES", name: "Spain", dial: "+34" },
  { code: "GB", name: "United Kingdom", dial: "+44" },
  { code: "DE", name: "Germany", dial: "+49" },
  { code: "FR", name: "France", dial: "+33" },
  { code: "IT", name: "Italy", dial: "+39" },
  { code: "PT", name: "Portugal", dial: "+351" },
  { code: "NL", name: "Netherlands", dial: "+31" },
  { code: "JP", name: "Japan", dial: "+81" },
  { code: "KR", name: "South Korea", dial: "+82" },
  { code: "CN", name: "China", dial: "+86" },
  { code: "IN", name: "India", dial: "+91" },
  { code: "AU", name: "Australia", dial: "+61" },
]

export const countryByCode = Object.fromEntries(
  countries.map((c) => [c.code, c])
) as Record<string, Country>

export function getFlagEmoji(countryCode: string): string {
  const codePoints = countryCode
    .toUpperCase()
    .split("")
    .map((char) => 127397 + char.charCodeAt(0))
  return String.fromCodePoint(...codePoints)
}

export function getCountryLabel(c: Country): string {
  return `${getFlagEmoji(c.code)} ${c.name} (${c.dial})`
}

/** Compact display: flag + dial code only (used in combobox). */
export function getCountryCompact(c: Country): string {
  return `${getFlagEmoji(c.code)} ${c.dial}`
}

/**
 * Flat string labels used as combobox items — matches how TimezoneCombobox
 * uses plain strings for display + value simultaneously.
 */
export const countryLabels = countries.map((c) => getCountryCompact(c))

/** Map a compact label back to its country code. */
export const codeByLabel = Object.fromEntries(
  countries.map((c) => [getCountryCompact(c), c.code])
)

/** Map a country code to its dial prefix (used by PhoneInput). */
export const dialByCode = Object.fromEntries(
  countries.map((c) => [c.code, c.dial])
)

/** Country groups for Combobox; `value` is the key of the group name in `shared.countries`. */
export const countryGroups: { value: "americas" | "europe" | "asiaPacific"; items: string[] }[] = [
  {
    value: "americas",
    items: ["PE", "MX", "AR", "CO", "CL", "BR", "US", "CA"]
      .map((code) => getCountryCompact(countryByCode[code]!)),
  },
  {
    value: "europe",
    items: ["ES", "GB", "DE", "FR", "IT", "PT", "NL"]
      .map((code) => getCountryCompact(countryByCode[code]!)),
  },
  {
    value: "asiaPacific",
    items: ["JP", "KR", "CN", "IN", "AU"]
      .map((code) => getCountryCompact(countryByCode[code]!)),
  },
]

export function defaultCountryCode(): string {
  try {
    const locale = navigator.language
    if (locale) {
      const parts = locale.split("-")
      if (parts.length > 1) {
        const code = parts[1]!.toUpperCase()
        if (countryByCode[code]) return code
      }
    }

    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    const tzMap: Record<string, string> = {
      "America/Lima": "PE",
      "America/Mexico_City": "MX",
      "America/Argentina/Buenos_Aires": "AR",
      "America/Bogota": "CO",
      "America/Santiago": "CL",
      "America/Sao_Paulo": "BR",
      "America/New_York": "US",
      "America/Chicago": "US",
      "America/Denver": "US",
      "America/Los_Angeles": "US",
      "America/Toronto": "CA",
      "America/Vancouver": "CA",
      "Europe/London": "GB",
      "Europe/Madrid": "ES",
      "Europe/Paris": "FR",
      "Europe/Berlin": "DE",
      "Europe/Rome": "IT",
      "Europe/Lisbon": "PT",
      "Europe/Amsterdam": "NL",
      "Asia/Tokyo": "JP",
      "Asia/Seoul": "KR",
      "Asia/Shanghai": "CN",
      "Asia/Kolkata": "IN",
      "Asia/Dubai": "AE",
      "Asia/Singapore": "SG",
      "Australia/Sydney": "AU",
      "Pacific/Auckland": "NZ",
    }
    if (tz && tzMap[tz]) return tzMap[tz]
  } catch {
    // ignore
  }
  return "PE"
}

export function defaultCountryLabel(): string {
  return getCountryCompact(countryByCode[defaultCountryCode()] ?? countries[0]!)
}