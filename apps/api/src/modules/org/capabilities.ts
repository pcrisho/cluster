import { Capability, ModuleKey } from "@prisma/client"

/** The module each capability belongs to; it can only be granted while that module is enabled. */
export const CAPABILITY_MODULE: Record<Capability, ModuleKey> = {
  KNOW_SPACE_CREATE: ModuleKey.KNOW,
  KNOW_SPACE_DELETE: ModuleKey.KNOW,
  GROW_COURSE_MANAGE: ModuleKey.GROW,
}
