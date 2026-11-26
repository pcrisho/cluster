import { BadRequestException } from "@nestjs/common";
import {
  assertIconFields,
  assertPageContent,
} from "./know-validation";

describe("assertPageContent", () => {
  it("accepts a document the shared editor schema accepts", () => {
    expect(() =>
      assertPageContent(
        {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "hi" }],
            },
          ],
        },
        "org-1",
      ),
    ).not.toThrow();
  });

  it("turns an invalid document into a 400 with the schema's English message", () => {
    const bad = { type: "doc", content: [{ type: "evil" }] };
    expect(() => assertPageContent(bad, "org-1")).toThrow(BadRequestException);
    expect(() => assertPageContent(bad, "org-1")).toThrow(
      'Invalid document at content[0]: unknown node type "evil"',
    );
  });

  it("rejects an image key of another organization", () => {
    const foreign = {
      type: "doc",
      content: [
        { type: "image", attrs: { src: "organizations/org-2/uploads/a.png" } },
      ],
    };
    expect(() => assertPageContent(foreign, "org-1")).toThrow(
      "Invalid document at content[0].attrs.src",
    );
  });
});

describe("know-validation", () => {
  it("requires an icon for LUCIDE and an emoji for EMOJI", () => {
    expect(() => assertIconFields("LUCIDE", " ", null)).toThrow(
      BadRequestException,
    );
    expect(() => assertIconFields("EMOJI", "book", null)).toThrow(
      BadRequestException,
    );
    expect(() => assertIconFields("LUCIDE", "book", null)).not.toThrow();
    expect(() => assertIconFields("EMOJI", null, "📚")).not.toThrow();
  });
});
