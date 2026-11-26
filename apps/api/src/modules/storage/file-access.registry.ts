import { Injectable } from "@nestjs/common"
import type { AuthenticatedUser } from "../../common/decorators"
import { orgKeyPrefix } from "./file-url"

/** Whether a user may read the files of one owner (a page, a space, a course). */
export type FileReadCheck = (
  user: AuthenticatedUser,
  ownerId: string,
) => Promise<boolean>

/**
 * Who may read each stored file. Keys are `organizations/<org>/<segment>/<ownerId>/…`; the feature
 * that owns a segment registers its check (core cannot import features). `uploads/` (avatars, feed,
 * lesson text images) is organization-wide; a segment nobody registered is never served.
 */
@Injectable()
export class FileAccessRegistry {
  private readonly checks = new Map<string, FileReadCheck>()

  register(segment: string, check: FileReadCheck): void {
    if (this.checks.has(segment))
      throw new Error(`File segment already registered: ${segment}`)
    this.checks.set(segment, check)
  }

  async canRead(user: AuthenticatedUser, key: string): Promise<boolean> {
    const prefix = orgKeyPrefix(user.orgId)
    if (!key.startsWith(prefix)) return false
    const [segment, ownerId, ...rest] = key.slice(prefix.length).split("/")
    if (!segment || !ownerId || [segment, ownerId, ...rest].includes(".."))
      return false
    if (segment === "uploads") return true
    const check = this.checks.get(segment)
    return check ? check(user, ownerId) : false
  }
}
