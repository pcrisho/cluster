import { Node, mergeAttributes, type Extensions } from "@tiptap/core"
import { StarterKit } from "@tiptap/starter-kit"
import { TaskItem } from "@tiptap/extension-task-item"
import { TaskList } from "@tiptap/extension-task-list"

/**
 * Schema-only node definitions. Views (React node views, upload plugins,
 * suggestion menus) live in the editors that consume this package, which
 * extend these nodes with `.extend()`.
 */

export const ImageNode = Node.create({
  name: "image",

  group: "block",
  inline: false,
  draggable: true,
  selectable: true,
  atom: true,

  addAttributes() {
    return {
      src: {
        default: null,
        parseHTML: (el) => el.getAttribute("src"),
        renderHTML: (attrs) => (attrs.src ? { src: attrs.src } : {}),
      },
      alt: {
        default: null,
        parseHTML: (el) => el.getAttribute("alt"),
        renderHTML: (attrs) => (attrs.alt ? { alt: attrs.alt } : {}),
      },
      title: {
        default: null,
        parseHTML: (el) => el.getAttribute("title"),
        renderHTML: (attrs) => (attrs.title ? { title: attrs.title } : {}),
      },
    }
  },

  parseHTML() {
    return [{ tag: "img[src]" }]
  },

  renderHTML({ HTMLAttributes }) {
    return ["img", mergeAttributes(HTMLAttributes)]
  },
})

export const FileCardNode = Node.create({
  name: "fileCard",

  group: "block",
  atom: true,
  draggable: false,
  selectable: true,
  isolating: true,

  addAttributes() {
    return {
      documentId: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-document-id") ?? "",
        renderHTML: (attrs) =>
          attrs.documentId
            ? { "data-document-id": String(attrs.documentId) }
            : {},
      },
      versionId: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-version-id") ?? "",
        renderHTML: (attrs) =>
          attrs.versionId ? { "data-version-id": String(attrs.versionId) } : {},
      },
      name: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-name") ?? "",
        renderHTML: (attrs) =>
          attrs.name ? { "data-name": String(attrs.name) } : {},
      },
      mimetype: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-mimetype") ?? "",
        renderHTML: (attrs) =>
          attrs.mimetype ? { "data-mimetype": String(attrs.mimetype) } : {},
      },
      size: {
        default: 0,
        parseHTML: (el) => Number(el.getAttribute("data-size") ?? 0),
        renderHTML: (attrs) => ({ "data-size": String(attrs.size ?? 0) }),
      },
      versionNumber: {
        default: 1,
        parseHTML: (el) => Number(el.getAttribute("data-version") ?? 1),
        renderHTML: (attrs) => ({
          "data-version": String(attrs.versionNumber ?? 1),
        }),
      },
    }
  },

  parseHTML() {
    return [{ tag: "div[data-type='file-card']" }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-type": "file-card" }),
    ]
  },
})

// Defined with `Node.create`, not `Mention.extend`: the suggestion plugin and
// its `@tiptap/suggestion` dependency belong to the editor, not to the schema.
export const PageMentionNode = Node.create({
  name: "pageMention",

  group: "inline",
  inline: true,
  selectable: false,
  atom: true,

  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-page-id"),
        renderHTML: (attrs) => ({ "data-page-id": attrs.id }),
      },
      label: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-label"),
        renderHTML: (attrs) =>
          attrs.label ? { "data-label": attrs.label } : {},
      },
      spaceId: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-space-id"),
        renderHTML: (attrs) => ({ "data-space-id": attrs.spaceId }),
      },
      spaceName: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-space-name"),
        renderHTML: (attrs) => ({ "data-space-name": attrs.spaceName }),
      },
      archived: {
        default: false,
        parseHTML: (el) => el.getAttribute("data-page-archived") === "true",
        renderHTML: (attrs) => ({
          "data-page-archived": attrs.archived ? "true" : "false",
        }),
      },
      mentionSuggestionChar: {
        default: "@",
        parseHTML: (el) =>
          el.getAttribute("data-mention-suggestion-char") ?? "@",
        renderHTML: (attrs) => ({
          "data-mention-suggestion-char": attrs.mentionSuggestionChar,
        }),
      },
    }
  },

  parseHTML() {
    return [{ tag: "a.page-mention" }]
  },

  renderText({ node }) {
    const char = node.attrs.mentionSuggestionChar ?? "@"
    return `${char}${node.attrs.label ?? node.attrs.id}`
  },

  renderHTML({ node, HTMLAttributes }) {
    const label = node.attrs.label ?? node.attrs.id
    const char = node.attrs.mentionSuggestionChar ?? "@"
    const href = node.attrs.spaceId
      ? `/know/spaces/${node.attrs.spaceId}/${node.attrs.id}`
      : null
    const badge = node.attrs.archived ? " 📦" : ""
    return [
      "a",
      {
        ...HTMLAttributes,
        class: `page-mention${node.attrs.archived ? " page-mention-archived" : ""}`,
        href: href ?? "#",
        ...(href ? { "data-page-id": node.attrs.id } : {}),
        rel: "noopener noreferrer",
      },
      `${char}${label}${badge}`,
    ]
  },
})

export const schemaExtensions: Extensions = [
  StarterKit.configure({
    dropcursor: false,
    gapcursor: false,
    trailingNode: false,
    link: {
      protocols: ["http", "https", "mailto"],
      autolink: false,
      openOnClick: false,
    },
  }),
  TaskList,
  TaskItem,
  ImageNode,
  FileCardNode,
  PageMentionNode,
]
