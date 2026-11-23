import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { SystemPrismaService } from "../../prisma/system-prisma.service";
import { createActor, createTestApp, type TestActor } from "../../test-helpers";
import { InvitationSender } from "../auth/invitation-sender";
import { MailService } from "../mail/mail.service";

const MAILPIT_URL = process.env.MAILPIT_URL || "http://localhost:8025";

async function mailpitMessages(to: string): Promise<number> {
  const res = await fetch(
    `${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`,
  );
  return ((await res.json()) as { messages: unknown[] }).messages.length;
}
const poll = async (check: () => Promise<boolean>, ms = 10_000) => {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("condition not met in time");
};

/** Invitations queued for a node's subtree are sent one by one at the configured pace (docs/specs/auth/access-without-mail). */
describe("Paced invitations e2e", () => {
  const savedPace = process.env.MAIL_INVITES_PER_MINUTE;
  let app: INestApplication;
  let db: SystemPrismaService;
  let admin: TestActor;

  beforeAll(async () => {
    // 0 pauses the timer, so the tests drive the sender with tick() and nothing else sends.
    process.env.MAIL_INVITES_PER_MINUTE = "0";
    app = await createTestApp();
    db = app.get(SystemPrismaService);
    admin = await createActor(app, "iq-admin", "ADMIN");
  });
  // The queue belongs to the instance: each test starts with it empty, so it knows what the next tick sends.
  beforeEach(async () => {
    const sender = app.get(InvitationSender);
    while (
      (await db.user.count({ where: { inviteQueuedAt: { not: null } } })) > 0
    )
      await sender.tick();
  });
  afterAll(async () => {
    await app.close();
    if (savedPace === undefined) delete process.env.MAIL_INVITES_PER_MINUTE;
    else process.env.MAIL_INVITES_PER_MINUTE = savedPace;
  });

  async function node(
    name: string,
    parentId: string | null = null,
    orgId = admin.orgId,
  ) {
    return db.orgNode.create({
      data: {
        name: `${name}-${Math.random().toString(36).slice(2, 7)}`,
        organizationId: orgId,
        parentId,
      },
    });
  }
  async function placeIn(userId: string, nodeId: string) {
    await db.userProfile.upsert({
      where: { userId },
      create: { userId, organizationId: admin.orgId, orgNodeId: nodeId },
      update: { orgNodeId: nodeId },
    });
  }
  async function pendingIn(nodeId: string) {
    const m = await createActor(app, "iq-member", "COLLABORATOR", admin.orgId);
    await placeIn(m.id, nodeId);
    return m;
  }
  const queuedAt = async (id: string) =>
    (await db.user.findUniqueOrThrow({ where: { id } })).inviteQueuedAt;
  const queue = (nodeId: string) =>
    request(app.getHttpServer())
      .post("/api/v1/org/invitations")
      .set(admin.auth)
      .send({ nodeId });

  it("queues the pending members of the node's subtree, and only those", async () => {
    const root = await node("iq-root");
    const child = await node("iq-child", root.id);
    const other = await node("iq-other");
    const p1 = await pendingIn(root.id);
    const p2 = await pendingIn(child.id);
    const active = await pendingIn(child.id);
    await db.user.update({
      where: { id: active.id },
      data: { passwordSetAt: new Date() },
    });
    const outside = await pendingIn(other.id);

    const res = await queue(root.id).expect(200);
    expect(res.body).toEqual({ queued: 2 });
    expect(await queuedAt(p1.id)).not.toBeNull();
    expect(await queuedAt(p2.id)).not.toBeNull();
    expect(await queuedAt(active.id)).toBeNull();
    expect(await queuedAt(outside.id)).toBeNull();
  });

  it("a member already queued is not counted again", async () => {
    const root = await node("iq-again");
    await pendingIn(root.id);
    expect((await queue(root.id).expect(200)).body).toEqual({ queued: 1 });
    expect((await queue(root.id).expect(200)).body).toEqual({ queued: 0 });
  });

  it("another organization's node is not found", async () => {
    const other = await createActor(app, "iq-other-org");
    const foreign = await node("iq-foreign", null, other.orgId);
    await queue(foreign.id).expect(404);
  });

  it("a tick sends the oldest queued invitation and clears its mark: one per tick", async () => {
    const root = await node("iq-tick");
    const a = await pendingIn(root.id);
    const b = await pendingIn(root.id);
    await queue(root.id).expect(200);
    await app.get(InvitationSender).tick();
    const left = [await queuedAt(a.id), await queuedAt(b.id)].filter(
      (d) => d !== null,
    );
    expect(left).toHaveLength(1);
    const emailA = (await db.user.findUniqueOrThrow({ where: { id: a.id } }))
      .email;
    const emailB = (await db.user.findUniqueOrThrow({ where: { id: b.id } }))
      .email;
    expect(
      (await mailpitMessages(emailA)) + (await mailpitMessages(emailB)),
    ).toBe(1);
  });

  it("a failed send clears the mark and is logged; the queue goes on", async () => {
    const root = await node("iq-fail");
    const a = await pendingIn(root.id);
    await queue(root.id).expect(200);
    const mail = app.get(MailService);
    const spy = jest
      .spyOn(mail, "send")
      .mockRejectedValueOnce(new Error("smtp down"));
    try {
      await expect(app.get(InvitationSender).tick()).resolves.toBeUndefined();
    } finally {
      spy.mockRestore();
    }
    expect(await queuedAt(a.id)).toBeNull();
    expect(
      await mailpitMessages(
        (await db.user.findUniqueOrThrow({ where: { id: a.id } })).email,
      ),
    ).toBe(0);
  });

  it("a member of an organization suspended after queueing gets nothing, and the mark clears", async () => {
    const other = await createActor(app, "iq-suspended");
    const m = await createActor(
      app,
      "iq-suspended-member",
      "COLLABORATOR",
      other.orgId,
    );
    await db.user.update({
      where: { id: m.id },
      data: { inviteQueuedAt: new Date() },
    });
    await db.organization.update({
      where: { id: other.orgId },
      data: { isActive: false },
    });
    await app.get(InvitationSender).tick();
    expect(await queuedAt(m.id)).toBeNull();
    expect(
      await mailpitMessages(
        (await db.user.findUniqueOrThrow({ where: { id: m.id } })).email,
      ),
    ).toBe(0);
  });

  it("a restart resumes the queue: a sender started later sends what was still waiting", async () => {
    const root = await node("iq-restart");
    const a = await pendingIn(root.id);
    const b = await pendingIn(root.id);
    await queue(root.id).expect(200);
    // The timer is off in this app: the invitations wait in the column, as they would across a restart.
    await app.close();

    process.env.MAIL_INVITES_PER_MINUTE = "600";
    app = await createTestApp();
    db = app.get(SystemPrismaService);
    try {
      await poll(
        async () =>
          (await queuedAt(a.id)) === null && (await queuedAt(b.id)) === null,
      );
      const emailA = (await db.user.findUniqueOrThrow({ where: { id: a.id } }))
        .email;
      const emailB = (await db.user.findUniqueOrThrow({ where: { id: b.id } }))
        .email;
      await poll(
        async () =>
          (await mailpitMessages(emailA)) === 1 &&
          (await mailpitMessages(emailB)) === 1,
      );
    } finally {
      process.env.MAIL_INVITES_PER_MINUTE = "0";
    }
  });
});
