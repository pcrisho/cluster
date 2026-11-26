import { randomUUID } from "crypto";
import * as Y from "yjs";
import { createActor } from "../../test-helpers";
// The collab service is imported from its source: no workspace dependency, so docker/Dockerfile.api is unaffected.
import {
  decodeState,
  replaceFields,
  ydocToFields,
} from "../../../../collab/src/index";
import {
  appendParagraph,
  doc,
  Harness,
  normalized,
  pause,
  startHarness,
  texts,
  until,
  validFields,
} from "./collab-integration-harness";

/** The real API, the real collab service (in process, talking to the API over HTTP) and real Hocuspocus clients. */
describe("COLLAB integration e2e", () => {
  let h: Harness;
  // The tests below use the harness through these names.
  let app: Harness["app"];
  let prisma: Harness["prisma"];
  let tokens: Harness["tokens"];
  let http: Harness["http"];
  let connect: Harness["connect"];
  let world: Harness["world"];
  let row: Harness["row"];
  let synced: Harness["synced"];

  beforeAll(async () => {
    h = await startHarness();
    ({ app, prisma, tokens, http, connect, world, row, synced } = h);
  });

  afterEach(() => h.disconnectAll());

  afterAll(() => h?.stop());

  it("converges two editors writing at the same time and persists the result", async () => {
    const { admin, editor, mkPage } = await world();
    const pageId = await mkPage({ title: "Shared", text: "start" });
    const a = connect(admin.token, pageId);
    const b = connect(editor.token, pageId);
    await synced(a, b);

    const word = `quokka${randomUUID().replace(/-/g, "").replace(/[0-9]/g, "").slice(0, 8)}`;
    appendParagraph(a.ydoc, `from admin ${word}`);
    appendParagraph(b.ydoc, "from editor");
    const title = (a.ydoc.getXmlFragment("title").get(0) as Y.XmlElement).get(
      0,
    ) as Y.XmlText;
    title.insert(title.length, " edited");

    await until(() => {
      const [fa, fb] = [validFields(a.ydoc), validFields(b.ydoc)];
      return (
        !!fa &&
        JSON.stringify(fa) === JSON.stringify(fb) &&
        texts(a.ydoc).length === 3 &&
        fa.title === "Shared edited"
      );
    }, "both documents to converge");
    expect(texts(a.ydoc)).toEqual(
      expect.arrayContaining(["start", `from admin ${word}`, "from editor"]),
    );

    await until(
      async () =>
        (await row(pageId)).title === "Shared edited" &&
        JSON.stringify((await row(pageId)).content).includes("from editor"),
      "the save",
    );
    const saved = await row(pageId);
    expect(JSON.stringify(saved.content)).toContain(`from admin ${word}`);
    expect(saved.searchText).toContain("from editor");
    expect(saved.searchText).toContain(word);
    expect(saved.ydocRevision).toBeGreaterThan(1);
    expect([admin.id, editor.id]).toContain(saved.lastEditedById);
    expect(saved.ydoc).not.toBeNull();

    const found = await http
      .get(`/api/v1/know/search?q=${word}`)
      .set(admin.auth)
      .expect(200);
    expect(found.body.data.map((p: { id: string }) => p.id)).toContain(pageId);
  });

  it("keeps a read-only viewer from changing anything while it still receives the writers' edits", async () => {
    const { admin, viewer, mkPage } = await world();
    const pageId = await mkPage({ text: "original" });
    const writer = connect(admin.token, pageId);
    const reader = connect(viewer.token, pageId);
    await synced(writer, reader);

    appendParagraph(reader.ydoc, "TAMPERED");
    await pause(400);
    expect(texts(writer.ydoc)).toEqual(["original"]);
    expect((await row(pageId)).content).toEqual(
      normalized(doc("original"), "x").body,
    );
    expect((await row(pageId)).ydocRevision).toBe(1);

    appendParagraph(writer.ydoc, "legit");
    await until(
      () => texts(reader.ydoc).includes("legit"),
      "the viewer to receive the edit",
    );
    await until(
      async () => JSON.stringify((await row(pageId)).content).includes("legit"),
      "the save",
    );
    expect(JSON.stringify((await row(pageId)).content)).not.toContain(
      "TAMPERED",
    );
    expect(texts(writer.ydoc)).not.toContain("TAMPERED");
  });

  describe("rejected sessions", () => {
    const expired = (userId: string) =>
      tokens.sign("access", { sub: userId, sid: randomUUID() }, -60);

    const cases: [
      string,
      (
        w: Awaited<ReturnType<typeof world>>,
      ) => Promise<{ token: string; pageId: string }>,
    ][] = [
      [
        "a user without an entry in a restricted space",
        async (w) => ({ token: w.outsider.token, pageId: await w.mkPage() }),
      ],
      [
        "an ADMIN of another organization",
        async (w) => ({
          token: (await createActor(app, "it-other", "ADMIN")).token,
          pageId: await w.mkPage(),
        }),
      ],
      [
        "a draft page for a viewer",
        async (w) => ({
          token: w.viewer.token,
          pageId: await w.mkPage({ status: "DRAFT" }),
        }),
      ],
      [
        "an archived page for a viewer",
        async (w) => ({
          token: w.viewer.token,
          pageId: await w.mkPage({ status: "ARCHIVED" }),
        }),
      ],
      [
        "an organization without the KNOW module",
        async () => {
          const org = await prisma.organization.create({
            data: {
              name: "No KNOW",
              slug: `it-no-know-${randomUUID()}`,
              enabledModules: ["GROW", "CONNECT", "LIFE"],
            },
          });
          const admin = await createActor(app, "it-noknow", "ADMIN", org.id);
          const space = await prisma.space.create({
            data: { name: "S", organizationId: org.id, createdBy: admin.id },
          });
          const page = await prisma.page.create({
            data: {
              spaceId: space.id,
              title: "P",
              authorId: admin.id,
              content: doc("x"),
              searchText: "x",
              publishedAt: new Date(),
            },
          });
          return { token: admin.token, pageId: page.id };
        },
      ],
      [
        "a page that does not exist",
        async (w) => ({ token: w.admin.token, pageId: randomUUID() }),
      ],
      [
        "an expired token",
        async (w) => ({
          token: expired(w.admin.id),
          pageId: await w.mkPage(),
        }),
      ],
      [
        "an invalid token",
        async (w) => ({ token: "not-a-token", pageId: await w.mkPage() }),
      ],
    ];

    it.each(cases)(
      "denies %s with the generic reason",
      async (_name, setup) => {
        const { token, pageId } = await setup(await world());
        const client = connect(token, pageId);
        await until(() => client.events.failed !== undefined, "the rejection");
        expect(client.events.failed).toBe("permission-denied");
        expect(client.events.synced).toBe(false);
        expect(
          await prisma.page.count({
            where: { id: pageId, ydocRevision: { gt: 0 } },
          }),
        ).toBe(0);
      },
    );
  });

  it("opens an existing page with its stored content and seeds it once, even with two visitors at the same time", async () => {
    const { admin, editor, mkPage } = await world();
    const pageId = await mkPage({
      title: "Never opened",
      text: "stored content",
    });
    expect((await row(pageId)).ydoc).toBeNull();

    const a = connect(admin.token, pageId);
    const b = connect(editor.token, pageId);
    await synced(a, b);
    const expected = normalized(doc("stored content"), "Never opened");
    expect(ydocToFields(a.ydoc)).toEqual(expected);
    expect(ydocToFields(b.ydoc)).toEqual(expected);

    await until(async () => (await row(pageId)).ydoc !== null, "the seed");
    await pause(400); // nothing else should be written before an edit
    const seeded = await row(pageId);
    expect(seeded.ydocRevision).toBe(1);
    expect(seeded.content).toEqual(expected.body);
    expect(seeded.title).toBe("Never opened");
  });

  it("never saves a change the schema does not allow, closes its author and restores the others", async () => {
    const { admin, editor, mkPage } = await world();
    const pageId = await mkPage({ text: "good content" });
    const bad = connect(admin.token, pageId);
    const good = connect(editor.token, pageId);
    await synced(bad, good);
    await until(async () => (await row(pageId)).ydocRevision === 1, "the seed");

    bad.ydoc.getXmlFragment("body").push([new Y.XmlElement("unknownNode")]);
    await until(
      () => bad.events.closes.includes("invalid-content"),
      "the author to be disconnected",
    );
    bad.provider.destroy();
    await until(
      () =>
        JSON.stringify(validFields(good.ydoc)?.body) ===
        JSON.stringify(normalized(doc("good content"), "x").body),
      "the other document to go back to valid content",
    );

    await pause(400);
    const saved = await row(pageId);
    expect(saved.content).toEqual(normalized(doc("good content"), "x").body);
    expect(JSON.stringify(saved.content)).not.toContain("unknownNode");
    // The server writes the last good content back over the live document, which saves it again: revision 2 is fine.
    expect(good.events.closes).not.toContain("invalid-content");
  });

  it("repairs a list two editors empty at the same time: both stay connected and a valid content is saved", async () => {
    const { admin, editor, mkPage } = await world();
    const pageId = await mkPage({ title: "Lists", text: "x" });
    const paragraph = (text: string) => ({
      type: "paragraph",
      content: [{ type: "text", text }],
    });
    const body = (...items: string[]) => ({
      type: "doc",
      content: [
        ...(items.length
          ? [
              {
                type: "bulletList",
                content: items.map((t) => ({
                  type: "listItem",
                  content: [paragraph(t)],
                })),
              },
            ]
          : []),
        paragraph("after the list"),
      ],
    });
    await prisma.page.update({
      where: { id: pageId },
      data: { content: body("a", "b", "c", "d") },
    });
    const a = connect(admin.token, pageId);
    const b = connect(editor.token, pageId);
    await synced(a, b);

    // Back to back, before either update reaches the other: each deletes a different half of the list.
    replaceFields(a.ydoc, { body: body("c", "d"), title: "Lists" });
    replaceFields(b.ydoc, { body: body("a", "b"), title: "Lists" });

    const expected = normalized(body(), "Lists");
    await until(
      () =>
        JSON.stringify(validFields(a.ydoc)) === JSON.stringify(expected) &&
        JSON.stringify(validFields(b.ydoc)) === JSON.stringify(expected),
      "both documents to hold the repaired content",
    );
    // jsonb does not keep key order, so wait for the shape and compare deeply below.
    await until(
      async () =>
        !JSON.stringify((await row(pageId)).content).includes("bulletList"),
      "the save",
    );
    await pause(400);
    const saved = await row(pageId);
    expect(saved.content).toEqual(expected.body);
    expect(JSON.stringify(saved.content)).not.toContain("bulletList");
    expect(ydocToFields(decodeState(saved.ydoc!))).toEqual(expected);
    expect(a.events.closes).toEqual([]);
    expect(b.events.closes).toEqual([]);
  });

  it("survives a garbage message: the server stays up and stores nothing", async () => {
    const { admin, editor, mkPage } = await world();
    const pageId = await mkPage({ text: "untouched" });
    const noisy = connect(admin.token, pageId);
    await synced(noisy);

    noisy.socket.webSocket!.send(new Uint8Array([255, 255, 255]));
    await pause(400);

    const calm = connect(editor.token, pageId);
    await synced(calm);
    expect(texts(calm.ydoc)).toEqual(["untouched"]);
    appendParagraph(calm.ydoc, "still works");
    await until(
      async () =>
        JSON.stringify((await row(pageId)).content).includes("still works"),
      "the save after the garbage",
    );
    expect(JSON.stringify((await row(pageId)).content)).toContain("untouched");
  });
});
