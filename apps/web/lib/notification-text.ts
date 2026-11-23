import type { Notification } from "./notifications-api"

type Params = Record<string, string | number>

/** The catalog's notifications.types, as a function; `has` tells a known type from an unknown one. */
export type NotificationCatalog = {
  has: (key: string) => boolean
  t: (key: string, params: Params) => string
}

/** "grow:course:assigned" → "grow_course_assigned" (catalog keys cannot hold the type's separators). */
export const notificationKey = (type: string) =>
  type.replace(/[^a-zA-Z0-9]/g, "_")

function paramsOf(payload: unknown): Params | null {
  const params = (payload as { params?: unknown } | null)?.params
  return params && typeof params === "object" ? (params as Params) : null
}

/**
 * Title and body in the reader's language when the type is known and carries its values;
 * otherwise the English text the API stored. Bodies are people's content, except a
 * celebration reaction's, which the catalog writes.
 */
export function notificationText(
  n: Pick<Notification, "type" | "title" | "body" | "payload">,
  catalog: NotificationCatalog
): { title: string; body: string | null } {
  const key = notificationKey(n.type)
  const params = paramsOf(n.payload)
  if (!params || !catalog.has(key)) return { title: n.title, body: n.body }
  const bodyKey = `${key}_body`
  return {
    title: catalog.t(key, params),
    body: catalog.has(bodyKey) ? catalog.t(bodyKey, params) : n.body,
  }
}
