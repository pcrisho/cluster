/** Hocuspocus WebSocket endpoint. Next inlines NEXT_PUBLIC_* at build time, so keep the literal access. */
export function getCollabUrl(): string {
  return process.env.NEXT_PUBLIC_COLLAB_URL ?? "ws://localhost:3002"
}

/** Document name the collab service expects: `<kind>:<id>`, e.g. "know.page:<uuid>". */
export function documentName(kind: string, id: string): string {
  return `${kind}:${id}`
}
