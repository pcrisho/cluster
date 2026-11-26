import { INestApplication, NotFoundException } from "@nestjs/common";
import { randomUUID } from "crypto";
import { AuthTokens } from "../auth/auth-tokens";
import { SessionService } from "../auth/session.service";
import request from "supertest";
import { SystemPrismaService } from "../../prisma/system-prisma.service";
import { createActor, createTestApp } from "../../test-helpers";
import { CollabRegistry } from "./collab.registry";
import type { CollabDocumentProvider, CollabMode } from "./collab.types";

describe("Collab internal body limits e2e", () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;

  const bodyOf = (mb: number) => ({ data: "x".repeat(mb * 1024 * 1024) });

  beforeAll(async () => {
    app = await createTestApp();
    http = request(app.getHttpServer());
  });

  afterAll(async () => app?.close());

  it("accepts a ~5 MB body on the internal collab prefix (route not found, not too large)", async () => {
    const res = await http
      .post("/api/v1/internal/collab/anything")
      .send(bodyOf(5));
    expect(res.status).toBe(404);
  });

  it("rejects a ~5 MB body on the regular API with 413", async () => {
    const res = await http.post("/api/v1/auth/login").send(bodyOf(5));
    expect(res.status).toBe(413);
  });

  it("rejects a ~15 MB body on the internal collab prefix with 413", async () => {
    const res = await http
      .post("/api/v1/internal/collab/anything")
      .send(bodyOf(15));
    expect(res.status).toBe(413);
  });
});

describe("Collab internal authorization e2e", () => {
  const SECRET = "test-collab-secret-".repeat(4);
  const DOC = "test.doc:11111111-1111-4111-8111-111111111111";
  const secret = { "X-Collab-Secret": SECRET };

  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let prisma: SystemPrismaService;
  let tokens: AuthTokens;
  let previousSecret: string | undefined;
  let outcome: CollabMode | "NOT_FOUND" = "WRITE";

  const authorize = (body: object) =>
    http.post("/api/v1/internal/collab/authorize").set(secret).send(body);
  const authorizeUser = (body: object) =>
    http.post("/api/v1/internal/collab/authorize-user").set(secret).send(body);

  beforeAll(async () => {
    previousSecret = process.env.COLLAB_INTERNAL_SECRET;
    process.env.COLLAB_INTERNAL_SECRET = SECRET;
    app = await createTestApp();
    http = request(app.getHttpServer());
    prisma = app.get(SystemPrismaService);
    tokens = app.get(AuthTokens);
    const provider: CollabDocumentProvider = {
      kind: "test.doc",
      module: "GROW",
      authorize: async () => {
        if (outcome === "NOT_FOUND") throw new NotFoundException();
        return outcome;
      },
      organizationOf: async () => null,
      load: async () => null,
      seed: async () => true,
      store: async () => false,
    };
    app.get(CollabRegistry).register(provider);
  });

  beforeEach(() => {
    outcome = "WRITE";
  });

  afterAll(async () => {
    if (previousSecret === undefined) delete process.env.COLLAB_INTERNAL_SECRET;
    else process.env.COLLAB_INTERNAL_SECRET = previousSecret;
    await app?.close();
  });

  describe("secret", () => {
    it("rejects a request without the secret header", async () => {
      const u = await createActor(app, "nosecret");
      await http
        .post("/api/v1/internal/collab/authorize")
        .send({ token: u.token, documentName: DOC })
        .expect(401);
      await http
        .post("/api/v1/internal/collab/authorize-user")
        .send({ userId: u.id, documentName: DOC })
        .expect(401);
    });

    it("rejects a wrong secret", async () => {
      const u = await createActor(app, "wrongsecret");
      await http
        .post("/api/v1/internal/collab/authorize")
        .set({ "X-Collab-Secret": "nope" })
        .send({ token: u.token, documentName: DOC })
        .expect(401);
    });

    it("fails closed when no secret is configured", async () => {
      const u = await createActor(app, "unset");
      delete process.env.COLLAB_INTERNAL_SECRET;
      try {
        await authorize({ token: u.token, documentName: DOC }).expect(401);
        await http
          .post("/api/v1/internal/collab/authorize")
          .set({ "X-Collab-Secret": "" })
          .send({ token: u.token, documentName: DOC })
          .expect(401);
      } finally {
        process.env.COLLAB_INTERNAL_SECRET = SECRET;
      }
    });
  });

  describe("token", () => {
    it("rejects an invalid token", async () => {
      await authorize({ token: "garbage", documentName: DOC }).expect(401);
    });

    it("rejects an expired token", async () => {
      const u = await createActor(app, "expired");
      const token = tokens.sign("access", { sub: u.id, sid: randomUUID() }, -1);
      await authorize({ token, documentName: DOC }).expect(401);
    });

    it("rejects a token that is not an access token", async () => {
      const u = await createActor(app, "filetoken");
      const sid = (
        await prisma.authSession.findFirstOrThrow({ where: { userId: u.id } })
      ).id;
      const token = tokens.sign("file", { sub: u.id, sid }, 15 * 60);
      await authorize({ token, documentName: DOC }).expect(401);
    });

    it("rejects a token of a user that no longer exists", async () => {
      const token = tokens.sign(
        "access",
        { sub: "00000000-0000-4000-8000-000000000000", sid: randomUUID() },
        15 * 60,
      );
      await authorize({ token, documentName: DOC }).expect(401);
    });
  });

  describe("validation", () => {
    it("rejects a malformed documentName with 400", async () => {
      const u = await createActor(app, "badname");
      for (const documentName of [
        "nocolon",
        "Test.Doc:11111111-1111-4111-8111-111111111111",
        "test.doc:short",
        "test.doc:",
      ]) {
        await authorize({ token: u.token, documentName }).expect(400);
        await authorizeUser({ userId: u.id, documentName }).expect(400);
      }
      await authorize({ token: "", documentName: DOC }).expect(400);
      await authorizeUser({ userId: "", documentName: DOC }).expect(400);
    });
  });

  describe("account state", () => {
    it("rejects a deactivated user on both endpoints", async () => {
      const u = await createActor(app, "inactive");
      await prisma.user.update({
        where: { id: u.id },
        data: { isActive: false },
      });
      await authorize({ token: u.token, documentName: DOC }).expect(401);
      await authorizeUser({ userId: u.id, documentName: DOC }).expect(401);
    });

    it("rejects a user of a deactivated organization on both endpoints", async () => {
      const u = await createActor(app, "suspended");
      await prisma.organization.update({
        where: { id: u.orgId },
        data: { isActive: false },
      });
      await authorize({ token: u.token, documentName: DOC }).expect(401);
      await authorizeUser({ userId: u.id, documentName: DOC }).expect(401);
    });
  });

  describe("document", () => {
    it("answers 403 when the provider's module is disabled for the organization", async () => {
      const u = await createActor(app, "nomodule");
      await prisma.organization.update({
        where: { id: u.orgId },
        data: { enabledModules: ["KNOW"] },
      });
      await authorize({ token: u.token, documentName: DOC }).expect(403);
      await authorizeUser({ userId: u.id, documentName: DOC }).expect(403);
    });

    it("answers 404 for an unknown kind", async () => {
      const u = await createActor(app, "nokind");
      const documentName = "other.thing:11111111-1111-4111-8111-111111111111";
      await authorize({ token: u.token, documentName }).expect(404);
      await authorizeUser({ userId: u.id, documentName }).expect(404);
    });

    it("lets the provider's 404 through", async () => {
      const u = await createActor(app, "notfound");
      outcome = "NOT_FOUND";
      await authorize({ token: u.token, documentName: DOC }).expect(404);
      await authorizeUser({ userId: u.id, documentName: DOC }).expect(404);
    });

    it("returns the mode the provider decides, with the user's own identity", async () => {
      const u = await createActor(app, "happy");
      const first = await authorize({
        token: u.token,
        documentName: DOC,
      }).expect(200);
      expect(first.body).toEqual({
        userId: u.id,
        orgId: u.orgId,
        name: "happy Test",
        avatarUrl: null,
        color: expect.stringMatching(/^#[0-9a-f]{6}$/),
        mode: "WRITE",
        sessionId: expect.any(String),
      });

      outcome = "READ";
      const second = await authorize({
        token: u.token,
        documentName: DOC,
      }).expect(200);
      expect(second.body.mode).toBe("READ");
      expect(second.body.color).toBe(first.body.color);
    });

    it("returns a browser URL for a stored avatar key", async () => {
      const u = await createActor(app, "avatar");
      const key = `organizations/${u.orgId}/uploads/a.png`;
      await prisma.user.update({
        where: { id: u.id },
        data: { avatarUrl: key },
      });
      const res = await authorizeUser({
        userId: u.id,
        documentName: DOC,
      }).expect(200);
      expect(res.body.avatarUrl).toMatch(
        new RegExp(`/files/organizations/${u.orgId}/uploads/a\\.png$`),
      );
    });

    it("/authorize-user answers like /authorize without a token, for the session it is given", async () => {
      const u = await createActor(app, "byuser");
      const viaToken = await authorize({
        token: u.token,
        documentName: DOC,
      }).expect(200);
      const viaUser = await authorizeUser({
        userId: u.id,
        documentName: DOC,
        sessionId: viaToken.body.sessionId,
      }).expect(200);
      expect(viaUser.body).toEqual(viaToken.body);
    });

    it("/authorize-user refuses a connection whose session has ended", async () => {
      const u = await createActor(app, "endedsession");
      const { sessionId } = (
        await authorize({ token: u.token, documentName: DOC }).expect(200)
      ).body;
      await app.get(SessionService).revoke(sessionId, "LOGOUT");
      await authorizeUser({
        userId: u.id,
        documentName: DOC,
        sessionId,
      }).expect(401);
      await authorize({ token: u.token, documentName: DOC }).expect(401);
    });

    it("reports each user's own organization, never mixing them", async () => {
      const a = await createActor(app, "orga");
      const b = await createActor(app, "orgb");
      const resA = await authorize({
        token: a.token,
        documentName: DOC,
      }).expect(200);
      const resB = await authorize({
        token: b.token,
        documentName: DOC,
      }).expect(200);
      expect(resA.body.orgId).toBe(a.orgId);
      expect(resB.body.orgId).toBe(b.orgId);
      expect(resA.body.orgId).not.toBe(resB.body.orgId);
    });
  });
});
