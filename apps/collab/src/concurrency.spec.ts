import { assertValidDoc } from "@cluster/editor-schema"
import * as Y from "yjs"
import {
  decodeState,
  encodeState,
  fieldsToYdoc,
  replaceFields,
  ydocToFields,
  ydocToRepairedFields,
} from "./convert"

/**
 * Two people edit their own copy of a page while disconnected, then the copies are merged both ways.
 * The merged document may break a content rule (two people deleting different items of one list leave
 * it empty): the service repairs it (ydocToRepairedFields), writes the result back and everyone must
 * end with the same valid document. Otherwise "reject and reload" would throw away legitimate work.
 */

const SEED = 20261025
const ROUNDS = 600

// Each shape runs hundreds of merges: well under a minute, but beyond Jest's 5 s default when the machine is busy.
jest.setTimeout(60_000)

// mulberry32: tiny deterministic PRNG.
function prng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
type Rand = () => number
const pick = <T>(rand: Rand, items: T[]): T =>
  items[Math.floor(rand() * items.length)]

type Json = {
  type: string
  attrs?: Record<string, unknown>
  content?: Json[]
  text?: string
  marks?: unknown[]
}
const text = (value: string, marks?: unknown[]): Json => ({
  type: "text",
  text: value,
  ...(marks ? { marks } : {}),
})
const para = (...content: Json[]): Json => ({ type: "paragraph", content })
const p = (value: string) => para(text(value))
const item = (
  type: string,
  value: string,
  attrs?: Record<string, unknown>
): Json => ({
  type,
  ...(attrs ? { attrs } : {}),
  content: [p(value)],
})

const BASE: Json = {
  type: "doc",
  content: [
    { type: "heading", attrs: { level: 1 }, content: [text("Heading")] },
    para(
      text("plain "),
      text("bold", [{ type: "bold" }]),
      text(" and "),
      text("italic", [{ type: "italic" }])
    ),
    p("second paragraph"),
    {
      type: "bulletList",
      content: ["one", "two", "three", "four"].map((v) => item("listItem", v)),
    },
    {
      type: "orderedList",
      attrs: { start: 1 },
      content: ["first", "second", "third"].map((v) => item("listItem", v)),
    },
    {
      type: "taskList",
      content: [
        item("taskItem", "done task", { checked: true }),
        item("taskItem", "open task", { checked: false }),
        item("taskItem", "another open", { checked: false }),
      ],
    },
    { type: "blockquote", content: [p("quoted one"), p("quoted two")] },
    {
      type: "codeBlock",
      attrs: { language: null },
      content: [text("const a = 1")],
    },
    p("last paragraph"),
  ],
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value))
const isValid = (body: Json) => {
  try {
    assertValidDoc(body)
    return true
  } catch {
    return false
  }
}

/** Every node with the array that holds it, so a mutation can insert, remove or move it. */
interface Slot {
  parent: Json
  index: number
}
function slots(root: Json): Slot[] {
  const found: Slot[] = []
  const walk = (node: Json) =>
    node.content?.forEach((child, index) => {
      found.push({ parent: node, index })
      walk(child)
    })
  walk(root)
  return found
}
const nodeAt = (s: Slot) => s.parent.content![s.index]
const isList = (n: Json) =>
  ["bulletList", "orderedList", "taskList"].includes(n.type)
const isItem = (n: Json) => n.type === "listItem" || n.type === "taskItem"

type Mutation = (rand: Rand, body: Json) => string | undefined

const MUTATIONS: Record<string, Mutation> = {
  insertParagraph(rand, body) {
    const containers = [body, ...slots(body).map(nodeAt)].filter((n) =>
      ["doc", "blockquote", "listItem", "taskItem"].includes(n.type)
    )
    const target = pick(rand, containers)
    target.content!.splice(
      Math.floor(rand() * (target.content!.length + 1)),
      0,
      p(`new ${Math.floor(rand() * 1000)}`)
    )
    return "insertParagraph"
  },
  deleteParagraph(rand, body) {
    const s = pick(
      rand,
      slots(body).filter((x) => nodeAt(x).type === "paragraph")
    )
    if (!s) return
    s.parent.content!.splice(s.index, 1)
    return "deleteParagraph"
  },
  moveParagraph(rand, body) {
    const s = pick(
      rand,
      slots(body).filter((x) => nodeAt(x).type === "paragraph")
    )
    if (!s) return
    const [moved] = s.parent.content!.splice(s.index, 1)
    s.parent.content!.splice(
      Math.floor(rand() * (s.parent.content!.length + 1)),
      0,
      moved
    )
    return "moveParagraph"
  },
  insertListItem(rand, body) {
    const list = pick(rand, slots(body).map(nodeAt).filter(isList))
    const type = list.type === "taskList" ? "taskItem" : "listItem"
    const attrs = type === "taskItem" ? { checked: false } : undefined
    list.content!.splice(
      Math.floor(rand() * (list.content!.length + 1)),
      0,
      item(type, `item ${Math.floor(rand() * 1000)}`, attrs)
    )
    return "insertListItem"
  },
  deleteListItem(rand, body) {
    const s = pick(
      rand,
      slots(body).filter((x) => isItem(nodeAt(x)))
    )
    s.parent.content!.splice(s.index, 1)
    return "deleteListItem"
  },
  deleteSomeListItems(rand, body) {
    // Several items at once, always leaving at least one: valid alone, but two of these can empty a list together.
    const list = pick(
      rand,
      slots(body)
        .map(nodeAt)
        .filter((n) => isList(n) && n.content!.length > 1)
    )
    if (!list) return
    const keep = Math.floor(rand() * list.content!.length)
    list.content = list.content!.filter((_, i) => i === keep || rand() < 0.5)
    return "deleteSomeListItems"
  },
  duplicateListItem(rand, body) {
    const s = pick(
      rand,
      slots(body).filter((x) => isItem(nodeAt(x)))
    )
    s.parent.content!.splice(s.index + 1, 0, clone(nodeAt(s)))
    return "duplicateListItem"
  },
  deleteAllListItems(rand, body) {
    // A list cannot be empty in the schema: emptying it removes the list.
    const s = pick(
      rand,
      slots(body).filter((x) => isList(nodeAt(x)))
    )
    s.parent.content!.splice(s.index, 1)
    return "deleteAllListItems"
  },
  toggleTask(rand, body) {
    const task = pick(
      rand,
      slots(body)
        .map(nodeAt)
        .filter((n) => n.type === "taskItem")
    )
    if (!task) return
    task.attrs = { ...task.attrs, checked: !task.attrs?.checked }
    return "toggleTask"
  },
  splitItem(rand, body) {
    const s = pick(
      rand,
      slots(body).filter(
        (x) => isItem(nodeAt(x)) && nodeAt(x).content![0].content?.[0]?.text
      )
    )
    if (!s) return
    const original = nodeAt(s)
    const word = original.content![0].content![0].text!
    const cut = Math.max(1, Math.floor(word.length / 2))
    original.content![0].content![0].text = word.slice(0, cut)
    const second = clone(original)
    second.content![0].content![0].text = word.slice(cut) || "x"
    s.parent.content!.splice(s.index + 1, 0, second)
    return "splitItem"
  },
  mergeItems(rand, body) {
    const s = pick(
      rand,
      slots(body).filter(
        (x) => isItem(nodeAt(x)) && x.index + 1 < x.parent.content!.length
      )
    )
    if (!s) return
    const [next] = s.parent.content!.splice(s.index + 1, 1)
    const first = nodeAt(s).content![0]
    first.content = [
      ...(first.content ?? []),
      ...(next.content![0].content ?? []),
    ]
    return "mergeItems"
  },
  deleteContainer(rand, body) {
    const s = pick(
      rand,
      slots(body).filter(
        (x) => nodeAt(x).type === "blockquote" || isList(nodeAt(x))
      )
    )
    s.parent.content!.splice(s.index, 1)
    return "deleteContainer"
  },
  editText(rand, body) {
    const t = pick(
      rand,
      slots(body)
        .map(nodeAt)
        .filter((n) => n.type === "text" && n.text)
    )
    if (!t) return
    const at = Math.floor(rand() * (t.text!.length + 1))
    t.text =
      t.text!.slice(0, at) + `~${Math.floor(rand() * 100)}~` + t.text!.slice(at)
    return "editText"
  },
}

/** Applies one random mutation that leaves a valid document; returns its name. */
function mutate(
  rand: Rand,
  doc: Y.Doc,
  names = Object.keys(MUTATIONS)
): string {
  for (let attempt = 0; attempt < 50; attempt++) {
    const candidate = clone(ydocToFields(doc).body) as Json
    const name = pick(rand, names)
    let done: string | undefined
    try {
      done = MUTATIONS[name](rand, candidate)
    } catch {
      continue // nothing of that kind in the document right now
    }
    if (!done || !isValid(candidate)) continue
    replaceFields(doc, { body: candidate as never, title: "Title" })
    return done
  }
  throw new Error("no applicable mutation")
}

const replicas = (start: Json = BASE) => {
  const base = encodeState(
    fieldsToYdoc({ body: start as never, title: "Title" })
  )
  return [decodeState(base), decodeState(base)] as const
}

interface Failure {
  round: number
  editsA: string[]
  editsB: string[]
  problem: string
}

const stats: Record<string, number> = {}

/**
 * Merges both ways, repairs the way the service does (on one copy, then the write-back reaches the
 * other); returns a problem description, or undefined when the result is valid and equal.
 */
function mergeProblem(
  a: Y.Doc,
  b: Y.Doc,
  label = "direct"
): { problem: string } | undefined {
  const updateA = Y.encodeStateAsUpdate(a)
  const updateB = Y.encodeStateAsUpdate(b)
  Y.applyUpdate(a, updateB)
  Y.applyUpdate(b, updateA)
  try {
    const { fields, repaired } = ydocToRepairedFields(a)
    if (repaired) {
      stats[label] = (stats[label] ?? 0) + 1
      // The other copy repairs to the very same content, whoever does it.
      if (
        JSON.stringify(ydocToRepairedFields(b).fields) !==
        JSON.stringify(fields)
      )
        return { problem: "replicas repaired to different content" }
      const before = Y.encodeStateVector(b)
      replaceFields(a, fields)
      Y.applyUpdate(b, Y.encodeStateAsUpdate(a, before))
    }
    assertValidDoc(fields.body)
    const fieldsA = ydocToFields(a)
    const fieldsB = ydocToFields(b)
    if (JSON.stringify(fieldsA) !== JSON.stringify(fieldsB))
      return { problem: "replicas did not converge" }
    if (JSON.stringify(fieldsA) !== JSON.stringify(fields))
      return { problem: "write-back changed the repaired content" }
    if (ydocToRepairedFields(a).repaired)
      return { problem: "repair is not idempotent" }
  } catch (error) {
    return { problem: error instanceof Error ? error.message : String(error) }
  }
}

function run(
  label: string,
  setup: (rand: Rand, a: Y.Doc, b: Y.Doc) => [string[], string[]],
  start: Json = BASE
) {
  const rand = prng(SEED)
  const failures: Failure[] = []
  for (let round = 0; round < ROUNDS; round++) {
    const [a, b] = replicas(start)
    const [editsA, editsB] = setup(rand, a, b)
    const result = mergeProblem(a, b, label)
    if (result)
      failures.push({ round, editsA, editsB, problem: result.problem })
  }
  const problems: Record<string, number> = {}
  for (const failure of failures)
    problems[failure.problem] = (problems[failure.problem] ?? 0) + 1
  return { label, failures, problems }
}

const many = (rand: Rand, doc: Y.Doc) =>
  Array.from({ length: 1 + Math.floor(rand() * 3) }, () => mutate(rand, doc))

describe(`concurrent structural edits (seed ${SEED}, ${ROUNDS} rounds)`, () => {
  it("merges random structural edits of two disconnected replicas into a valid, identical document", () => {
    const { failures, problems } = run("random", (rand, a, b) => [
      many(rand, a),
      many(rand, b),
    ])
    expect({
      seed: SEED,
      rounds: ROUNDS,
      failureCount: failures.length,
      problems,
      firstFailures: failures.slice(0, 3),
    }).toEqual({
      seed: SEED,
      rounds: ROUNDS,
      failureCount: 0,
      problems: {},
      firstFailures: [],
    })
  })

  it("merges a deleted list item with a text edit inside the same item", () => {
    const { failures, problems } = run("delete-vs-edit", (rand, a, b) => {
      const itemSlots = (doc: Y.Doc) =>
        slots(ydocToFields(doc).body as Json).filter((s) => isItem(nodeAt(s)))
      const index = Math.floor(rand() * itemSlots(a).length)
      const editor = rand() < 0.5 ? a : b
      const deleter = editor === a ? b : a
      for (const [doc, op] of [
        [deleter, "deleteItem"],
        [editor, "editInsideItem"],
      ] as const) {
        const body = clone(ydocToFields(doc).body) as Json
        const s = slots(body).filter((x) => isItem(nodeAt(x)))[index]
        if (op === "deleteItem") s.parent.content!.splice(s.index, 1)
        else {
          const paragraph = nodeAt(s).content![0]
          paragraph.content = [text(`edited ${Math.floor(rand() * 1000)}`)]
        }
        // An item that was the only one of its list takes the list with it.
        if (op === "deleteItem" && !isValid(body))
          body.content = body.content!.filter(
            (n) => !(isList(n) && !n.content?.length)
          )
        replaceFields(doc, { body: body as never, title: "Title" })
      }
      return deleter === a
        ? [["deleteItem"], ["editInsideItem"]]
        : [["editInsideItem"], ["deleteItem"]]
    })
    expect({
      seed: SEED,
      failureCount: failures.length,
      problems,
      firstFailures: failures.slice(0, 3),
    }).toEqual({
      seed: SEED,
      failureCount: 0,
      problems: {},
      firstFailures: [],
    })
  })

  it("merges two replicas that each delete some items of the same list", () => {
    const { failures, problems } = run("same-list-deletes", (rand, a, b) => {
      const lists = (doc: Y.Doc) =>
        slots(ydocToFields(doc).body as Json).filter((x) => isList(nodeAt(x)))
      const which = Math.floor(rand() * lists(a).length)
      for (const doc of [a, b]) {
        const body = clone(ydocToFields(doc).body) as Json
        const list = nodeAt(slots(body).filter((x) => isList(nodeAt(x)))[which])
        MUTATIONS.deleteSomeListItems(rand, { type: "doc", content: [list] })
        replaceFields(doc, { body: body as never, title: "Title" })
      }
      return [["deleteSomeListItems"], ["deleteSomeListItems"]]
    })
    expect({
      seed: SEED,
      rounds: ROUNDS,
      failureCount: failures.length,
      problems,
      firstFailures: failures.slice(0, 3),
    }).toEqual({
      seed: SEED,
      rounds: ROUNDS,
      failureCount: 0,
      problems: {},
      firstFailures: [],
    })
  })

  it("merges one replica deleting the first items of a list and the other the last ones", () => {
    const items = (values: string[]): Json => ({
      type: "bulletList",
      content: values.map((v) => item("listItem", v)),
    })
    const doc = (values: string[]) => ({
      type: "doc",
      content: [items(values), p("after")],
    })
    const base = encodeState(
      fieldsToYdoc({ body: doc(["a", "b", "c", "d"]) as never, title: "T" })
    )
    const [a, b] = [decodeState(base), decodeState(base)]
    replaceFields(a, { body: doc(["c", "d"]) as never, title: "T" })
    replaceFields(b, { body: doc(["a", "b"]) as never, title: "T" })
    expect(mergeProblem(a, b)).toBeUndefined()
    // Both sides emptied the list for real: the repair is what removes it.
    expect(JSON.stringify(ydocToFields(a).body)).not.toContain("bulletList")
  })

  it("merges nested lists and multi-paragraph blockquotes that lose different children on each side", () => {
    const nestedItem = (value: string, ...inner: Json[]): Json => ({
      type: "listItem",
      content: [p(value), ...inner],
    })
    const list = (type: string, ...items: Json[]): Json => ({
      type,
      content: items,
    })
    const NESTED: Json = {
      type: "doc",
      content: [
        list(
          "bulletList",
          nestedItem(
            "a",
            list(
              "bulletList",
              ...["a1", "a2", "a3", "a4"].map((v) => item("listItem", v))
            )
          ),
          nestedItem(
            "b",
            list(
              "orderedList",
              nestedItem(
                "b1",
                list(
                  "bulletList",
                  item("listItem", "b1x"),
                  item("listItem", "b1y")
                )
              ),
              item("listItem", "b2"),
              item("listItem", "b3")
            )
          ),
          item("listItem", "c")
        ),
        {
          type: "blockquote",
          content: ["q1", "q2", "q3", "q4", "q5"].map(p),
        },
        {
          type: "blockquote",
          content: [
            p("r1"),
            list("bulletList", item("listItem", "r2"), item("listItem", "r3")),
            p("r3"),
          ],
        },
        p("end"),
      ],
    }
    const containers = (body: Json) =>
      slots(body)
        .map(nodeAt)
        .filter((n) => isList(n) || n.type === "blockquote")
    const { failures, problems } = run(
      "nested",
      (rand, a, b) => {
        const shared = Math.floor(rand() * containers(NESTED).length)
        for (const doc of [a, b]) {
          for (let op = 0; op < 1 + Math.floor(rand() * 3); op++) {
            const body = clone(ydocToFields(doc).body) as Json
            const all = containers(body)
            const target =
              all[op === 0 ? shared : Math.floor(rand() * all.length)]
            if (!target?.content || target.content.length < 2) continue
            // Keep a random non-empty subset: valid on its own, empty when the other side keeps the rest.
            const keep = Math.floor(rand() * target.content.length)
            target.content = target.content.filter(
              (_, i) => i === keep || rand() < 0.4
            )
            replaceFields(doc, { body: body as never, title: "Title" })
          }
        }
        return [["keepSome"], ["keepSome"]]
      },
      NESTED
    )
    expect({
      seed: SEED,
      rounds: ROUNDS,
      failureCount: failures.length,
      problems,
      firstFailures: failures.slice(0, 3),
    }).toEqual({
      seed: SEED,
      rounds: ROUNDS,
      failureCount: 0,
      problems: {},
      firstFailures: [],
    })
  })

  afterAll(() => {
    // Evidence that the shapes really exercise the repair, not only valid merges.
    console.log(
      `merges that needed a repair, out of ${ROUNDS} per shape:`,
      stats
    )
  })
})
