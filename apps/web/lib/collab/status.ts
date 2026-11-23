import type { CollabStatus } from "./collab-session"

/**
 * Label (key in `collab.status`) and tone of the connection indicator. "connecting" is shown
 * quietly as the initial state.
 */
export function describeStatus(status: CollabStatus): {
  label:
    | "connected"
    | "readonly"
    | "deleted"
    | "denied"
    | "connecting"
    | "offline"
  tone: "ok" | "muted" | "warn"
} {
  switch (status) {
    case "connected":
      return { label: "connected", tone: "ok" }
    case "readonly":
      return { label: "readonly", tone: "muted" }
    case "deleted":
      return { label: "deleted", tone: "warn" }
    case "denied":
      return { label: "denied", tone: "warn" }
    case "connecting":
      return { label: "connecting", tone: "muted" }
    default:
      return { label: "offline", tone: "warn" }
  }
}
