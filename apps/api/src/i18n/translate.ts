import { DEFAULT_LOCALE, type Locale } from "../common/locale";
import { en, type Messages } from "./en";
import { es } from "./es";

const CATALOGS: Record<Locale, Messages> = { en, es };

type Leaves<T, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends string
    ? `${P}${K}`
    : Leaves<T[K], `${P}${K}.`>;
}[keyof T & string];

/** A key of the API catalogs, such as "email.invite.subject". */
export type MessageKey = Leaves<Messages>;

type Params = Record<string, string | number>;

function lookup(catalog: Messages, key: string): string | undefined {
  const value = key
    .split(".")
    .reduce<unknown>(
      (node, part) => (node as Record<string, unknown> | undefined)?.[part],
      catalog,
    );
  return typeof value === "string" ? value : undefined;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * A text in `locale` (English when the key is missing there) with its `{placeholders}` filled.
 * `html: true` escapes the values, for templates that are HTML.
 */
export function translate(
  locale: Locale,
  key: MessageKey,
  params: Params = {},
  options: { html?: boolean } = {},
): string {
  const template =
    lookup(CATALOGS[locale], key) ??
    lookup(CATALOGS[DEFAULT_LOCALE], key) ??
    key;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    if (!(name in params)) return match;
    const value = String(params[name]);
    return options.html ? escapeHtml(value) : value;
  });
}
