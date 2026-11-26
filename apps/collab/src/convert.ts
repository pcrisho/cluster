import { isDeepStrictEqual } from "node:util"
import { getSchema } from "@tiptap/core"
import {
  Fragment,
  Node as ProseMirrorNode,
  type Schema,
} from "@tiptap/pm/model"
import {
  assertValidDoc,
  schemaExtensions,
  titleExtensions,
} from "@cluster/editor-schema"
import {
  prosemirrorJSONToYXmlFragment,
  yXmlFragmentToProsemirrorJSON,
} from "@tiptap/y-tiptap"
import * as Y from "yjs"
import type { CollabFields } from "./types"

// Must match the page title limit of the API (MaxLength(200) in create-page.dto.ts and update-page.dto.ts).
const MAX_TITLE_LENGTH = 200

const bodySchema: Schema = getSchema(schemaExtensions)
const titleSchema: Schema = getSchema(titleExtensions)

export class InvalidContentError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "InvalidContentError"
  }
}

/**
 * Builds a fresh Y.Doc with the "body" and "title" fragments. Persist its state
 * once: independently built copies duplicate their content when merged.
 */
export function fieldsToYdoc(fields: CollabFields): Y.Doc {
  const titleJson = prepare(fields)
  const doc = new Y.Doc()
  writeFragments(doc, fields.body, titleJson)
  return doc
}

/**
 * Makes a live document hold exactly these fields, in one transaction. y-prosemirror writes only
 * the difference, and drops anything the schema does not know. Used to go back to the last good
 * content and to restore a version. Nothing is written if the fields are not valid.
 */
export function replaceFields(doc: Y.Doc, fields: CollabFields): void {
  const titleJson = prepare(fields)
  doc.transact(() => writeFragments(doc, fields.body, titleJson))
}

/**
 * Makes the live body hold exactly this content (a restored version), leaving the title alone.
 * Nothing is written if the body is not valid.
 */
export function replaceBody(doc: Y.Doc, body: unknown): void {
  try {
    assertValidDoc(body)
  } catch (error) {
    throw toContentError(error)
  }
  doc.transact(() =>
    prosemirrorJSONToYXmlFragment(bodySchema, body, doc.getXmlFragment("body"))
  )
}

/** Validates the fields and returns the one-paragraph document of the title. */
function prepare(fields: CollabFields): Record<string, unknown> {
  checkTitle(fields.title)
  try {
    assertValidDoc(fields.body)
  } catch (error) {
    throw toContentError(error)
  }
  const titleJson = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: fields.title
          ? [{ type: "text", text: fields.title }]
          : undefined,
      },
    ],
  }
  checkTitleDoc(titleJson)
  return titleJson
}

function writeFragments(
  doc: Y.Doc,
  body: unknown,
  titleJson: Record<string, unknown>
): void {
  prosemirrorJSONToYXmlFragment(bodySchema, body, doc.getXmlFragment("body"))
  prosemirrorJSONToYXmlFragment(
    titleSchema,
    titleJson,
    doc.getXmlFragment("title")
  )
}

/**
 * Reads the fields from a copy of the document, so the live document is never
 * touched by a conversion.
 */
export function ydocToFields(doc: Y.Doc): CollabFields {
  return readFields(doc, false).fields
}

/**
 * Like ydocToFields, but first repairs the structure that concurrent edits leave behind (see
 * repairBody). `repaired` tells the caller the live document differs from the returned fields.
 */
export function ydocToRepairedFields(doc: Y.Doc): {
  fields: CollabFields
  repaired: boolean
} {
  return readFields(doc, true)
}

function readFields(doc: Y.Doc, repair: boolean) {
  const copy = new Y.Doc()
  Y.applyUpdate(copy, Y.encodeStateAsUpdate(doc))
  try {
    const rawJson = yXmlFragmentToProsemirrorJSON(copy.getXmlFragment("body"))
    const bodyJson = repair ? repairBody(rawJson) : rawJson
    assertValidDoc(bodyJson)
    const body = ProseMirrorNode.fromJSON(bodySchema, bodyJson).toJSON()

    const titleJson = yXmlFragmentToProsemirrorJSON(
      copy.getXmlFragment("title")
    )
    checkTitleDoc(titleJson)
    const title = ProseMirrorNode.fromJSON(titleSchema, titleJson).textContent
    checkTitle(title)

    return {
      fields: { body, title } as CollabFields,
      repaired: !isDeepStrictEqual(rawJson, bodyJson),
    }
  } catch (error) {
    throw toContentError(error)
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

/**
 * Fixes the content-rule problems concurrent editing produces (two people deleting different items
 * of one list leave it empty), bottom-up: a container left without children is dropped, one that
 * lost a required child gets it back through createAndFill, and an empty doc gets its paragraph.
 * Anything else (unknown nodes, attributes, links, images) is left for assertValidDoc to reject.
 */
export function repairBody(body: unknown): unknown {
  return isRecord(body) && body.type === "doc" ? repairNode(body) : body
}

function repairNode(node: unknown): unknown {
  if (!isRecord(node) || typeof node.type !== "string") return node
  const type = Object.hasOwn(bodySchema.nodes, node.type)
    ? bodySchema.nodes[node.type]
    : undefined
  if (!type || type.isLeaf || type.isText) return node
  if (node.content !== undefined && !Array.isArray(node.content)) return node

  const children = ((node.content ?? []) as unknown[])
    .map(repairNode)
    .filter((child) => child !== null)
  const withChildren = (list: unknown[]) =>
    node.content === undefined && !list.length
      ? node
      : { ...node, content: list }

  let fragment: Fragment
  try {
    fragment = Fragment.fromJSON(bodySchema, children)
  } catch {
    return withChildren(children) // not a structure problem: validation will say what it is
  }
  if (type.validContent(fragment)) return withChildren(children)
  if (!children.length && type.name !== "doc") return null

  const filled = type.createAndFill(undefined, fragment)
  if (!filled) return withChildren(children)
  // Children that were already there keep their JSON as written; only the added ones are new.
  const before: ProseMirrorNode[] = []
  fragment.forEach((child) => before.push(child))
  const after: unknown[] = []
  filled.content.forEach((child) => {
    const index = before.indexOf(child)
    after.push(index >= 0 ? children[index] : child.toJSON())
  })
  return withChildren(after)
}

export function encodeState(doc: Y.Doc): Uint8Array {
  return Y.encodeStateAsUpdate(doc)
}

export function decodeState(bytes: Uint8Array): Y.Doc {
  const doc = new Y.Doc()
  Y.applyUpdate(doc, bytes)
  return doc
}

function checkTitle(title: string): void {
  // Same rule as the API: one line, at most 200 characters.
  if (
    typeof title !== "string" ||
    title.length > MAX_TITLE_LENGTH ||
    /[\r\n]/.test(title)
  ) {
    throw new InvalidContentError(
      `title must be one line of at most ${MAX_TITLE_LENGTH} characters`
    )
  }
}

/** Title is one paragraph with plain text, no marks. */
function checkTitleDoc(json: unknown): void {
  try {
    ProseMirrorNode.fromJSON(titleSchema, json).check()
  } catch (error) {
    throw toContentError(error)
  }
}

function toContentError(error: unknown): InvalidContentError {
  if (error instanceof InvalidContentError) return error
  return new InvalidContentError(
    error instanceof Error ? error.message : "content does not match the schema"
  )
}
