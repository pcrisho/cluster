import { normalizeName } from "./import-names"
import { NODE_COLUMNS } from "./import-types"
import type { ImportIssue, NewNode, ParsedRow, PathResult, TreeNode } from "./import-types"

/** The screens' rule for a node name. */
const NAME_PATTERN = /^[\p{L}\p{N}\s\-_/&.()]+$/u
const validName = (name: string) => name.length >= 2 && name.length <= 100 && NAME_PATTERN.test(name)

/** One level of a row's path: an existing node (key = its id) or a node the file creates (key = "new:…", shared by rows with the same path). */
interface Step {
  key: string
  existing: boolean
  name: string
  code: string | null
  /** The row wrote this name itself (a row giving only the code did not). */
  own: boolean
}

type MainResult =
  | { step: Step }
  | {
      error: ImportIssue["code"]
      column: "node_1" | "node_1_code"
      params?: Record<string, string>
    }

function groupBy<T, K>(items: T[], key: (item: T) => K): Map<K, T[]> {
  const groups = new Map<K, T[]>()
  for (const item of items) groups.set(key(item), [...(groups.get(key(item)) ?? []), item])
  return groups
}

/** Matches each row's node_1…node_6 (+ node_1_code) against the tree; pure, no I/O. */
export function matchPaths(
  rows: ParsedRow[],
  tree: TreeNode[],
  opts: { isolated: boolean; newId: () => string },
): PathResult {
  const nodeOfRow = new Map<number, string | null>()
  const errors: ImportIssue[] = []
  const warnings: ImportIssue[] = []
  const childrenOf = groupBy(tree, (n) => n.parentId)
  const roots = childrenOf.get(null) ?? []
  const byCode = new Map(tree.filter((n) => n.code).map((n) => [n.code as string, n]))

  // Rows that name a path (or at least a code); gaps and empty rows are settled here.
  const live: { row: ParsedRow; last: number }[] = []
  for (const row of rows) {
    const last = row.nodes.reduce((l, n, i) => (n !== "" ? i : l), -1)
    const gaps = row.nodes.slice(0, Math.max(last, 0)).flatMap((n, i) => (n === "" ? [i] : []))
    if (gaps.length) {
      for (const i of gaps)
        errors.push({
          row: row.row,
          column: NODE_COLUMNS[i],
          code: "NODE_GAP",
        })
    } else if (last < 0 && !row.nodeCode) {
      if (opts.isolated) errors.push({ row: row.row, column: "node_1", code: "NODE_REQUIRED" })
      else nodeOfRow.set(row.row, null)
    } else live.push({ row, last })
  }

  // Consistency (rule 3d): one name, one code. Conflicts spread one step to the other key of the pair.
  const norm = (row: ParsedRow) => (row.nodes[0] ? normalizeName(row.nodes[0]) : "")
  const pairs = live.filter(({ row }) => row.nodeCode && row.nodes[0])
  const codesOfName = groupBy(pairs, ({ row }) => norm(row))
  const namesOfCode = groupBy(pairs, ({ row }) => row.nodeCode)
  const badNames = new Set(
    [...codesOfName].filter(([, p]) => new Set(p.map((x) => x.row.nodeCode)).size > 1).map(([k]) => k),
  )
  const badCodes = new Set(
    [...namesOfCode].filter(([, p]) => new Set(p.map((x) => norm(x.row))).size > 1).map(([k]) => k),
  )
  for (const { row } of pairs) {
    if (badNames.has(norm(row))) badCodes.add(row.nodeCode)
    if (badCodes.has(row.nodeCode)) badNames.add(norm(row))
  }
  const conflicted = (row: ParsedRow) =>
    (row.nodeCode ? badCodes.has(row.nodeCode) : false) || (norm(row) !== "" && badNames.has(norm(row)))
  const consistent = live.filter(({ row }) => {
    if (!conflicted(row)) return true
    errors.push({
      row: row.row,
      column: "node_1_code",
      code: "NODE_CODE_CONFLICT",
    })
    return false
  })

  // Rows without a code follow the code written for their name; a code takes the first name written for it.
  const codeByName = new Map<string, string>()
  const nameByCode = new Map<string, string>()
  for (const { row } of consistent) {
    if (!row.nodeCode || !row.nodes[0]) continue
    if (!codeByName.has(norm(row))) codeByName.set(norm(row), row.nodeCode)
    if (!nameByCode.has(row.nodeCode)) nameByCode.set(row.nodeCode, row.nodes[0])
  }

  const mains = new Map<string, MainResult>()
  const resolveMain = (code: string | null, name: string): MainResult => {
    const memo = code ? `c:${code}` : `n:${normalizeName(name)}`
    const known = mains.get(memo)
    if (known) return known
    const existing = (n: TreeNode): MainResult => ({
      step: {
        key: n.id,
        existing: true,
        name: n.name,
        code: n.code,
        own: true,
      },
    })
    let result: MainResult
    if (code) {
      const found = byCode.get(code)
      const sameName = roots.find((r) => r.isActive && normalizeName(r.name) === normalizeName(name))
      if (found) result = existing(found)
      else if (!name) result = { error: "REQUIRED", column: "node_1" }
      else if (sameName)
        result = {
          error: "NODE_CODE_MISMATCH",
          column: "node_1_code",
          params: { code, name: sameName.name },
        }
      else
        result = {
          step: {
            key: `new:code:${code}`,
            existing: false,
            name,
            code,
            own: true,
          },
        }
    } else {
      const matches = roots.filter((r) => normalizeName(r.name) === normalizeName(name))
      if (matches.length === 0)
        result = {
          step: {
            key: `new:/${normalizeName(name)}`,
            existing: false,
            name,
            code: null,
            own: true,
          },
        }
      else if (matches.length > 1) result = { error: "NODE_AMBIGUOUS", column: "node_1" }
      else if (!matches[0].isActive) result = { error: "NODE_ARCHIVED", column: "node_1" }
      else result = existing(matches[0])
    }
    mains.set(memo, result)
    return result
  }

  const plans = new Map<number, Step[]>()
  const warned = new Set<string>()
  for (const { row, last } of consistent) {
    const fail = (i: number, code: string, params?: Record<string, string>) =>
      errors.push({
        row: row.row,
        column: NODE_COLUMNS[i],
        code,
        ...(params && { params }),
      })
    const code = row.nodeCode ?? codeByName.get(norm(row)) ?? null
    const main = resolveMain(code, nameByCode.get(code ?? "") ?? row.nodes[0])
    if ("error" in main) {
      errors.push({
        row: row.row,
        column: main.column,
        code: main.error,
        ...(main.params && { params: main.params }),
      })
      continue
    }
    const first = main.step
    if (
      first.existing &&
      code &&
      row.nodes[0] &&
      normalizeName(row.nodes[0]) !== normalizeName(first.name) &&
      !warned.has(code)
    ) {
      warned.add(code)
      warnings.push({
        row: row.row,
        column: "node_1",
        code: "NODE_NAME_DIFFERS",
        params: { code, name: first.name },
      })
    }
    const steps: Step[] = [{ ...first, own: row.nodes[0] !== "" }]
    let failed = false
    for (let i = 1; i <= last && !failed; i++) {
      const parent = steps[i - 1]
      const name = row.nodes[i]
      const key = normalizeName(name)
      const matches = parent.existing
        ? (childrenOf.get(parent.key) ?? []).filter((c) => normalizeName(c.name) === key)
        : []
      if (matches.length > 1) fail(i, "NODE_AMBIGUOUS")
      else if (matches.length === 1 && !matches[0].isActive) fail(i, "NODE_ARCHIVED")
      else if (matches.length === 1)
        steps.push({
          key: matches[0].id,
          existing: true,
          name: matches[0].name,
          code: null,
          own: true,
        })
      else
        steps.push({
          key: `${parent.key}/${key}`,
          existing: false,
          name,
          code: null,
          own: true,
        })
      failed = steps.length <= i
    }
    if (failed) continue
    const invalid = steps.flatMap((s, i) => (!s.existing && s.own && !validName(s.name) ? [i] : []))
    for (const i of invalid) fail(i, "NODE_NAME_INVALID")
    if (!invalid.length) plans.set(row.row, steps)
  }

  // New nodes in file order, so a parent always comes before its children.
  const ids = new Map<string, string>()
  const names = new Map<string, string>()
  const newNodes: NewNode[] = []
  for (const { row } of consistent) {
    const steps = plans.get(row.row)
    if (!steps) continue
    steps.forEach((s, i) => {
      if (s.existing || ids.has(s.key)) return
      const id = opts.newId()
      ids.set(s.key, id)
      names.set(s.key, s.name)
      const path = steps.slice(0, i + 1).map((p) => names.get(p.key) ?? p.name)
      newNodes.push({
        id,
        parentId: i === 0 ? null : (ids.get(steps[i - 1].key) ?? steps[i - 1].key),
        name: s.name,
        code: s.code,
        path,
      })
    })
    const leaf = steps[steps.length - 1]
    nodeOfRow.set(row.row, leaf.existing ? leaf.key : (ids.get(leaf.key) as string))
  }

  errors.sort((a, b) => a.row - b.row)
  return { nodeOfRow, newNodes, errors, warnings }
}
