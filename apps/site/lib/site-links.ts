// Optional outbound links, set at build time. Unset or not https → the link is not shown
// (the repository is private until it is published; the docs site comes later).
export function parseHttpsUrl(raw: string | null | undefined): string | null {
  const value = raw?.trim()
  if (!value) return null
  try {
    const url = new URL(value)
    return url.protocol === "https:" ? url.toString() : null
  } catch {
    return null
  }
}

export function getGithubUrl(): string | null {
  return parseHttpsUrl(process.env.NEXT_PUBLIC_GITHUB_URL)
}

export function getDocsUrl(): string | null {
  return parseHttpsUrl(process.env.NEXT_PUBLIC_DOCS_URL)
}
