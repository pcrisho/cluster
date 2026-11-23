type Tree = { [key: string]: string | Tree }

/** `override` over `base`, key by key: a text missing from a translation falls back to English. */
export function mergeMessages<T extends Tree>(base: T, override: Tree): T {
  const out: Tree = { ...base }
  for (const [key, value] of Object.entries(override)) {
    const current = out[key]
    out[key] =
      typeof value === "object" && typeof current === "object"
        ? mergeMessages(current, value)
        : value
  }
  return out as T
}
