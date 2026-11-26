import type { InstanceSettings, ModuleKey, PrismaClient } from "@prisma/client"

/**
 * Reads the single InstanceSettings row (id = 1), creating it with the
 * schema defaults the first time. Plain function so any module can use it
 * without importing the instance module.
 */
export async function loadInstanceSettings(
  prisma: Pick<PrismaClient, "instanceSettings">,
): Promise<InstanceSettings> {
  return (
    (await prisma.instanceSettings.findUnique({ where: { id: 1 } })) ??
    (await prisma.instanceSettings.upsert({ where: { id: 1 }, create: {}, update: {} }))
  )
}

/** A module is usable only when the instance offers it and the organization enabled it. */
export function effectiveModules(available: ModuleKey[], enabled: ModuleKey[]): ModuleKey[] {
  return enabled.filter((m) => available.includes(m))
}
