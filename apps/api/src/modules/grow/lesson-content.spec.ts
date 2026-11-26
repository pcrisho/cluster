import {
  courseFilePrefix,
  parseLessonContent,
  videoKeyOf,
} from "./lesson-content";

const scope = { orgId: "org1", courseId: "c1" };
const prefix = courseFilePrefix("org1", "c1");
const doc = (src?: string) => ({
  type: "doc",
  content: src
    ? [{ type: "image", attrs: { src } }]
    : [{ type: "paragraph", content: [{ type: "text", text: "Hi" }] }],
});

describe("parseLessonContent", () => {
  it("accepts text, link and files, dropping unknown fields", () => {
    expect(
      parseLessonContent({ kind: "text", doc: doc(), extra: 1 }, scope),
    ).toEqual({ kind: "text", doc: doc() });
    expect(
      parseLessonContent(
        { kind: "link", url: "https://youtu.be/dQw4w9WgXcQ" },
        scope,
      ),
    ).toEqual({
      kind: "link",
      url: "https://youtu.be/dQw4w9WgXcQ",
    });
    const files = [
      { key: `${prefix}a1b2.pdf`, name: " Guide.pdf ", size: 1200, junk: true },
    ];
    expect(parseLessonContent({ kind: "files", files }, scope)).toEqual({
      kind: "files",
      files: [{ key: `${prefix}a1b2.pdf`, name: "Guide.pdf", size: 1200 }],
    });
  });

  it("rejects images of another organization and invalid documents", () => {
    expect(() =>
      parseLessonContent(
        { kind: "text", doc: doc("organizations/org2/uploads/x.png") },
        scope,
      ),
    ).toThrow();
    expect(() =>
      parseLessonContent({ kind: "text", doc: { type: "script" } }, scope),
    ).toThrow();
  });

  it("rejects links outside the allow-list", () => {
    for (const url of [
      "https://evil.com/v",
      "javascript:alert(1)",
      "data:text/html,x",
      42,
      "https://x.co/" + "a".repeat(2000),
    ]) {
      expect(() => parseLessonContent({ kind: "link", url }, scope)).toThrow();
    }
  });

  it("rejects files of another course or organization, duplicates, path tricks and too many files", () => {
    const file = (key: string) => ({ key, name: "f.pdf", size: 1 });
    for (const key of [
      "organizations/org1/grow/c2/a.pdf",
      "organizations/org2/grow/c1/a.pdf",
      `${prefix}../c2/a.pdf`,
      `${prefix}sub/a.pdf`,
    ]) {
      expect(() =>
        parseLessonContent({ kind: "files", files: [file(key)] }, scope),
      ).toThrow();
    }
    expect(() =>
      parseLessonContent(
        {
          kind: "files",
          files: [file(`${prefix}a.pdf`), file(`${prefix}a.pdf`)],
        },
        scope,
      ),
    ).toThrow();
    const many = Array.from({ length: 21 }, (_, i) =>
      file(`${prefix}f${i}.pdf`),
    );
    expect(() =>
      parseLessonContent({ kind: "files", files: many }, scope),
    ).toThrow();
    expect(() =>
      parseLessonContent(
        {
          kind: "files",
          files: [{ key: `${prefix}a.pdf`, name: "", size: 1 }],
        },
        scope,
      ),
    ).toThrow();
  });

  it("keeps a lesson's own video, never another file", () => {
    const video = { key: `${prefix}v.mp4`, name: "Intro.mp4", size: 10 };
    const current = { kind: "video", video };
    expect(
      parseLessonContent(
        { kind: "video", video: { key: video.key, name: "renamed" } },
        { ...scope, current },
      ),
    ).toEqual(current);
    expect(() =>
      parseLessonContent(
        { kind: "video", video: { ...video, key: `${prefix}other.mp4` } },
        { ...scope, current },
      ),
    ).toThrow();
    // Not uploaded yet: there is nothing to keep.
    expect(() => parseLessonContent({ kind: "video", video }, scope)).toThrow();
    expect(() =>
      parseLessonContent(
        { kind: "video", video: { key: null } },
        { ...scope, current: { kind: "text", doc: doc() } },
      ),
    ).toThrow();
  });

  it("finds the video key of stored content", () => {
    expect(
      videoKeyOf({ kind: "video", video: { key: "k", name: "n", size: 1 } }),
    ).toBe("k");
    expect(videoKeyOf({ kind: "files", files: [] })).toBeNull();
    expect(videoKeyOf(null)).toBeNull();
  });

  it("rejects unknown kinds", () => {
    expect(() =>
      parseLessonContent({ kind: "audio", fileKey: `${prefix}v.mp3` }, scope),
    ).toThrow();
    expect(() => parseLessonContent(null, scope)).toThrow();
  });
});
