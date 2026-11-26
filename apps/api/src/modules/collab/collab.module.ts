import { Module, type OnModuleInit } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { SessionService } from "../auth/session.service";
import { CollabAuthService } from "./collab-auth.service";
import { CollabClient } from "./collab.client";
import { CollabConfig } from "./collab.config";
import { CollabInternalController } from "./collab-internal.controller";
import { CollabRegistry } from "./collab.registry";
import { CollabSecretGuard } from "./collab-secret.guard";

/** Core collaboration plumbing. Features register their document providers in onModuleInit. */
@Module({
  imports: [AuthModule],
  controllers: [CollabInternalController],
  providers: [
    CollabConfig,
    CollabClient,
    CollabRegistry,
    CollabSecretGuard,
    CollabAuthService,
  ],
  exports: [CollabConfig, CollabClient, CollabRegistry, CollabSecretGuard],
})
export class CollabModule implements OnModuleInit {
  constructor(
    private readonly sessions: SessionService,
    private readonly collab: CollabClient,
  ) {}

  /** An ended session must not keep an editor open: collab rechecks the person's connections. */
  onModuleInit() {
    this.sessions.onRevoke(({ userId }) =>
      this.collab.recheck({ scope: "user", id: userId }),
    );
  }
}
