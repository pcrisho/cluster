import { computePosition, flip, offset, shift } from "@floating-ui/dom"

export type SuggestionRect = () => DOMRect | null

export interface SuggestionPopup {
  /** Attaches `element` to `document.body` and positions it under the rect. */
  show: (element: HTMLElement, getRect: SuggestionRect) => void
  /** Positions the open popup again with the latest rect. */
  update: (getRect: SuggestionRect) => void
  hide: () => void
  destroy: () => void
}

/**
 * Floating container for an editor suggestion menu. It sits under the
 * cursor (`getRect` is the suggestion's `clientRect`), flips above when
 * there is no room below, and follows scroll and resize while shown.
 */
export function createSuggestionPopup(): SuggestionPopup {
  const container = document.createElement("div")
  container.style.position = "fixed"
  container.style.top = "0"
  container.style.left = "0"
  container.style.zIndex = "50"

  let getRect: SuggestionRect | null = null

  function reposition() {
    const rect = getRect?.()
    if (!rect) return
    void computePosition({ getBoundingClientRect: () => rect }, container, {
      strategy: "fixed",
      placement: "bottom-start",
      middleware: [offset(4), flip(), shift({ padding: 8 })],
    }).then(({ x, y }) => {
      container.style.left = `${x}px`
      container.style.top = `${y}px`
    })
  }

  // The menu itself scrolls its list; only outside scrolling moves the cursor.
  function onScroll(event: Event) {
    if (event.target instanceof Node && container.contains(event.target)) {
      return
    }
    reposition()
  }

  function hide() {
    window.removeEventListener("scroll", onScroll, true)
    window.removeEventListener("resize", reposition)
    container.remove()
  }

  return {
    show(element, nextRect) {
      getRect = nextRect
      container.replaceChildren(element)
      document.body.appendChild(container)
      window.addEventListener("scroll", onScroll, true)
      window.addEventListener("resize", reposition)
      reposition()
    },
    update(nextRect) {
      getRect = nextRect
      reposition()
    },
    hide,
    destroy() {
      hide()
      container.replaceChildren()
    },
  }
}
