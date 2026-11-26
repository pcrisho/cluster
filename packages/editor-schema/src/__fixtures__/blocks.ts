// Quotes, code, rules and line breaks, as TipTap 2 serializes them.
export const blocksDoc = {
  type: "doc",
  content: [
    {
      type: "blockquote",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Ship it small, ship it often." }],
        },
      ],
    },
    {
      type: "codeBlock",
      attrs: { language: "typescript" },
      content: [{ type: "text", text: "const total = items.length" }],
    },
    {
      type: "codeBlock",
      attrs: { language: null },
      content: [{ type: "text", text: "plain text" }],
    },
    { type: "horizontalRule" },
    {
      type: "paragraph",
      content: [
        { type: "text", text: "Above the rule" },
        { type: "hardBreak" },
        { type: "text", text: "and below it" },
      ],
    },
  ],
}
