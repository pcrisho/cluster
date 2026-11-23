import type { Messages } from "./messages"

type Leaves<T, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends string
    ? `${P}${K}`
    : Leaves<T[K], `${P}${K}.`>
}[keyof T & string]

/** Any key of the catalogs, such as "errors.codes.FILE_EMPTY". */
export type MessageKey = Leaves<Messages>

type Params = Record<string, string | number>

let current: ((key: string, params?: Params) => string) | null = null

/** Set by <I18nBridge /> inside the intl provider. */
export function setPlainTranslator(
  t: (key: string, params?: Params) => string
) {
  current = t
}

/**
 * The catalog text of `key` for code that runs outside React (editor extensions, upload checks).
 * Before the provider mounts (and in unit tests) it returns the key itself.
 */
export function tPlain(key: MessageKey, params?: Params): string {
  return current ? current(key, params) : key
}
