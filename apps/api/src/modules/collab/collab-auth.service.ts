import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import type { AuthenticatedUser } from "../../common/decorators";
import { withOrg } from "../../common/request-context";
import { AuthUserService } from "../auth/auth-user.service";
import { AuthTokens } from "../auth/auth-tokens";
import { fileUrl } from "../storage/file-url";
import { collabColor } from "./color";
import { CollabRegistry } from "./collab.registry";
import type { CollabMode } from "./collab.types";

export interface CollabSession {
  userId: string;
  orgId: string;
  name: string;
  avatarUrl: string | null;
  color: string;
  mode: CollabMode;
  /** The auth session the token belongs to; collab sends it back on every recheck. */
  sessionId?: string;
}

@Injectable()
export class CollabAuthService {
  constructor(
    private readonly tokens: AuthTokens,
    private readonly authUser: AuthUserService,
    private readonly registry: CollabRegistry,
    private readonly prisma: PrismaService,
  ) {}

  async authorizeToken(
    token: string,
    documentName: string,
  ): Promise<CollabSession> {
    const claims = this.tokens.verify(token, ["access"]);
    if (!claims) throw new UnauthorizedException("Invalid token");
    return this.authorize(
      await this.authUser.load(claims.sub, claims.sid),
      documentName,
    );
  }

  /** A recheck of a live connection: with its session, a revoked session fails like a revoked access. */
  async authorizeUser(
    userId: string,
    documentName: string,
    sessionId?: string,
  ): Promise<CollabSession> {
    return this.authorize(
      await this.authUser.load(userId, sessionId),
      documentName,
    );
  }

  private async authorize(
    user: AuthenticatedUser,
    documentName: string,
  ): Promise<CollabSession> {
    // documentName is validated by the DTO: the first ":" separates kind and id.
    const sep = documentName.indexOf(":");
    const provider = this.registry.get(documentName.slice(0, sep));
    if (!user.modules.includes(provider.module))
      throw new ForbiddenException({
        code: "MODULE_DISABLED",
        message: "Module not enabled",
      });
    const { mode, person } = await withOrg(user.orgId, async () => ({
      mode: await provider.authorize(user, documentName.slice(sep + 1)),
      person: await this.prisma.user.findUniqueOrThrow({
        where: { id: user.id },
        select: { firstName: true, lastName: true, avatarUrl: true },
      }),
    }));
    return {
      userId: user.id,
      orgId: user.orgId,
      name: `${person.firstName} ${person.lastName}`.trim(),
      // Avatars are stored as object keys (or, rarely, an external URL).
      avatarUrl: person.avatarUrl?.startsWith("organizations/")
        ? fileUrl(person.avatarUrl)
        : person.avatarUrl,
      color: collabColor(user.id),
      mode,
      ...(user.sessionId && { sessionId: user.sessionId }),
    };
  }
}
