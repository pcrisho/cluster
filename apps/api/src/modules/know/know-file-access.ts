import {
  Injectable,
  NotFoundException,
  type OnModuleInit,
} from "@nestjs/common"
import type { AuthenticatedUser } from "../../common/decorators"
import { FileAccessRegistry } from "../storage/file-access.registry"
import { SpaceAccessService } from "./space-access.service"

/**
 * Stored KNOW files follow the access of what they belong to: `pages/<pageId>/…` needs read access
 * to the page (drafts stay hidden from readers), `spaces/<spaceId>/…` read access to the space.
 */
@Injectable()
export class KnowFileAccess implements OnModuleInit {
  constructor(
    private readonly registry: FileAccessRegistry,
    private readonly access: SpaceAccessService,
  ) {}

  onModuleInit(): void {
    this.registry.register("pages", (user, pageId) =>
      this.canReadPage(user, pageId),
    )
    this.registry.register(
      "spaces",
      async (user, spaceId) =>
        (await this.access.roleIn(user, spaceId)) !== null,
    )
  }

  private async canReadPage(
    user: AuthenticatedUser,
    pageId: string,
  ): Promise<boolean> {
    try {
      await this.access.requirePage(user, pageId, "READ")
      return true
    } catch (error) {
      if (error instanceof NotFoundException) return false
      throw error
    }
  }
}
