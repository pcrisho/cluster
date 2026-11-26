import { api } from "@/lib/api"

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api/v1"

import type {
  DocumentEnvelope,
  DocumentListItem,
  DocumentVersionRestored,
  DocumentVersion,
  DocumentVersionCreated,
  PageMentionSearchResult,
} from "./types"

/**
 * HTTP client for the transversal `documents` module. Every
 * function returns a typed promise; consumers don't see fetch
 * details. Errors are surfaced as thrown `Error` with the
 * server's message.
 *
 * All routes go through the same JWT-aware `api` helper used by
 * the rest of the app, so refresh + 401 handling are free.
 */

/** What a document is attached to: a page or a space (the API keeps exactly one). */
export type DocumentOwner = { kind: "page" | "space"; id: string }

const ownerPath = (owner: DocumentOwner) =>
  `/know/${owner.kind === "page" ? "pages" : "spaces"}/${owner.id}/documents`

export const documentsApi = {
  // ── Document CRUD ─────────────────────────────────────

  /** Create the first version of a document on a page or a space. */
  create: async (
    owner: DocumentOwner,
    file: File,
    options?: { name?: string; note?: string }
  ): Promise<DocumentListItem> => {
    const form = new FormData()
    form.append("file", file)
    if (options?.name) form.append("name", options.name)
    if (options?.note) form.append("note", options.note)
    const res = await api.upload<DocumentEnvelope<DocumentListItem>>(
      ownerPath(owner),
      form
    )
    return res.data
  },

  list: (owner: DocumentOwner) =>
    api.get<{ success: boolean; data: DocumentListItem[] }>(ownerPath(owner)),

  remove: (documentId: string) =>
    api.del<void>(`/know/documents/${documentId}`),

  // ── Versions ───────────────────────────────────────────

  listVersions: (documentId: string) =>
    api.get<{ success: boolean; data: DocumentVersion[] }>(
      `/know/documents/${documentId}/versions`
    ),

  newVersion: async (
    documentId: string,
    file: File,
    options?: { note?: string }
  ): Promise<DocumentVersionCreated> => {
    const form = new FormData()
    form.append("file", file)
    if (options?.note) form.append("note", options.note)
    const res = await api.upload<DocumentEnvelope<DocumentVersionCreated>>(
      `/know/documents/${documentId}/versions`,
      form
    )
    return res.data
  },

  restoreVersion: (documentId: string, versionId: string) =>
    api
      .post<
        DocumentEnvelope<DocumentVersionRestored>
      >(`/know/documents/${documentId}/versions/${versionId}/restore`, {})
      .then((res) => res.data),

  /** Absolute URL that downloads a version (`Content-Disposition: attachment`). */
  downloadUrl: (documentId: string, versionId: string): string =>
    `${API_BASE}/know/documents/${documentId}/versions/${versionId}/download`,

  /**
   * Absolute URL for the in-app viewer: `inline` for PDF and raster images,
   * still `attachment` for every other type (the API decides).
   */
  previewUrl: (documentId: string, versionId: string): string =>
    `${documentsApi.downloadUrl(documentId, versionId)}?inline=1`,
}

/**
 * Page mention search used by the rich-text editor's
 * `@mention` picker. Lives here because it's a transversal
 * search surface (KNOW uses it today, GROW may too once
 * pages are supported there).
 */
export const pageMentionsApi = {
  search: (q: string, options?: { limit?: number; spaceId?: string }) => {
    const params = new URLSearchParams()
    if (q) params.set("q", q)
    if (options?.limit) params.set("limit", String(options.limit))
    if (options?.spaceId) params.set("spaceId", options.spaceId)
    const qs = params.toString()
    return api.get<{ success: boolean; data: PageMentionSearchResult[] }>(
      `/know/pages/search${qs ? `?${qs}` : ""}`
    )
  },
}
