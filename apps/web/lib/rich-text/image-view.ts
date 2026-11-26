import { mergeAttributes } from "@tiptap/core"
import { ImageNode } from "@cluster/editor-schema"

import { getImageUrl } from "@/lib/images"

/** The shared `image` node, rendered with its storage key resolved to a browser URL. */
export const ImageWithUrl = ImageNode.extend({
  renderHTML({ node, HTMLAttributes }) {
    return [
      "img",
      mergeAttributes(HTMLAttributes, {
        src: getImageUrl(node.attrs.src) ?? "",
      }),
    ]
  },
})
