import type en from "./messages/en.json"
import type { formats } from "./i18n/formats"
import type { Locale } from "./lib/i18n/locales"

declare module "next-intl" {
  interface AppConfig {
    Locale: Locale
    Messages: typeof en
    Formats: typeof formats
  }
}
