// Project nodes: image (uploaded or external), file card and page mention.
export const customNodesDoc = {
  type: "doc",
  content: [
    {
      type: "image",
      attrs: {
        src: "https://cdn.example.com/office.png",
        alt: "Office",
        title: null,
      },
    },
    {
      type: "image",
      attrs: {
        src: "organizations/org_1/images/2026/map.webp",
        alt: "map.webp",
        title: "Floor map",
      },
    },
    {
      type: "fileCard",
      attrs: {
        documentId: "8f2b1c4e-5d3a-4b7c-9e10-2a6f7d8c9b01",
        versionId: "3c9d0e5a-1b2f-4a8d-8c7e-6f5a4b3c2d10",
        name: "Expenses.pdf",
        mimetype: "application/pdf",
        size: 20480,
        versionNumber: 2,
      },
    },
    {
      type: "paragraph",
      content: [
        { type: "text", text: "See " },
        {
          type: "pageMention",
          attrs: {
            id: "a1b2c3d4-0001-4000-8000-000000000009",
            label: "Travel policy",
            spaceId: "a1b2c3d4-0003-4000-8000-000000000003",
            spaceName: "HR",
            archived: false,
            mentionSuggestionChar: "@",
          },
        },
        { type: "text", text: " for details." },
      ],
    },
    {
      type: "paragraph",
      content: [
        {
          type: "pageMention",
          attrs: {
            id: "a1b2c3d4-0002-4000-8000-000000000010",
            label: "Old checklist",
            spaceId: "a1b2c3d4-0003-4000-8000-000000000003",
            spaceName: "HR",
            archived: true,
            mentionSuggestionChar: "@",
          },
        },
      ],
    },
  ],
}
