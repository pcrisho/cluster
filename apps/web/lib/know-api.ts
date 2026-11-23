import { api } from "./api"
import type { Principal, PrincipalType } from "./org-api"

export type SpaceIconType = "LUCIDE" | "EMOJI"
export type PageStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED"
export type AccessRole = "VIEWER" | "EDITOR" | "MANAGER"
export interface AccessEntry {
  id: string
  role: AccessRole
  principal: Principal
}

export interface Space {
  id: string
  name: string
  icon: string
  iconType: SpaceIconType
  emoji: string | null
  descriptionContent: unknown | null
  /** Only administrators and the people in the access list can read a restricted space. */
  restricted: boolean
  /** What the signed-in user can do here. */
  myRole: AccessRole
  organizationId: string
  createdBy: string
  createdByUser?: { id: string; firstName: string; lastName: string } | null
  createdAt: string
  updatedAt: string
  _count?: { pages: number }
}

export interface UpdateSpacePayload {
  name?: string
  icon?: string | null
  iconType?: SpaceIconType
  emoji?: string | null
  restricted?: boolean
}

export interface UploadedImage {
  key: string
  url: string
}

export type PageIconType = "LUCIDE" | "EMOJI"

export interface PageTreeNode {
  id: string
  title: string
  status: PageStatus
  order: number
  parentId: string | null
  authorId: string
  createdAt: string
  updatedAt: string
  publishedAt: string | null
  iconType: PageIconType
  icon: string | null
  emoji: string | null
  author: { id: string; firstName: string; lastName: string }
  lastEditedBy: { id: string; firstName: string; lastName: string } | null
  _count: { children: number; versions: number }
}

export interface PageDetail {
  id: string
  title: string
  content: unknown
  status: PageStatus
  order: number
  spaceId: string
  parentId: string | null
  iconType: PageIconType
  icon: string | null
  emoji: string | null
  authorId: string
  createdAt: string
  updatedAt: string
  publishedAt: string | null
  space: Pick<Space, "id" | "name" | "icon" | "iconType" | "emoji" | "myRole">
  author: {
    id: string
    firstName: string
    lastName: string
    avatarUrl: string | null
  }
  tags: { tag: { id: string; name: string } }[]
  _count: { versions: number; children: number }
}

/** A saved version as listed: no body. */
export interface PageVersionSummary {
  id: string
  pageId: string
  title: string
  authorId: string
  createdAt: string
  version: number
  author: { id: string; firstName: string; lastName: string }
}

export interface PageVersion extends PageVersionSummary {
  content: unknown
}

export interface Tag {
  id: string
  name: string
  organizationId: string
  _count?: { pages: number }
}

export interface SearchResult {
  id: string
  title: string
  status: string
  updatedAt: string
  space: { id: string; name: string }
  author: { id: string; firstName: string; lastName: string }
  _count: { versions: number }
}

export interface ApiResponse<T> {
  success: boolean
  data: T
}

export const knowApi = {
  // Spaces
  getSpaces: (search?: string) => {
    const params = search ? `?search=${encodeURIComponent(search)}` : ""
    return api.get<ApiResponse<Space[]>>(`/know/spaces${params}`)
  },

  getSpace: (id: string) => api.get<ApiResponse<Space>>(`/know/spaces/${id}`),

  createSpace: (data: {
    name: string
    icon?: string
    iconType?: SpaceIconType
    emoji?: string
    descriptionContent?: unknown
    restricted?: boolean
  }) => api.post<ApiResponse<Space>>("/know/spaces", data),

  updateSpace: (id: string, data: UpdateSpacePayload) =>
    api.patch<ApiResponse<Space>>(`/know/spaces/${id}`, data),

  deleteSpace: (id: string) => api.del<ApiResponse<null>>(`/know/spaces/${id}`),

  // Sharing (managers of the space and administrators)
  getAccess: (spaceId: string) =>
    api.get<{
      restricted: boolean
      entries: AccessEntry[]
      hiddenCount: number
    }>(`/know/spaces/${spaceId}/access`),

  addAccess: (
    spaceId: string,
    data: {
      principalType: PrincipalType
      principalId: string
      role: AccessRole
    }
  ) => api.post<AccessEntry>(`/know/spaces/${spaceId}/access`, data),

  setAccessRole: (spaceId: string, entryId: string, role: AccessRole) =>
    api.patch<AccessEntry>(`/know/spaces/${spaceId}/access/${entryId}`, {
      role,
    }),

  removeAccess: (spaceId: string, entryId: string) =>
    api.del<void>(`/know/spaces/${spaceId}/access/${entryId}`),

  // Pages
  getPageTree: (spaceId: string) =>
    api.get<ApiResponse<PageTreeNode[]>>(`/know/spaces/${spaceId}/pages`),

  getPage: (id: string) =>
    api.get<ApiResponse<PageDetail>>(`/know/pages/${id}`),

  createPage: (
    spaceId: string,
    data: {
      title: string
      content?: unknown
      status?: string
      parentId?: string
      tagIds?: string[]
      iconType?: PageIconType
      icon?: string
      emoji?: string
    }
  ) => api.post<ApiResponse<PageDetail>>(`/know/spaces/${spaceId}/pages`, data),

  // Title and body are not here: the API rejects them; they travel through the live document.
  updatePage: (
    id: string,
    data: {
      status?: string
      tagIds?: string[]
      iconType?: PageIconType
      icon?: string | null
      emoji?: string | null
    }
  ) => api.patch<ApiResponse<PageDetail>>(`/know/pages/${id}`, data),

  /** `parentId` null moves to the root; omitted keeps the parent and only reorders. */
  movePage: (id: string, data: { parentId?: string | null; index: number }) =>
    api.patch<{ success: boolean }>(`/know/pages/${id}/move`, data),

  deletePage: (id: string) => api.del<ApiResponse<null>>(`/know/pages/${id}`),

  updatePageStatus: (id: string, status: string) =>
    api.patch<ApiResponse<PageDetail>>(`/know/pages/${id}/status`, { status }),

  // Inline images embedded in the page body
  uploadPageImage: (pageId: string, file: File) => {
    const form = new FormData()
    form.append("file", file)
    return api.upload<ApiResponse<UploadedImage>>(
      `/know/pages/${pageId}/images`,
      form
    )
  },

  uploadSpaceImage: (spaceId: string, file: File) => {
    const form = new FormData()
    form.append("file", file)
    return api.upload<ApiResponse<UploadedImage>>(
      `/know/spaces/${spaceId}/images`,
      form
    )
  },

  deletePageImage: (pageId: string, key: string) =>
    api.del<ApiResponse<null>>(
      `/know/pages/${pageId}/images?key=${encodeURIComponent(key)}`
    ),

  // Markdown
  importMarkdown: (
    spaceId: string,
    data: { markdown: string; title?: string; parentId?: string }
  ) =>
    api.post<ApiResponse<PageDetail> & { dropped: string[] }>(
      `/know/spaces/${spaceId}/pages/import`,
      data
    ),

  exportPage: (id: string) =>
    api.get<
      ApiResponse<{ filename: string; markdown: string; lost: string[] }>
    >(`/know/pages/${id}/export`),

  // Versions
  createPageVersion: (pageId: string) =>
    api.post<ApiResponse<PageVersion>>(`/know/pages/${pageId}/versions`, {}),

  getPageVersions: (pageId: string) =>
    api.get<ApiResponse<PageVersionSummary[]>>(
      `/know/pages/${pageId}/versions`
    ),

  getPageVersion: (pageId: string, versionId: string) =>
    api.get<ApiResponse<PageVersion>>(
      `/know/pages/${pageId}/versions/${versionId}`
    ),

  restorePageVersion: (pageId: string, versionId: string) =>
    api.post<ApiResponse<PageDetail>>(
      `/know/pages/${pageId}/restore/${versionId}`,
      {}
    ),

  // Tags
  getTags: () => api.get<ApiResponse<Tag[]>>("/know/tags"),

  createTag: (name: string) =>
    api.post<ApiResponse<Tag>>("/know/tags", { name }),

  deleteTag: (id: string) => api.del<ApiResponse<null>>(`/know/tags/${id}`),

  // Search
  search: (q: string, spaceId?: string) => {
    const params = new URLSearchParams({ q })
    if (spaceId) params.set("spaceId", spaceId)
    return api.get<ApiResponse<SearchResult[]>>(`/know/search?${params}`)
  },
}
