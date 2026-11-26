/** The browser's IANA zone when the API would accept it (see apps/api/src/common/time-zone.ts), else UTC. */
export function browserTimeZone(): string {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
    return Intl.supportedValuesOf("timeZone").includes(zone) ? zone : "UTC"
  } catch {
    return "UTC"
  }
}

/** "UTC−05:00" now (it moves with daylight saving). */
export function utcOffset(zone: string, now: Date = new Date()): string {
  const name = new Intl.DateTimeFormat("en", {
    timeZone: zone,
    timeZoneName: "longOffset",
  })
    .formatToParts(now)
    .find((p) => p.type === "timeZoneName")?.value
  // "GMT-05:00", or "GMT" at zero.
  const offset = name && name !== "GMT" ? name.slice(3) : "+00:00"
  return `UTC${offset.replace("-", "−")}`
}

/** "(UTC−05:00) Lima" for America/Lima, "(UTC−03:00) Argentina / Buenos Aires" for America/Argentina/Buenos_Aires. */
export function timeZoneLabel(zone: string, now: Date = new Date()): string {
  const place =
    zone === "UTC"
      ? "UTC"
      : zone.split("/").slice(1).join(" / ").replace(/_/g, " ")
  return `(${utcOffset(zone, now)}) ${place}`
}

/** Every zone the API accepts, grouped by region (America, Europe, …), in the order of the IANA list. */
export function timeZoneGroups(): { value: string; items: string[] }[] {
  const groups = new Map<string, string[]>([["UTC", ["UTC"]]])
  for (const zone of Intl.supportedValuesOf("timeZone")) {
    const region = zone.split("/")[0]!
    if (!zone.includes("/") || region === "Etc") continue
    groups.set(region, [...(groups.get(region) ?? []), zone])
  }
  return [...groups].map(([value, items]) => ({ value, items }))
}
