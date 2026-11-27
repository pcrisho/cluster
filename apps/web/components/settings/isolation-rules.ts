import type { ModuleKey } from "@/lib/api"

/**
 * Why the organization cannot turn main-node isolation on, or null when it can. Turning it off
 * is always allowed (docs/specs/org/node-partitions, "The two switches").
 */
export function isolationBlock(
  isolation: { allowed: boolean },
  enabledModules: readonly ModuleKey[]
): "instance" | "modules" | null {
  if (!isolation.allowed) return "instance"
  if (enabledModules.includes("LIFE")) return "modules"
  return null
}
