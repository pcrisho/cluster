/** Downloads a blob under `name`, as the browser would any file. */
export function saveFile(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = name
  anchor.click()
  // Revoked on the next tick: Firefox cancels a download whose URL is revoked during the click.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
