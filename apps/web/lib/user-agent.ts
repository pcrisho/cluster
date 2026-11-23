// Order matters: Edge says Chrome, Chrome says Safari, iOS says "like Mac OS X", Android says Linux.
const BROWSERS: [RegExp, string][] = [
  [/Edg\//, "Edge"],
  [/Firefox\//, "Firefox"],
  [/Chrome\//, "Chrome"],
  [/Safari\//, "Safari"],
]
const SYSTEMS: [RegExp, string][] = [
  [/iPhone|iPad/, "iOS"],
  [/Android/, "Android"],
  [/Windows/, "Windows"],
  [/Mac OS X/, "macOS"],
  [/Linux/, "Linux"],
]

/**
 * Browser and system of a session, enough for a person to recognize their device.
 * shortcut: a few common names only; use a UA parser if people report unrecognized devices.
 */
export function describeUserAgent(
  ua: string | null
): { browser: string; os: string } | null {
  if (!ua) return null
  const browser = BROWSERS.find(([re]) => re.test(ua))?.[1]
  const os = SYSTEMS.find(([re]) => re.test(ua))?.[1]
  return browser && os ? { browser, os } : null
}
