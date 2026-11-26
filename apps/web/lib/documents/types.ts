/**
 * Public types for the transversal `documents` module.
 *
 * These mirror the backend's `documents` service shape and are
 * shared by every consumer (KNOW today, GROW tomorrow). The
 * transversal module is the single source of truth; consumers
 * import from here rather than re-defining the shape.
 */

export interface DocumentVersion {
  id: string
  documentId: string
  version: number
  mimetype: string
  size: number
  key: string
  authorId: string
  note: string | null
  createdAt: string
  author?: {
    id: string
    firstName: string
    lastName: string
  }
}

export interface DocumentListItem {
  id: string
  /** Exactly one of the two is set. */
  pageId: string | null
  spaceId: string | null
  name: string
  versionsCount: number
  currentVersion: {
    id: string
    version: number
    mimetype: string
    size: number
    url: string
  }
  createdById: string
  createdAt: string
  updatedAt: string
}

/** Every documents route answers `{ success, data }`. */
export interface DocumentEnvelope<T> {
  success: boolean
  data: T
}

export interface DocumentVersionCreated {
  id: string
  version: number
  mimetype: string
  size: number
  url: string
}

export interface DocumentVersionRestored {
  id: string
  currentVersionId: string
}

export interface PageMentionSearchResult {
  id: string
  title: string
  spaceId: string
  spaceName: string
  updatedAt: string
  archived: boolean
}
