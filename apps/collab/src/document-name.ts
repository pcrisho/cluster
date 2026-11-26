// Same pattern as the API (apps/api, collab internal routes); keep them in sync.
const DOCUMENT_NAME = /^[a-z]+(\.[a-z]+)*:[0-9a-f-]{36}$/

export class InvalidDocumentNameError extends Error {
  constructor(name: unknown) {
    super(
      `Invalid document name: ${typeof name === "string" ? name : typeof name}`
    )
    this.name = "InvalidDocumentNameError"
  }
}

export function parseDocumentName(name: string): { kind: string; id: string } {
  if (typeof name !== "string" || !DOCUMENT_NAME.test(name)) {
    throw new InvalidDocumentNameError(name)
  }
  const separator = name.indexOf(":")
  return { kind: name.slice(0, separator), id: name.slice(separator + 1) }
}
