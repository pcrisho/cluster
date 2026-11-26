import { INestApplication } from "@nestjs/common";
import { createActor, createTestApp } from "../../test-helpers";
import { SystemPrismaService } from "../../prisma/system-prisma.service";
import { SessionService } from "./session.service";
import { ROTATION_GRACE_MS } from "./session-limits";

describe("SessionService (Postgres sessions) e2e", () => {
  let app: INestApplication;
  let sessions: SessionService;
  let prisma: SystemPrismaService;

  beforeAll(async () => {
    app = await createTestApp();
    sessions = app.get(SessionService);
    prisma = app.get(SystemPrismaService);
  });
  afterAll(() => app.close());

  const start = async (name: string) => {
    const actor = await createActor(app, name);
    // createActor signs a token of its own; these tests count sessions from zero.
    await prisma.authSession.deleteMany({ where: { userId: actor.id } });
    const created = await sessions.create({
      userId: actor.id,
      superAdmin: false,
    });
    return { actor, ...created };
  };

  it("stores only the hash of the refresh token", async () => {
    const { session, refreshToken } = await start("hash");
    const row = await prisma.authSession.findUniqueOrThrow({
      where: { id: session.id },
    });
    expect(refreshToken).not.toContain(row.refreshHash);
    expect(JSON.stringify(row)).not.toContain(refreshToken.split(".")[1]);
  });

  it("rotates: the new token works and the session keeps its total limit", async () => {
    const { session, refreshToken } = await start("rotate");
    const first = await sessions.rotate(refreshToken);
    expect(first.kind).toBe("rotated");
    if (first.kind !== "rotated") return;
    expect(first.session.absoluteExpiresAt).toEqual(session.absoluteExpiresAt);
    expect((await sessions.rotate(first.refreshToken)).kind).toBe("rotated");
  });

  it("rotates the previous token again within the grace window", async () => {
    const { refreshToken } = await start("grace");
    const first = await sessions.rotate(refreshToken);
    expect((await sessions.rotate(refreshToken)).kind).toBe("rotated");
    expect(first.kind).toBe("rotated");
  });

  it("treats the previous token past the grace window as stolen and ends every session", async () => {
    const { actor, session, refreshToken } = await start("reuse");
    const other = await sessions.create({
      userId: actor.id,
      superAdmin: false,
    });
    await sessions.rotate(refreshToken);
    await prisma.authSession.update({
      where: { id: session.id },
      data: { rotatedAt: new Date(Date.now() - ROTATION_GRACE_MS - 1000) },
    });

    expect(await sessions.rotate(refreshToken)).toEqual({
      kind: "reuse",
      userId: actor.id,
      sessionId: session.id,
    });
    const rows = await prisma.authSession.findMany({
      where: { userId: actor.id },
    });
    expect(rows.map((r) => r.revokeReason).sort()).toEqual(["REUSE", "REUSE"]);
    expect((await sessions.rotate(other.refreshToken)).kind).toBe("ended");
  });

  it("refuses a session past its idle or total limit, or revoked", async () => {
    const idle = await start("idle");
    await prisma.authSession.update({
      where: { id: idle.session.id },
      data: { idleExpiresAt: new Date(Date.now() - 1) },
    });
    expect((await sessions.rotate(idle.refreshToken)).kind).toBe("ended");

    const total = await start("total");
    await prisma.authSession.update({
      where: { id: total.session.id },
      data: { absoluteExpiresAt: new Date(Date.now() - 1) },
    });
    expect((await sessions.rotate(total.refreshToken)).kind).toBe("ended");

    const revoked = await start("revoked");
    await sessions.revoke(revoked.session.id, "LOGOUT");
    expect((await sessions.rotate(revoked.refreshToken)).kind).toBe("ended");
  });

  it("does not know a malformed or foreign token", async () => {
    const { session } = await start("unknown");
    expect((await sessions.rotate("nonsense")).kind).toBe("unknown");
    expect(
      (await sessions.rotate(`${session.id}.${"a".repeat(43)}`)).kind,
    ).toBe("unknown");
  });

  it("keeps one session under concurrent refreshes of the same token", async () => {
    const { actor, refreshToken } = await start("race");
    const results = await Promise.all(
      Array.from({ length: 5 }, () => sessions.rotate(refreshToken)),
    );
    expect(results.every((r) => r.kind === "rotated")).toBe(true);
    const rows = await prisma.authSession.findMany({
      where: { userId: actor.id },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].revokedAt).toBeNull();
  });

  it("revokes every session of a person except the one kept", async () => {
    const { actor, session } = await start("all");
    const other = await sessions.create({
      userId: actor.id,
      superAdmin: false,
    });
    await sessions.revokeAll(actor.id, "PASSWORD_CHANGED", session.id);
    const rows = await prisma.authSession.findMany({
      where: { userId: actor.id },
      orderBy: { createdAt: "asc" },
    });
    expect(rows.find((r) => r.id === session.id)?.revokedAt).toBeNull();
    expect(rows.find((r) => r.id === other.session.id)?.revokeReason).toBe(
      "PASSWORD_CHANGED",
    );
  });
});
