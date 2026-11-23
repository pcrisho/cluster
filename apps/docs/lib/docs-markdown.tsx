import type { ComponentPropsWithoutRef } from "react"
import Markdown from "react-markdown"
import remarkDirective from "remark-directive"
import remarkGfm from "remark-gfm"
import { Callout, type CalloutKind } from "@/components/callout"
import { CodeBlock } from "@/components/code-block"
import { Figure } from "@/components/figure"
import { Steps } from "@/components/steps"
import { docsDirectives, docsHeadings } from "./docs-plugins"

// A paragraph that holds only an image is a figure, not a <p> around one.
function Paragraph({
  node,
  children,
}: ComponentPropsWithoutRef<"p"> & { node?: { children: { type: string; tagName?: string }[] } }) {
  const only = node?.children.length === 1 ? node.children[0] : undefined
  if (only?.type === "element" && only.tagName === "img") return <>{children}</>
  return <p>{children}</p>
}

function DirectiveContainer({
  className,
  children,
  ...props
}: ComponentPropsWithoutRef<"div"> & { "data-kind"?: string }) {
  const classes = typeof className === "string" ? className.split(/\s+/) : []
  if (classes.includes("callout")) {
    const kind = props["data-kind"] as CalloutKind | undefined
    return <Callout kind={kind}>{children}</Callout>
  }
  if (classes.includes("steps")) {
    return <Steps>{children}</Steps>
  }
  return (
    <div className={className} {...props}>
      {children}
    </div>
  )
}

export function DocBody({ source }: { source: string }) {
  return (
    <Markdown
      remarkPlugins={[remarkGfm, remarkDirective, docsDirectives, docsHeadings]}
      components={{
        img: Figure,
        p: Paragraph,
        div: DirectiveContainer,
        pre: CodeBlock,
      }}
    >
      {source}
    </Markdown>
  )
}
