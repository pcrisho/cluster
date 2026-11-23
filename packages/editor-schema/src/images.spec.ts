import { collectImageKeys } from "./images";

const image = (src: string) => ({ type: "image", attrs: { src } });

describe("collectImageKeys", () => {
  it("finds storage keys at any depth, once each", () => {
    const doc = {
      type: "doc",
      content: [
        image("organizations/o/pages/p/images/a.png"),
        {
          type: "blockquote",
          content: [
            image("organizations/o/pages/p/images/b.png"),
            image("organizations/o/pages/p/images/a.png"),
          ],
        },
      ],
    };
    expect([...collectImageKeys(doc)].sort()).toEqual([
      "organizations/o/pages/p/images/a.png",
      "organizations/o/pages/p/images/b.png",
    ]);
  });

  it("ignores https images and anything that is not a document", () => {
    expect(
      collectImageKeys({
        type: "doc",
        content: [image("https://x.test/a.png")],
      }).size,
    ).toBe(0);
    expect(collectImageKeys(null).size).toBe(0);
    expect(collectImageKeys("text").size).toBe(0);
  });
});
