import type { Root } from "mdast"
import type { Plugin } from "unified"
import { visit } from "unist-util-visit"
import { headingSlug } from "./slug"

// Container directives an author may use: :::note, :::tip, :::warning, :::steps.
// Any other directive fails the build, so a typo never ships silently.
const CALLOUTS = new Set(["note", "tip", "warning"])
const CONTAINERS = new Set([...CALLOUTS, "steps"])

export const docsDirectives: Plugin<[], Root> = () => (tree, file) => {
  visit(tree, (node) => {
    if (node.type === "textDirective" || node.type === "leafDirective") {
      file.fail(`directive ":${node.name}" is not allowed here`, node)
    }
    if (node.type !== "containerDirective") return
    if (!CONTAINERS.has(node.name)) {
      file.fail(`unknown directive ":::${node.name}"`, node)
    }
    const data = (node.data ??= {})
    data.hName = "div"
    data.hProperties = CALLOUTS.has(node.name)
      ? { className: ["callout"], "data-kind": node.name }
      : { className: ["steps"] }
  })
}

function textOf(node: { value?: string; children?: unknown[] }): string {
  if (typeof node.value === "string") return node.value
  return (node.children ?? []).map((c) => textOf(c as typeof node)).join("")
}

export const docsHeadings: Plugin<[], Root> = () => (tree) => {
  const seen = new Map<string, number>()
  visit(tree, "heading", (node) => {
    const data = (node.data ??= {})
    data.hProperties = { id: headingSlug(textOf(node), seen) }
  })
}
