import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from "@nestjs/websockets";
import type { OnModuleInit } from "@nestjs/common";
import { Server, Socket } from "socket.io";
import { AuthTokens } from "../modules/auth/auth-tokens";
import { AuthUserService } from "../modules/auth/auth-user.service";
import {
  SessionService,
  type RevokedSessions,
} from "../modules/auth/session.service";

@WebSocketGateway({
  cors: { origin: process.env.WS_CORS_ORIGIN || "http://localhost:3000" },
})
export class WsGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit
{
  constructor(
    private readonly tokens: AuthTokens,
    private readonly authUser: AuthUserService,
    private readonly sessions: SessionService,
  ) {}

  @WebSocketServer() server!: Server;

  onModuleInit() {
    this.sessions.onRevoke((revoked) => this.disconnect(revoked));
  }

  /**
   * An access token of a live session; the organization comes from the database, not the token.
   * The socket closes when the token expires (the client reconnects with a fresh one) or when its
   * session is revoked.
   */
  async handleConnection(client: Socket) {
    const token = client.handshake.auth?.token as string | undefined;
    const claims = token ? this.tokens.verify(token, ["access"]) : null;
    if (!claims) {
      client.disconnect(true);
      return;
    }
    try {
      const user = await this.authUser.load(claims.sub, claims.sid);
      client.data.userId = user.id;
      client.data.orgId = user.orgId;
      client.data.sessionId = claims.sid;
      client.join(`user:${user.id}`);
      client.join(`org:${user.orgId}`);
      client.join(`session:${claims.sid}`);
      const expiry = setTimeout(
        () => client.disconnect(true),
        Math.max(0, claims.exp * 1000 - Date.now()),
      );
      client.data.expiry = expiry;
    } catch {
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    clearTimeout(client.data.expiry);
  }

  /** Closes the sockets of sessions that just ended. */
  private async disconnect({ userId, sessionId, except }: RevokedSessions) {
    const sockets = await this.server
      .in(sessionId ? `session:${sessionId}` : `user:${userId}`)
      .fetchSockets();
    for (const socket of sockets) {
      if (!except || socket.data.sessionId !== except) socket.disconnect(true);
    }
  }

  emitToOrg(orgId: string, event: string, data: unknown) {
    this.server.to(`org:${orgId}`).emit(event, data);
  }

  emitToUser(userId: string, event: string, data: unknown) {
    this.server.to(`user:${userId}`).emit(event, data);
  }
}
