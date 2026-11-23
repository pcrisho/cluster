// sRGB <-> OKLCH with Björn Ottosson's OKLab matrices (https://bottosson.github.io/posts/oklab/).

export interface Oklch {
  l: number
  c: number
  // Degrees in [0, 360).
  h: number
}

const toLinear = (v: number) =>
  v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
const toGamma = (v: number) =>
  v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055

export function hexToOklch(hex: string): Oklch {
  const n = parseInt(hex.slice(1), 16)
  const [r, g, b] = [n >> 16, n >> 8, n].map((v) => toLinear((v & 255) / 255))
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  return {
    l: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    c: Math.hypot(A, B),
    h: ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360,
  }
}

// Out-of-gamut colours are clipped per channel (no hue-preserving gamut mapping).
export function oklchToHex({ l: L, c, h }: Oklch): string {
  const A = c * Math.cos((h * Math.PI) / 180)
  const B = c * Math.sin((h * Math.PI) / 180)
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3
  const rgb = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
  return (
    "#" +
    rgb
      .map((v) => Math.round(toGamma(Math.min(1, Math.max(0, v))) * 255))
      .map((v) => v.toString(16).padStart(2, "0"))
      .join("")
  )
}
