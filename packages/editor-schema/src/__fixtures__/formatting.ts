// Shaped like `editor.getJSON()` from TipTap 2.27 (StarterKit + Link + Underline).
export const formattingDoc = {
  type: "doc",
  content: [
    {
      type: "heading",
      attrs: { level: 1 },
      content: [{ type: "text", text: "Onboarding guide" }],
    },
    {
      type: "heading",
      attrs: { level: 2 },
      content: [{ type: "text", text: "Week one" }],
    },
    {
      type: "heading",
      attrs: { level: 3 },
      content: [{ type: "text", text: "Accounts" }],
    },
    {
      type: "paragraph",
      content: [
        { type: "text", text: "Bold", marks: [{ type: "bold" }] },
        { type: "text", text: " " },
        { type: "text", text: "italic", marks: [{ type: "italic" }] },
        { type: "text", text: " " },
        { type: "text", text: "underline", marks: [{ type: "underline" }] },
        { type: "text", text: " " },
        { type: "text", text: "struck", marks: [{ type: "strike" }] },
        { type: "text", text: " " },
        { type: "text", text: "code()", marks: [{ type: "code" }] },
        { type: "text", text: " " },
        {
          type: "text",
          text: "the handbook",
          marks: [
            {
              type: "link",
              attrs: {
                href: "https://example.com/handbook",
                target: "_blank",
                rel: "noopener noreferrer nofollow",
                class: null,
              },
            },
          ],
        },
        { type: "text", text: " or write to " },
        {
          type: "text",
          text: "hr@example.com",
          marks: [
            {
              type: "link",
              attrs: {
                href: "mailto:hr@example.com",
                target: "_blank",
                rel: "noopener noreferrer nofollow",
                class: null,
              },
            },
          ],
        },
      ],
    },
    {
      type: "paragraph",
      content: [
        { type: "text", text: "First line" },
        { type: "hardBreak" },
        { type: "text", text: "Second line" },
      ],
    },
    { type: "paragraph" },
  ],
}
