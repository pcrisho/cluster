import { INestApplication } from "@nestjs/common";
import { randomUUID } from "crypto";
import type { AddressInfo } from "net";
import { io, type Socket } from "socket.io-client";
import { AuthTokens } from "../modules/auth/auth-tokens";
import { SessionService } from "../modules/auth/session.service";
import { createActor, createTestApp } from "../test-helpers";

/** The realtime socket follows the session: no live session, no socket (docs/specs/auth/hardening R-12). */
describe("WebSocket sessions e2e", () => {
  let app: INestApplication;
  let url: string;
  let tokens: AuthTokens;
  let sessions: SessionService;
  const open: Socket[] = [];

  beforeAll(async () => {
    app = await createTestApp();
    await app.listen(0);
    url = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
    tokens = app.get(AuthTokens);
    sessions = app.get(SessionService);
  });
  afterAll(async () => {
    open.forEach((s) => s.close());
    await app.close();
  });

  /** Resolves "connected" once the server accepted the socket (it joined its rooms), or "refused". */
  function connect(
    token: string,
  ): Promise<{ socket: Socket; result: "connected" | "refused" }> {
    const socket = io(url, {
      auth: { token },
      transports: ["websocket"],
      reconnection: false,
    });
    open.push(socket);
    return new Promise((resolve) => {
      let settled = false;
      const done = (result: "connected" | "refused") => {
        if (!settled) {
          settled = true;
          resolve({ socket, result });
        }
      };
      socket.on("disconnect", () => done("refused"));
      socket.on("connect_error", () => done("refused"));
      // The server disconnects a refused socket right after the handshake; give it that moment.
      socket.on("connect", () =>
        setTimeout(() => done(socket.connected ? "connected" : "refused"), 300),
      );
    });
  }
  const closed = (socket: Socket) =>
    new Promise<boolean>((resolve) => {
      if (!socket.connected) return resolve(true);
      const timer = setTimeout(() => resolve(false), 2000);
      socket.on("disconnect", () => {
        clearTimeout(timer);
        resolve(true);
      });
    });

  const sessionToken = async (userId: string) => {
    const { session } = await sessions.create({ userId, superAdmin: false });
    return {
      sid: session.id,
      token: tokens.sign("access", { sub: userId, sid: session.id }, 15 * 60),
    };
  };

  it("accepts a token of a live session", async () => {
    const actor = await createActor(app, "ws-live");
    expect((await connect(actor.token)).result).toBe("connected");
  });

  it("refuses a well-signed token whose session does not exist", async () => {
    const actor = await createActor(app, "ws-nosession");
    const token = tokens.sign(
      "access",
      { sub: actor.id, sid: randomUUID() },
      15 * 60,
    );
    expect((await connect(token)).result).toBe("refused");
  });

  it("refuses a file token", async () => {
    const actor = await createActor(app, "ws-file");
    const { sid } = await sessionToken(actor.id);
    expect(
      (await connect(tokens.sign("file", { sub: actor.id, sid }, 60))).result,
    ).toBe("refused");
  });

  it("closes the socket when its session is revoked, and only that one", async () => {
    const actor = await createActor(app, "ws-revoke");
    const a = await sessionToken(actor.id);
    const b = await sessionToken(actor.id);
    const sa = await connect(a.token);
    const sb = await connect(b.token);
    expect([sa.result, sb.result]).toEqual(["connected", "connected"]);

    await sessions.revoke(a.sid, "LOGOUT");
    expect(await closed(sa.socket)).toBe(true);
    expect(sb.socket.connected).toBe(true);
  });

  it("closes every socket of the person but the kept session when all are revoked", async () => {
    const actor = await createActor(app, "ws-all");
    const keep = await sessionToken(actor.id);
    const other = await sessionToken(actor.id);
    const sk = await connect(keep.token);
    const so = await connect(other.token);

    await sessions.revokeAll(actor.id, "PASSWORD_CHANGED", keep.sid);
    expect(await closed(so.socket)).toBe(true);
    expect(sk.socket.connected).toBe(true);
  });

  it("closes the socket when its token expires", async () => {
    const actor = await createActor(app, "ws-expiry");
    const { sid } = await sessionToken(actor.id);
    const { socket, result } = await connect(
      tokens.sign("access", { sub: actor.id, sid }, 2),
    );
    expect(result).toBe("connected");
    expect(await closed(socket)).toBe(true);
  });
});
