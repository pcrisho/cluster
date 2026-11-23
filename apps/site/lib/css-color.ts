/**
 * Helper to read CSS custom properties from document.documentElement at runtime
 * and normalize token values for Three.js.
 */

const HEX_6 = /^#([0-9a-fA-F]{6})$/
const HEX_3 = /^#([0-9a-fA-F]{3})$/
const HEX_8 = /^#([0-9a-fA-F]{6})[0-9a-fA-F]{2}$/
const HEX_4 = /^#([0-9a-fA-F]{3})[0-9a-fA-F]$/
const RGB_OR_RGBA = /^rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i

/**
 * Checks whether a CSS color string is in hex or rgb/rgba format.
 */
export function isHexOrRgb(value: string | null | undefined): boolean {
  if (!value) return false
  const trimmed = value.trim()
  return (
    HEX_6.test(trimmed) ||
    HEX_3.test(trimmed) ||
    HEX_8.test(trimmed) ||
    HEX_4.test(trimmed) ||
    RGB_OR_RGBA.test(trimmed)
  )
}

/**
 * Pure helper that turns a CSS color / token value into a string that THREE.Color accepts.
 * Tokens in Cluster are hex (or rgba in dark variants like --border: #ffffff1a).
 * If the value is not valid hex or rgb, falls back to the provided fallback token/color.
 */
export function toThreeColor(
  value: string | null | undefined,
  fallback = "#ffffff"
): string {
  const sanitize = (val: string | null | undefined): string | null => {
    if (!val) return null
    const trimmed = val.trim()

    // 6-digit hex: #4c33e1
    if (HEX_6.test(trimmed)) return trimmed

    // 3-digit hex: #fff
    if (HEX_3.test(trimmed)) return trimmed

    // 8-digit hex (#rrggbbaa): strip 2-character alpha so THREE.Color does not reject it
    const hex8 = trimmed.match(HEX_8)
    if (hex8) return `#${hex8[1]}`

    // 4-digit hex (#rgba): strip 1-character alpha
    const hex4 = trimmed.match(HEX_4)
    if (hex4) return `#${hex4[1]}`

    // rgb or rgba: normalize to rgb(r, g, b) so THREE.Color does not warn on alpha
    const rgb = trimmed.match(RGB_OR_RGBA)
    if (rgb) return `rgb(${rgb[1]}, ${rgb[2]}, ${rgb[3]})`

    return null
  }

  const primary = sanitize(value)
  if (primary) return primary

  const secondary = sanitize(fallback)
  if (secondary) return secondary

  return "#ffffff"
}

/**
 * Reads a CSS custom property (e.g. "--primary" or "primary") from document.documentElement.
 * Returns an empty string in non-browser environments.
 */
export function readToken(name: string): string {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return ""
  }
  const prop = name.startsWith("--") ? name : `--${name}`
  return getComputedStyle(document.documentElement)
    .getPropertyValue(prop)
    .trim()
}

let cachedWebGL: boolean | null = null

/**
 * Checks whether WebGL is supported in the current browser.
 * Caches the result and immediately releases the test context
 * to prevent exhausting browser WebGL context limits.
 */
export function checkWebGL(): boolean {
  if (typeof window === "undefined") return false
  if (cachedWebGL !== null) return cachedWebGL
  try {
    const canvas = document.createElement("canvas")
    const gl = (canvas.getContext("webgl") ||
      canvas.getContext("experimental-webgl")) as WebGLRenderingContext | null
    cachedWebGL = Boolean(window.WebGLRenderingContext && gl)
    const ext = gl?.getExtension("WEBGL_lose_context")
    if (ext) ext.loseContext()
  } catch {
    cachedWebGL = false
  }
  return cachedWebGL
}
