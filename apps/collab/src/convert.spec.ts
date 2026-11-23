import { getSchema } from "@tiptap/core"
import { Node as ProseMirrorNode } from "@tiptap/pm/model"
import { schemaExtensions } from "@cluster/editor-schema"
import { assertValidDoc } from "@cluster/editor-schema"
import * as Y from "yjs"
import {
  InvalidContentError,
  decodeState,
  encodeState,
  fieldsToYdoc,
  repairBody,
  replaceFields,
  ydocToFields,
  ydocToRepairedFields,
} from "./convert"
import type { CollabFields } from "./types"

const ORG = "6a1f0c2e-3b4d-4e5f-8a6b-7c8d9e0f1a2b"
const PAGE = "0b6f7a3e-1c2d-4e5f-8a9b-0c1d2e3f4a5b"
const IMAGE = "9d8c7b6a-5f4e-4d3c-8b2a-1f0e9d8c7b6a"
const UUID = "1e2d3c4b-5a69-4788-9900-aabbccddeeff"
const schema = getSchema(schemaExtensions)

const paragraph = (text: string) => ({
  type: "paragraph",
  content: [{ type: "text", text }],
})

/** One of every node and mark the shared schema allows. */
const BODY: Record<string, unknown> = {
  type: "doc",
  content: [
    {
      type: "heading",
      attrs: { level: 2 },
      content: [{ type: "text", text: "Heading" }],
    },
    {
      type: "paragraph",
      content: [
        { type: "text", text: "plain " },
        { type: "text", text: "bold", marks: [{ type: "bold" }] },
        { type: "text", text: " italic", marks: [{ type: "italic" }] },
        { type: "text", text: " under", marks: [{ type: "underline" }] },
        { type: "text", text: " strike", marks: [{ type: "strike" }] },
        { type: "text", text: " code", marks: [{ type: "code" }] },
        {
          type: "text",
          text: " link",
          marks: [{ type: "link", attrs: { href: "https://example.com" } }],
        },
        { type: "hardBreak" },
        { type: "text", text: "after break" },
      ],
    },
    {
      type: "bulletList",
      content: [{ type: "listItem", content: [paragraph("bullet")] }],
    },
    {
      type: "orderedList",
      attrs: { start: 1 },
      content: [{ type: "listItem", content: [paragraph("first")] }],
    },
    {
      type: "taskList",
      content: [
        {
          type: "taskItem",
          attrs: { checked: true },
          content: [paragraph("done")],
        },
        {
          type: "taskItem",
          attrs: { checked: false },
          content: [paragraph("todo")],
        },
      ],
    },
    { type: "blockquote", content: [paragraph("quoted")] },
    {
      type: "codeBlock",
      attrs: { language: "ts" },
      content: [{ type: "text", text: "const a = 1" }],
    },
    {
      type: "image",
      attrs: {
        src: `organizations/${ORG}/pages/${PAGE}/images/${IMAGE}.png`,
        alt: "logo",
      },
    },
    {
      type: "fileCard",
      attrs: {
        documentId: UUID,
        versionId: UUID,
        name: "report.pdf",
        mimetype: "application/pdf",
        size: 1024,
        versionNumber: 1,
      },
    },
    {
      type: "paragraph",
      content: [
        { type: "text", text: "see " },
        {
          type: "pageMention",
          attrs: {
            id: UUID,
            label: "Other page",
            spaceId: UUID,
            spaceName: "Space",
          },
        },
      ],
    },
  ],
}

const FIELDS: CollabFields = { body: BODY, title: "Quarterly plan" }

/** The body as ProseMirror stores it, with attribute defaults filled in. */
function normalizedBody(body: Record<string, unknown>) {
  return ProseMirrorNode.fromJSON(schema, body).toJSON()
}

const assertValid = (body: unknown) => assertValidDoc(body)

function bodyOf(doc: Y.Doc) {
  return doc.getXmlFragment("body")
}

describe("fieldsToYdoc and ydocToFields", () => {
  it("round trips every node and mark of the shared schema", () => {
    const back = ydocToFields(fieldsToYdoc(FIELDS))
    expect(back.body).toEqual(normalizedBody(BODY))
    expect(back.title).toBe("Quarterly plan")
  })

  it.each([
    ["empty", ""],
    ["accents and emoji", "Canción 🎉 café"],
  ])("round trips a %s title", (_label, title) => {
    const fields = { body: BODY, title }
    expect(ydocToFields(fieldsToYdoc(fields)).title).toBe(title)
  })

  it("round trips an empty title as an empty paragraph", () => {
    const doc = fieldsToYdoc({ body: BODY, title: "" })
    expect(doc.getXmlFragment("title").length).toBe(1)
    expect(ydocToFields(doc).title).toBe("")
  })

  it("round trips the state bytes", () => {
    const bytes = encodeState(fieldsToYdoc(FIELDS))
    expect(bytes).toBeInstanceOf(Uint8Array)
    const back = ydocToFields(decodeState(bytes))
    expect(back.body).toEqual(normalizedBody(BODY))
    expect(back.title).toBe("Quarterly plan")
  })

  it("rejects an unknown node type with InvalidContentError", () => {
    const body = { type: "doc", content: [{ type: "video", attrs: {} }] }
    expect(() => fieldsToYdoc({ body, title: "" })).toThrow(InvalidContentError)
  })

  it("rejects a javascript: link with InvalidContentError", () => {
    const body = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "x",
              marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }],
            },
          ],
        },
      ],
    }
    expect(() => fieldsToYdoc({ body, title: "" })).toThrow(InvalidContentError)
  })

  it("rejects a title longer than 200 characters", () => {
    expect(() => fieldsToYdoc({ body: BODY, title: "t".repeat(201) })).toThrow(
      InvalidContentError
    )
    expect(
      ydocToFields(fieldsToYdoc({ body: BODY, title: "t".repeat(200) })).title
    ).toHaveLength(200)
  })

  it("does not mutate the live document when converting it", () => {
    const doc = fieldsToYdoc(FIELDS)
    bodyOf(doc).push([new Y.XmlElement("unknownNode")])

    expect(() => ydocToFields(doc)).toThrow(InvalidContentError)

    // Real behaviour: the unknown element makes the body invalid, so the conversion throws.
    // The copy is converted, so the element is still in the live fragment.
    const names = bodyOf(doc)
      .toArray()
      .map((el) => (el as Y.XmlElement).nodeName)
    expect(names).toContain("unknownNode")
    expect(names.length).toBe(normalizedBody(BODY).content.length + 1)
  })

  it("documents that independently seeded documents duplicate content when merged", () => {
    const seeded = fieldsToYdoc(FIELDS)
    const other = fieldsToYdoc(FIELDS)
    const before = bodyOf(seeded).length

    Y.applyUpdate(seeded, Y.encodeStateAsUpdate(other))

    // Two clientIDs insert the same content, so both copies survive the merge.
    expect(bodyOf(seeded).length).toBe(before * 2)
  })
})

describe("replaceFields", () => {
  const NEW_BODY = { type: "doc", content: [paragraph("replaced")] }

  it("makes the live document hold the given fields", () => {
    const doc = fieldsToYdoc(FIELDS)
    replaceFields(doc, { body: NEW_BODY, title: "New title" })
    expect(ydocToFields(doc)).toEqual({
      body: normalizedBody(NEW_BODY),
      title: "New title",
    })
  })

  it("removes content a bad client wrote that the schema does not know", () => {
    const doc = fieldsToYdoc(FIELDS)
    bodyOf(doc).push([new Y.XmlElement("unknownNode")])
    expect(() => ydocToFields(doc)).toThrow(InvalidContentError)

    replaceFields(doc, FIELDS)

    expect(ydocToFields(doc)).toEqual(ydocToFields(fieldsToYdoc(FIELDS)))
  })

  it("writes everything in one transaction, so observers get a single update", () => {
    const doc = fieldsToYdoc(FIELDS)
    const updates: Uint8Array[] = []
    doc.on("update", (update: Uint8Array) => updates.push(update))
    replaceFields(doc, { body: NEW_BODY, title: "Other" })
    expect(updates).toHaveLength(1)
  })

  it("reaches the other copies of the document", () => {
    const here = fieldsToYdoc(FIELDS)
    const there = decodeState(encodeState(here))
    here.on("update", (update: Uint8Array) => Y.applyUpdate(there, update))
    replaceFields(here, { body: NEW_BODY, title: "Shared" })
    expect(ydocToFields(there).title).toBe("Shared")
    expect(ydocToFields(there).body).toEqual(normalizedBody(NEW_BODY))
  })

  it("rejects invalid fields and leaves the document untouched", () => {
    const doc = fieldsToYdoc(FIELDS)
    const before = ydocToFields(doc)
    expect(() =>
      replaceFields(doc, {
        body: { type: "doc", content: [{ type: "scriptNode" }] },
        title: "x",
      })
    ).toThrow(InvalidContentError)
    expect(() => replaceFields(doc, { body: NEW_BODY, title: "a\nb" })).toThrow(
      InvalidContentError
    )
    expect(ydocToFields(doc)).toEqual(before)
  })
})

describe("repairBody and ydocToRepairedFields", () => {
  const doc = (...content: unknown[]) => ({ type: "doc", content })
  const item = (type: string, ...content: unknown[]) => ({ type, content })
  const taskItem = (...content: unknown[]) => ({
    type: "taskItem",
    attrs: { checked: false },
    content,
  })
  const emptyList = (type: string) => ({ type })

  it("drops a list or blockquote left without children and keeps the rest", () => {
    const keep = [paragraph("before"), paragraph("after")]
    for (const empty of [
      emptyList("bulletList"),
      { type: "orderedList", attrs: { start: 1 } },
      emptyList("taskList"),
      emptyList("blockquote"),
    ])
      expect(repairBody(doc(keep[0], empty, keep[1]))).toEqual(
        doc(keep[0], keep[1])
      )
  })

  it("drops what a removed child leaves empty, up to the item and its list", () => {
    const body = doc(
      paragraph("a"),
      {
        type: "bulletList",
        content: [item("listItem", emptyList("bulletList"))],
      },
      paragraph("b")
    )
    expect(repairBody(body)).toEqual(doc(paragraph("a"), paragraph("b")))
  })

  it("keeps an item whose nested list became empty when the item has other content", () => {
    const body = doc({
      type: "bulletList",
      content: [item("listItem", paragraph("x"), emptyList("orderedList"))],
    })
    const repaired = repairBody(body)
    expect(repaired).toEqual(
      doc({ type: "bulletList", content: [item("listItem", paragraph("x"))] })
    )
    expect(() => assertValid(repaired)).not.toThrow()
  })

  it("adds the leading paragraph to a list item that only has a nested list", () => {
    const nested = {
      type: "bulletList",
      content: [item("listItem", paragraph("inner"))],
    }
    const repaired = repairBody(
      doc({ type: "bulletList", content: [item("listItem", nested)] })
    )
    expect(repaired).toEqual(
      doc({
        type: "bulletList",
        content: [item("listItem", { type: "paragraph" }, nested)],
      })
    )
    expect(() => assertValid(repaired)).not.toThrow()
  })

  it("drops a task item that lost its paragraphs, and with them an emptied task list", () => {
    // taskItem is `paragraph+` in this schema: it cannot hold a nested list, so there is nothing to fill.
    expect(
      repairBody(
        doc(paragraph("a"), {
          type: "taskList",
          content: [taskItem(), taskItem(paragraph("kept"))],
        })
      )
    ).toEqual(
      doc(paragraph("a"), {
        type: "taskList",
        content: [taskItem(paragraph("kept"))],
      })
    )
    expect(
      repairBody(
        doc(paragraph("a"), { type: "taskList", content: [taskItem()] })
      )
    ).toEqual(doc(paragraph("a")))
  })

  it("leaves a task item with a nested list as it is, so validation still rejects it", () => {
    const nested = {
      type: "bulletList",
      content: [item("listItem", paragraph("inner"))],
    }
    const body = doc({ type: "taskList", content: [taskItem(nested)] })
    expect(repairBody(body)).toEqual(body)
    expect(() => assertValid(repairBody(body))).toThrow()
  })

  it("gives an empty doc its paragraph", () => {
    expect(repairBody({ type: "doc" })).toEqual(doc({ type: "paragraph" }))
    expect(repairBody(doc(emptyList("bulletList")))).toEqual(
      doc({ type: "paragraph" })
    )
  })

  it("returns a valid document unchanged, and reports nothing repaired", () => {
    expect(repairBody(BODY)).toEqual(BODY)
    const live = fieldsToYdoc(FIELDS)
    const { fields, repaired } = ydocToRepairedFields(live)
    expect(repaired).toBe(false)
    expect(fields).toEqual(ydocToFields(live))
  })

  it("repairs the body of a live document without touching the live document", () => {
    const live = fieldsToYdoc(FIELDS)
    bodyOf(live).push([new Y.XmlElement("bulletList")])
    expect(() => ydocToFields(live)).toThrow(InvalidContentError)

    const { fields, repaired } = ydocToRepairedFields(live)

    expect(repaired).toBe(true)
    expect(fields).toEqual(ydocToFields(fieldsToYdoc(FIELDS)))
    expect(() => ydocToFields(live)).toThrow(InvalidContentError)
    replaceFields(live, fields)
    expect(ydocToFields(live)).toEqual(fields)
    expect(ydocToRepairedFields(live).repaired).toBe(false)
  })

  it.each([
    ["an unknown node", () => new Y.XmlElement("unknownNode")],
    [
      "an unknown node inside a list",
      () => {
        const list = new Y.XmlElement("bulletList")
        list.insert(0, [new Y.XmlElement("unknownNode")])
        return list
      },
    ],
    [
      "an unknown attribute",
      () => {
        const p = new Y.XmlElement("paragraph")
        p.setAttribute("onclick", "alert(1)")
        return p
      },
    ],
    [
      "a bad image key",
      () => {
        const image = new Y.XmlElement("image")
        image.setAttribute("src", "organizations/../../etc/passwd")
        return image
      },
    ],
    [
      "a javascript: link",
      () => {
        const p = new Y.XmlElement("paragraph")
        const run = new Y.XmlText()
        run.insert(0, "x", { link: { href: "javascript:alert(1)" } })
        p.insert(0, [run])
        return p
      },
    ],
  ])("does not repair %s", (_label, makeNode) => {
    const live = fieldsToYdoc(FIELDS)
    bodyOf(live).push([makeNode()])
    expect(() => ydocToRepairedFields(live)).toThrow(InvalidContentError)
  })

  it("still validates the title", () => {
    const live = fieldsToYdoc(FIELDS)
    live.getXmlFragment("title").push([new Y.XmlElement("unknownNode")])
    expect(() => ydocToRepairedFields(live)).toThrow(InvalidContentError)
  })
})
