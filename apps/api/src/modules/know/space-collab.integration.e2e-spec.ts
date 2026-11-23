import * as Y from "yjs";
import {
  appendParagraph,
  doc,
  Harness,
  pause,
  startHarness,
  texts,
  until,
  validFields,
} from "../collab/collab-integration-harness";

/** The space description edited live: the real API, the real collab service and real Hocuspocus clients. */
describe("KNOW space description integration e2e", () => {
  let h: Harness;

  beforeAll(async () => {
    h = await startHarness();
  });

  afterEach(() => h.disconnectAll());

  afterAll(() => h?.stop());

  const space = (id: string) =>
    h.prisma.space.findUniqueOrThrow({ where: { id }, omit: { ydoc: false } });
  /** ADMIN, a space MANAGER (the world's editor, promoted) and a VIEWER, on a space whose description says "start". */
  const setup = async () => {
    const w = await h.world();
    await h.prisma.spaceAccess.update({
      where: { id: w.entries[w.editor.id] },
      data: { role: "MANAGER" },
    });
    await h.prisma.space.update({
      where: { id: w.space.id },
      data: { descriptionContent: doc("start") },
    });
    return { ...w, manager: w.editor };
  };

  it("converges two managers writing at the same time, saves the description and keeps the name", async () => {
    const { admin, manager, space: s } = await setup();
    const a = h.connect(admin.token, s.id, "know.space");
    const b = h.connect(manager.token, s.id, "know.space");
    await h.synced(a, b);

    appendParagraph(a.ydoc, "from admin");
    appendParagraph(b.ydoc, "from manager");
    const title = (a.ydoc.getXmlFragment("title").get(0) as Y.XmlElement).get(
      0,
    ) as Y.XmlText;
    title.insert(title.length, " renamed live");

    await until(() => {
      const [fa, fb] = [validFields(a.ydoc), validFields(b.ydoc)];
      return (
        !!fa &&
        JSON.stringify(fa) === JSON.stringify(fb) &&
        texts(a.ydoc).length === 3
      );
    }, "both documents to converge");
    expect(texts(a.ydoc)).toEqual(
      expect.arrayContaining(["start", "from admin", "from manager"]),
    );

    await until(async () => {
      const saved = JSON.stringify((await space(s.id)).descriptionContent);
      return saved.includes("from admin") && saved.includes("from manager");
    }, "the save");
    const saved = await space(s.id);
    expect(saved.ydoc).not.toBeNull();
    expect(saved.ydocRevision).toBeGreaterThan(1);
    expect(saved.name).toBe("Integration"); // the title of the live document is not the name
  });

  it("lets a viewer receive the edits but not change anything", async () => {
    const { admin, viewer, space: s } = await setup();
    const writer = h.connect(admin.token, s.id, "know.space");
    const reader = h.connect(viewer.token, s.id, "know.space");
    await h.synced(writer, reader);

    appendParagraph(reader.ydoc, "TAMPERED");
    await pause(400);
    expect(texts(writer.ydoc)).toEqual(["start"]);

    appendParagraph(writer.ydoc, "legit");
    await until(
      () => texts(reader.ydoc).includes("legit"),
      "the viewer to receive the edit",
    );
    await until(
      async () =>
        JSON.stringify((await space(s.id)).descriptionContent).includes(
          "legit",
        ),
      "the save",
    );
    expect(
      JSON.stringify((await space(s.id)).descriptionContent),
    ).not.toContain("TAMPERED");
  });

  it("closes the live description when the space is deleted", async () => {
    const { admin, manager, space: s } = await setup();
    const a = h.connect(admin.token, s.id, "know.space");
    const b = h.connect(manager.token, s.id, "know.space");
    await h.synced(a, b);
    await until(async () => (await space(s.id)).ydocRevision > 0, "the seed");

    await h.http
      .delete(`/api/v1/know/spaces/${s.id}`)
      .set(admin.auth)
      .expect(200);
    await until(
      () => [a, b].every((c) => c.events.closes.includes("document-deleted")),
      "both sessions to close",
    );
    expect(await h.prisma.space.count({ where: { id: s.id } })).toBe(0);
  });
});
