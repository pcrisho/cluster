const OPEN_EVENT = "cluster:open-command-menu"

/** Opens the global command menu (the same one Ctrl/⌘ K opens) from anywhere, e.g. the sidebar's search button. */
export function openCommandMenu() {
  window.dispatchEvent(new Event(OPEN_EVENT))
}

/** Calls `onOpen` whenever `openCommandMenu` is called; returns the unsubscribe. */
export function onOpenCommandMenu(onOpen: () => void) {
  window.addEventListener(OPEN_EVENT, onOpen)
  return () => window.removeEventListener(OPEN_EVENT, onOpen)
}
