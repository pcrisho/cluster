import { api, type UserRole } from "./api"
import type { ManagerRef, OrgNodeRef, PositionRef, Principal, PrincipalType } from "./org-api"

export interface Author {
  id: string
  firstName: string
  lastName: string
  avatarUrl: string | null
  role: string
}

/** A person who liked a post: what the card needs to name them. */
export type Liker = Pick<Author, "id" | "firstName" | "lastName" | "avatarUrl">

export interface PostCount {
  likes: number
  comments: number
}

export interface Post {
  id: string
  type: "POST" | "ANNOUNCEMENT"
  isPinned: boolean
  pinnedExpiresAt: string | null
  title: string | null
  /** Serialized TipTap document (validated by the API against the editor schema). */
  body: string
  excerpt: string | null
  images: string[]
  restricted: boolean
  audience: Principal[]
  hiddenAudienceCount?: number
  authorId: string
  createdAt: string
  updatedAt: string
  author: Author
  _count: PostCount
  likedByMe: boolean
  recentLikers: Liker[]
}

export interface Comment {
  id: string
  body: string
  authorId: string
  postId: string
  createdAt: string
  updatedAt: string
  author: Author
}

export interface FeedMeta {
  cursor: string | null
  limit: number
}

export interface CreatePostData {
  title?: string
  /** Serialized TipTap document; the API rejects HTML. */
  body: string
  excerpt?: string
  images?: string[]
  type?: "POST" | "ANNOUNCEMENT"
  isPinned?: boolean
  pinnedExpiresAt?: string
  restricted?: boolean
  audience?: { type: PrincipalType; id: string }[]
}

export interface FeedResponse {
  success: boolean
  data: Post[]
  meta: FeedMeta
}

export interface DirectoryUser {
  id: string
  firstName: string
  lastName: string
  role: UserRole
  avatarUrl: string | null
  profile: {
    bio: string | null
    orgNode: OrgNodeRef | null
    position: PositionRef | null
  } | null
}

export interface DirectoryMeta {
  total: number
  page: number
  limit: number
}

export interface DirectoryResponse {
  success: boolean
  data: DirectoryUser[]
  meta: DirectoryMeta
}

export interface ProfileDetail {
  id: string
  firstName: string
  lastName: string
  email: string
  role: UserRole
  avatarUrl: string | null
  createdAt: string
  profile: {
    bio: string | null
    phone: string | null
    joinedAt: string
    showBirthday: boolean
    /** Full years in the organization, or null while the organization does not show anniversaries (or under one year). */
    yearsInOrganization: number | null
    /** `path`: names from the root area down to this one. */
    orgNode:
      | (OrgNodeRef & { manager: ManagerRef | null; path?: string[] })
      | null
    position: PositionRef | null
  } | null
}

export const connectApi = {
  getFeed: (cursor?: string, limit = 20, sort: "top" | "recent" = "top") => {
    const params = new URLSearchParams()
    if (cursor) params.set("cursor", cursor)
    params.set("limit", String(limit))
    params.set("sort", sort)
    return api.get<FeedResponse>(`/connect/feed?${params}`)
  },

  createPost: (data: CreatePostData) =>
    api.post<{ success: boolean; data: Post }>("/connect/posts", data),

  updatePost: (id: string, data: Partial<CreatePostData>) =>
    api.patch<{ success: boolean; data: Post }>(`/connect/posts/${id}`, data),

  deletePost: (id: string) =>
    api.del<{ success: boolean }>(`/connect/posts/${id}`),

  toggleLike: (postId: string) =>
    api.post<{
      success: boolean
      data: { liked: boolean; likesCount: number; recentLikers: Liker[] }
    }>(`/connect/posts/${postId}/like`, {}),

  getLikes: (postId: string, cursor?: string, limit = 20) => {
    const params = new URLSearchParams({ limit: String(limit) })
    if (cursor) params.set("cursor", cursor)
    return api.get<{
      success: boolean
      data: Liker[]
      meta: { cursor?: string; limit: number }
    }>(`/connect/posts/${postId}/likes?${params}`)
  },

  getComments: (postId: string) =>
    api.get<{ success: boolean; data: Comment[] }>(
      `/connect/posts/${postId}/comments`
    ),

  createComment: (postId: string, body: string) =>
    api.post<{ success: boolean; data: Comment }>(
      `/connect/posts/${postId}/comments`,
      { body }
    ),

  deleteComment: (commentId: string) =>
    api.del<{ success: boolean }>(`/connect/comments/${commentId}`),

  getDirectory: (params?: {
    search?: string
    name?: string
    nameOp?: "contains" | "not_contains" | "starts_with" | "ends_with"
    email?: string
    emailOp?: "contains" | "not_contains" | "starts_with" | "ends_with"
    bio?: string
    bioOp?: "contains" | "not_contains" | "starts_with" | "ends_with"
    orgNodeIds?: string[]
    orgNodeIdsOp?: "in" | "not_in"
    positionIds?: string[]
    positionIdsOp?: "in" | "not_in"
    roles?: string[]
    rolesOp?: "in" | "not_in"
    page?: number
    limit?: number
    sort?: "name-asc" | "name-desc"
  }) => {
    const query = new URLSearchParams()
    if (params?.search) query.set("search", params.search)
    if (params?.name) query.set("name", params.name)
    if (params?.nameOp) query.set("nameOp", params.nameOp)
    if (params?.email) query.set("email", params.email)
    if (params?.emailOp) query.set("emailOp", params.emailOp)
    if (params?.bio) query.set("bio", params.bio)
    if (params?.bioOp) query.set("bioOp", params.bioOp)
    if (params?.orgNodeIds?.length)
      query.set("orgNodeIds", params.orgNodeIds.join(","))
    if (params?.orgNodeIdsOp) query.set("orgNodeIdsOp", params.orgNodeIdsOp)
    if (params?.positionIds?.length)
      query.set("positionIds", params.positionIds.join(","))
    if (params?.positionIdsOp) query.set("positionIdsOp", params.positionIdsOp)
    if (params?.roles?.length) query.set("roles", params.roles.join(","))
    if (params?.rolesOp) query.set("rolesOp", params.rolesOp)
    if (params?.page) query.set("page", String(params.page))
    if (params?.limit) query.set("limit", String(params.limit))
    if (params?.sort) query.set("sort", params.sort)
    const qs = query.toString()
    return api.get<DirectoryResponse>(`/connect/directory${qs ? `?${qs}` : ""}`)
  },

  getProfile: (userId: string) =>
    api.get<{ success: boolean; data: ProfileDetail }>(
      `/connect/directory/${userId}`
    ),

  getTodayCelebrations: () =>
    api.get<{
      success: boolean
      data: {
        birthdays: CelebrationItem[]
        anniversaries: CelebrationItem[]
      }
    }>("/connect/celebrations/today"),

  toggleReaction: (data: {
    targetUserId: string
    type: "BIRTHDAY" | "ANNIVERSARY"
    emoji: string
  }) =>
    api.post<{
      success: boolean
      data: { reacted: boolean; emoji: string | null }
    }>("/connect/celebrations/reactions", data),

  getCelebrationsSettings: () =>
    api.get<{
      success: boolean
      data: {
        celebrationsEnabled: boolean
        showBirthdays: boolean
        showAnniversaries: boolean
      }
    }>("/connect/celebrations/settings"),

  updateCelebrationsSettings: (data: {
    celebrationsEnabled?: boolean
    showBirthdays?: boolean
    showAnniversaries?: boolean
  }) =>
    api.patch<{ success: boolean; data: unknown }>(
      "/connect/celebrations/settings",
      data
    ),
}

export interface CelebrationItem {
  id: string
  firstName: string
  lastName: string
  avatarUrl: string | null
  type: "BIRTHDAY" | "ANNIVERSARY"
  age?: number
  years?: number
  reacted: boolean
  reaction: string | null
}
