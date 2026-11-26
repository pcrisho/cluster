import {
  appendParagraph,
  Harness,
  pause,
  startHarness,
  texts,
  until,
} from "./collab-integration-harness";
import { AuthTokens } from "../auth/auth-tokens";
import { SessionService } from "../auth/session.service";

/** The session id inside a test token (signature not checked: the harness signed it). */
const parseSid = (token: string): string =>
  JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString()).sid;

/** A fast reaction, in ms: "within 5 s" in the spec. */
const FAST = 5000;

/**
 * What happens to people who have a page open when access changes, the page is deleted or a
 * version is restored: the real API, the real collab service and real clients.
 */
describe("COLLAB lifecycle integration e2e", () => {
  let h: Harness;
  beforeAll(async () => {
    h = await startHarness();
  });
  afterEach(() => h.disconnectAll());
  afterAll(() => h?.stop());

  const spaceApi = (spaceId: string, tail = "") =>
    `/api/v1/know/spaces/${spaceId}${tail}`;
  const pageApi = (pageId: string, tail = "") =>
    `/api/v1/know/pages/${pageId}${tail}`;

  describe("access changes", () => {
    it("demoting an editor makes the open session read-only within seconds and keeps their edits out", async () => {
      const { admin, editor, space, entries, mkPage } = await h.world();
      const pageId = await mkPage({ text: "original" });
      const writer = h.connect(admin.token, pageId);
      const demoted = h.connect(editor.token, pageId);
      await h.synced(writer, demoted);

      await h.http
        .patch(spaceApi(space.id, `/access/${entries[editor.id]}`))
        .set(admin.auth)
        .send({ role: "VIEWER" })
        .expect(200);
      await until(
        () =>
          demoted.events.stateless.some((m) => JSON.parse(m).mode === "READ"),
        "the demoted editor to be told",
        FAST,
      );

      appendParagraph(demoted.ydoc, "TOO LATE");
      appendParagraph(writer.ydoc, "legit");
      await until(
        () => texts(demoted.ydoc).includes("legit"),
        "the demoted editor to still receive edits",
      );
      await until(
        async () =>
          JSON.stringify((await h.row(pageId)).content).includes("legit"),
        "the save",
      );
      expect(texts(writer.ydoc)).not.toContain("TOO LATE");
      expect(JSON.stringify((await h.row(pageId)).content)).not.toContain(
        "TOO LATE",
      );
    });

    it("removing a person's entry disconnects them and leaves the others", async () => {
      const { admin, editor, space, entries, mkPage } = await h.world();
      const pageId = await mkPage();
      const stays = h.connect(admin.token, pageId);
      const loses = h.connect(editor.token, pageId);
      await h.synced(stays, loses);

      await h.http
        .delete(spaceApi(space.id, `/access/${entries[editor.id]}`))
        .set(admin.auth)
        .expect(204);

      await until(
        () => loses.events.closes.includes("access-revoked"),
        "the person to be disconnected",
        FAST,
      );
      expect(stays.events.closes).toEqual([]);
    });

    it("deactivating a user disconnects them", async () => {
      const { admin, editor, mkPage } = await h.world();
      const pageId = await mkPage();
      const other = h.connect(admin.token, pageId);
      const gone = h.connect(editor.token, pageId);
      await h.synced(other, gone);

      await h.http
        .patch(`/api/v1/org/members/${editor.id}`)
        .set(admin.auth)
        .send({ isActive: false })
        .expect(200);

      await until(
        () => gone.events.closes.includes("access-revoked"),
        "the user to be disconnected",
        FAST,
      );
      expect(other.events.closes).toEqual([]);
    });

    it("ending a person's session disconnects that session's editors and leaves their other one", async () => {
      const { admin, editor, mkPage } = await h.world();
      const pageId = await mkPage();
      const sessions = h.app.get(SessionService);
      const second = await sessions.create({
        userId: editor.id,
        superAdmin: false,
      });
      const otherToken = h.app
        .get(AuthTokens)
        .sign("access", { sub: editor.id, sid: second.session.id }, 15 * 60);
      const other = h.connect(admin.token, pageId);
      const ended = h.connect(editor.token, pageId);
      const kept = h.connect(otherToken, pageId);
      await h.synced(other, ended, kept);

      const sid = parseSid(editor.token);
      await sessions.revoke(sid, "LOGOUT");

      await until(
        () => ended.events.closes.includes("access-revoked"),
        "the ended session to be disconnected",
        FAST,
      );
      expect(kept.events.closes).toEqual([]);
      expect(other.events.closes).toEqual([]);
    });

    it("restricting an open space disconnects whoever has no entry", async () => {
      const { admin, outsider, mkPage } = await h.world();
      const open = await h.prisma.space.create({
        data: {
          name: "Open",
          restricted: false,
          organizationId: admin.orgId,
          createdBy: admin.id,
        },
      });
      const pageId = await mkPage({ spaceId: open.id });
      const manager = h.connect(admin.token, pageId);
      const reader = h.connect(outsider.token, pageId);
      await h.synced(manager, reader);

      await h.http
        .patch(spaceApi(open.id))
        .set(admin.auth)
        .send({ restricted: true })
        .expect(200);

      await until(
        () => reader.events.closes.includes("access-revoked"),
        "the reader to be disconnected",
        FAST,
      );
      expect(manager.events.closes).toEqual([]);
    });

    it("archiving a page disconnects a viewer but not an editor", async () => {
      const { admin, editor, viewer, mkPage } = await h.world();
      const pageId = await mkPage();
      const writer = h.connect(editor.token, pageId);
      const reader = h.connect(viewer.token, pageId);
      await h.synced(writer, reader);

      await h.http
        .patch(pageApi(pageId, "/status"))
        .set(admin.auth)
        .send({ status: "ARCHIVED" })
        .expect(200);

      await until(
        () => reader.events.closes.includes("access-revoked"),
        "the viewer to be disconnected",
        FAST,
      );
      expect(writer.events.closes).toEqual([]);
    });
  });

  describe("deleting a page", () => {
    it("closes sessions where nobody has typed, which no pending save would ever reach", async () => {
      const { admin, editor, mkPage } = await h.world();
      const pageId = await mkPage();
      const a = h.connect(admin.token, pageId);
      const b = h.connect(editor.token, pageId);
      await h.synced(a, b);
      await pause(400); // the first save (the seed) is done: nothing is pending

      await h.http.delete(pageApi(pageId)).set(admin.auth).expect(200);

      await until(
        () => [a, b].every((c) => c.events.closes.includes("document-deleted")),
        "both sessions to close",
        FAST,
      );
    });

    it("closes every session and does not save what was still pending", async () => {
      const { admin, editor, mkPage } = await h.world();
      const pageId = await mkPage({ text: "doomed" });
      const a = h.connect(admin.token, pageId);
      const b = h.connect(editor.token, pageId);
      await h.synced(a, b);

      appendParagraph(b.ydoc, "typed just before the delete");
      await until(
        () => texts(a.ydoc).length === 2,
        "the edit to reach the other client",
      );
      await h.http.delete(pageApi(pageId)).set(admin.auth).expect(200);

      await until(
        () => [a, b].every((c) => c.events.closes.includes("document-deleted")),
        "both sessions to close",
        FAST,
      );
      await pause(600); // longer than the save debounce
      expect(
        await h.prisma.page.findUnique({ where: { id: pageId } }),
      ).toBeNull();
    });
  });

  describe("restoring a version", () => {
    it("reaches the other client, and what was there stays in the history so it can be brought back", async () => {
      const { admin, editor, mkPage } = await h.world();
      const pageId = await mkPage({ text: "first" });
      const a = h.connect(admin.token, pageId);
      const b = h.connect(editor.token, pageId);
      await h.synced(a, b);

      const first = await h.http
        .post(pageApi(pageId, "/versions"))
        .set(admin.auth)
        .expect(201);
      appendParagraph(b.ydoc, "second");
      await until(
        () => texts(a.ydoc).length === 2,
        "the second paragraph to reach the other client",
      );

      await h.http
        .post(pageApi(pageId, `/restore/${first.body.data.id}`))
        .set(admin.auth)
        .expect(201);
      await until(
        () => [a, b].every((c) => texts(c.ydoc).join("|") === "first"),
        "both clients to show the restored body",
        FAST,
      );
      expect(JSON.stringify((await h.row(pageId)).content)).not.toContain(
        "second",
      );

      // Going back is restoring the version that restore kept.
      const listed = (
        await h.http
          .get(pageApi(pageId, "/versions"))
          .set(admin.auth)
          .expect(200)
      ).body.data;
      // The list carries no bodies: read each version to find the one that kept "second".
      const versions = await Promise.all(
        listed.map(
          async (v: { id: string }) =>
            (
              await h.http
                .get(pageApi(pageId, `/versions/${v.id}`))
                .set(admin.auth)
                .expect(200)
            ).body.data,
        ),
      );
      const before = versions.find((v: { content: unknown }) =>
        JSON.stringify(v.content).includes("second"),
      );
      expect(before).toBeDefined();
      await h.http
        .post(pageApi(pageId, `/restore/${before.id}`))
        .set(admin.auth)
        .expect(201);
      await until(
        () => [a, b].every((c) => texts(c.ydoc).join("|") === "first|second"),
        "both clients to get it back",
        FAST,
      );
    });
  });

  describe("when the collab service does not answer", () => {
    it("reading and acting through REST keep working; restoring says 503", async () => {
      const { admin, editor, space, entries, mkPage } = await h.world();
      const pageId = await mkPage({ text: "kept" });
      const open = h.connect(admin.token, pageId);
      await h.synced(open);
      const version = await h.http
        .post(pageApi(pageId, "/versions"))
        .set(admin.auth)
        .expect(201);

      const real = process.env.COLLAB_URL;
      process.env.COLLAB_URL = "http://127.0.0.1:1";
      try {
        const read = await h.http
          .get(pageApi(pageId))
          .set(editor.auth)
          .expect(200);
        expect(JSON.stringify(read.body.data.content)).toContain("kept");
        await h.http
          .patch(spaceApi(space.id, `/access/${entries[editor.id]}`))
          .set(admin.auth)
          .send({ role: "VIEWER" })
          .expect(200);
        await h.http
          .patch(pageApi(pageId, "/status"))
          .set(admin.auth)
          .send({ status: "DRAFT" })
          .expect(200);
        await h.http
          .post(pageApi(pageId, `/restore/${version.body.data.id}`))
          .set(admin.auth)
          .expect(503);
        await h.http.delete(pageApi(pageId)).set(admin.auth).expect(200);
      } finally {
        process.env.COLLAB_URL = real;
      }
      expect(
        await h.prisma.page.findUnique({ where: { id: pageId } }),
      ).toBeNull();
    });
  });
});
