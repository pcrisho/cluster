import { getSchema } from "@tiptap/core"
import { Node as ProseMirrorNode, type Schema } from "@tiptap/pm/model"

import { schemaExtensions } from "./extensions"

const MAX_DEPTH = 100
const LINK_HREF = /^(?:https?:\/\/[^/?#]+|mailto:.+)/i
const HTTPS_ORIGIN = /^https:\/\/[^/?#]+/i
const STORAGE_KEY = /^organizations\/[^/\s]+\/[^\s]+$/

export class InvalidDocError extends Error {
  readonly path: string

  constructor(reason: string, path = "") {
    super(
      path
        ? `Invalid document at ${path}: ${reason}`
        : `Invalid document: ${reason}`
    )
    this.name = "InvalidDocError"
    this.path = path
  }
}

/** Links may only point to web or mail addresses; `javascript:`, `data:` and protocol-relative URLs are rejected. */
export function isAllowedLinkHref(href: unknown): boolean {
  if (typeof href !== "string") return false
  return LINK_HREF.test(withoutControls(href))
}

export interface ValidateDocOptions {
  /** When set, storage keys must belong to this organization. */
  orgId?: string
}

/**
 * Images are either absolute https URLs or storage keys
 * (`organizations/<org>/…`), never URLs of the API or of the storage.
 */
export function isAllowedImageSrc(src: unknown): boolean {
  if (typeof src !== "string") return false
  const value = withoutControls(src)
  if (HTTPS_ORIGIN.test(value)) return true
  // A key with stripped characters (whitespace, control chars) is malformed.
  return (
    value === src && STORAGE_KEY.test(src) && !src.split("/").includes("..")
  )
}

let editorSchema: Schema | undefined

function getEditorSchema(): Schema {
  editorSchema ??= getSchema(schemaExtensions)
  return editorSchema
}

/**
 * Throws `InvalidDocError` unless `json` is a document the shared schema
 * accepts. Shape, type, attribute and URL checks run first so the errors name
 * the offending node; ProseMirror's own check runs last.
 */
export function assertValidDoc(
  json: unknown,
  options: ValidateDocOptions = {}
): void {
  const schema = getEditorSchema()
  if (!isRecord(json) || json.type !== "doc") {
    throw new InvalidDocError('root node must be of type "doc"')
  }
  checkNode(json, "", 0, schema, options)
  try {
    ProseMirrorNode.fromJSON(schema, json).check()
  } catch (error) {
    throw new InvalidDocError(
      error instanceof Error
        ? error.message
        : "content does not match the schema"
    )
  }
}

function checkNode(
  value: unknown,
  path: string,
  depth: number,
  schema: Schema,
  options: ValidateDocOptions
): void {
  if (depth > MAX_DEPTH) {
    throw new InvalidDocError(`nesting exceeds ${MAX_DEPTH} levels`, path)
  }
  if (!isRecord(value) || typeof value.type !== "string") {
    throw new InvalidDocError("node must be an object with a string type", path)
  }
  const type = value.type
  if (!hasOwn(schema.nodes, type)) {
    throw new InvalidDocError(`unknown node type "${type}"`, path)
  }
  const attrs = checkAttrs(
    value.attrs,
    schema.nodes[type].spec.attrs ?? {},
    `"${type}" node`,
    path,
    type
  )
  if (type === "image")
    checkImageSrc(attrs.src, child(path, "attrs.src"), options)
  if (value.marks !== undefined) {
    if (!Array.isArray(value.marks)) {
      throw new InvalidDocError("marks must be an array", child(path, "marks"))
    }
    value.marks.forEach((mark, index) =>
      checkMark(mark, child(path, `marks[${index}]`), schema)
    )
  }
  if (value.content !== undefined) {
    if (!Array.isArray(value.content)) {
      throw new InvalidDocError(
        "content must be an array",
        child(path, "content")
      )
    }
    value.content.forEach((node, index) =>
      checkNode(
        node,
        child(path, `content[${index}]`),
        depth + 1,
        schema,
        options
      )
    )
  }
}

function checkImageSrc(
  src: unknown,
  path: string,
  options: ValidateDocOptions
): void {
  if (!isAllowedImageSrc(src)) {
    throw new InvalidDocError(
      "image src must be https or an organizations/ storage key",
      path
    )
  }
  const key = src as string
  const isKey = !HTTPS_ORIGIN.test(withoutControls(key))
  if (
    options.orgId !== undefined &&
    isKey &&
    !key.startsWith(`organizations/${options.orgId}/`)
  ) {
    throw new InvalidDocError(
      "image key must belong to this organization",
      path
    )
  }
}

function checkMark(value: unknown, path: string, schema: Schema): void {
  if (!isRecord(value) || typeof value.type !== "string") {
    throw new InvalidDocError("mark must be an object with a string type", path)
  }
  const type = value.type
  if (!hasOwn(schema.marks, type)) {
    throw new InvalidDocError(`unknown mark type "${type}"`, path)
  }
  const attrs = checkAttrs(
    value.attrs,
    schema.marks[type].spec.attrs ?? {},
    `"${type}" mark`,
    path,
    type
  )
  if (type === "link" && !isAllowedLinkHref(attrs.href)) {
    throw new InvalidDocError(
      "link href must be http, https or mailto",
      child(path, "attrs.href")
    )
  }
}

type AttrRule = { test: (value: unknown) => boolean; reason: string }

const MAX_ATTR_STRING = 2000
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const isUuid = (value: unknown): boolean =>
  typeof value === "string" && UUID.test(value)
const isText = (max: number) => (value: unknown) =>
  typeof value === "string" && value.length <= max
const orNull = (test: (value: unknown) => boolean) => (value: unknown) =>
  value === null || test(value)
const isInteger = (min: number, max: number) => (value: unknown) =>
  Number.isInteger(value) &&
  (value as number) >= min &&
  (value as number) <= max

const rule = (test: (value: unknown) => boolean, reason: string): AttrRule => ({
  test,
  reason,
})

// Checked on top of the generic primitive check, only for attributes present.
const ATTR_RULES: Record<string, Record<string, AttrRule>> = {
  pageMention: {
    id: rule(orNull(isUuid), "must be null or a UUID"),
    spaceId: rule(orNull(isUuid), "must be null or a UUID"),
    label: rule(
      orNull(isText(500)),
      "must be null or a string of at most 500 characters"
    ),
    spaceName: rule(
      orNull(isText(500)),
      "must be null or a string of at most 500 characters"
    ),
    archived: rule((value) => typeof value === "boolean", "must be a boolean"),
    mentionSuggestionChar: rule(
      isText(5),
      "must be a string of at most 5 characters"
    ),
  },
  fileCard: {
    documentId: rule(
      (value) => value === "" || isUuid(value),
      "must be an empty string or a UUID"
    ),
    versionId: rule(
      (value) => value === "" || isUuid(value),
      "must be an empty string or a UUID"
    ),
    name: rule(isText(500), "must be a string of at most 500 characters"),
    mimetype: rule(isText(255), "must be a string of at most 255 characters"),
    size: rule(
      (value) => typeof value === "number" && value >= 0,
      "must be a number >= 0"
    ),
    versionNumber: rule(
      isInteger(1, Number.MAX_SAFE_INTEGER),
      "must be an integer >= 1"
    ),
  },
  image: {
    alt: rule(
      orNull(isText(1000)),
      "must be null or a string of at most 1000 characters"
    ),
    title: rule(
      orNull(isText(1000)),
      "must be null or a string of at most 1000 characters"
    ),
  },
  heading: {
    level: rule(isInteger(1, 6), "must be an integer from 1 to 6"),
  },
}

function checkAttrs(
  attrs: unknown,
  allowed: Record<string, unknown>,
  owner: string,
  path: string,
  type: string
): Record<string, unknown> {
  if (attrs === undefined) return {}
  if (!isRecord(attrs)) {
    throw new InvalidDocError(`attrs of ${owner} must be an object`, path)
  }
  for (const key of Object.keys(attrs)) {
    if (!hasOwn(allowed, key)) {
      throw new InvalidDocError(
        `unknown attribute "${key}" on ${owner}`,
        child(path, "attrs")
      )
    }
    const value = attrs[key]
    if (!isPrimitiveAttr(value)) {
      throw new InvalidDocError(
        `attribute "${key}" on ${owner} must be a string of at most ${MAX_ATTR_STRING} characters, a finite number, a boolean or null`,
        child(path, `attrs.${key}`)
      )
    }
    const attrRule = hasOwn(ATTR_RULES, type)
      ? ATTR_RULES[type][key]
      : undefined
    if (attrRule && !attrRule.test(value)) {
      throw new InvalidDocError(
        `attribute "${key}" on ${owner} ${attrRule.reason}`,
        child(path, `attrs.${key}`)
      )
    }
  }
  return attrs
}

function isPrimitiveAttr(value: unknown): boolean {
  if (value === null || typeof value === "boolean") return true
  if (typeof value === "number") return Number.isFinite(value)
  return typeof value === "string" && value.length <= MAX_ATTR_STRING
}

function child(path: string, key: string): string {
  return path ? `${path}.${key}` : key
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function hasOwn(object: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(object, key)
}

function withoutControls(value: string): string {
  return value.replace(/[\s\u0000-\u001f\u007f-\u009f]/g, "")
}
