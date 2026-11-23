import { api } from "./api"

export interface Notification {
  id: string
  userId: string
  type: string
  title: string
  body: string | null
  link: string | null
  payload: unknown
  readAt: string | null
  createdAt: string
}

export interface NotificationListMeta {
  cursor: string | null
  limit: number
}

export interface ListNotificationsResponse {
  success: boolean
  data: Notification[]
  meta: NotificationListMeta
}

export interface UnreadCountResponse {
  success: boolean
  data: { count: number }
}

export interface MarkReadResponse {
  success: boolean
  data: Notification
}

export interface ReadAllResponse {
  success: boolean
  data: { updated: number }
}

export interface ListNotificationsOpts {
  cursor?: string
  limit?: number
  unreadOnly?: boolean
}

export const notificationsApi = {
  async list(
    opts: ListNotificationsOpts = {}
  ): Promise<ListNotificationsResponse> {
    const params = new URLSearchParams()
    if (opts.cursor) params.set("cursor", opts.cursor)
    if (opts.limit !== undefined) params.set("limit", String(opts.limit))
    if (opts.unreadOnly !== undefined) {
      params.set("unreadOnly", String(opts.unreadOnly))
    }
    const qs = params.toString()
    return api.get<ListNotificationsResponse>(
      `/notifications${qs ? `?${qs}` : ""}`
    )
  },

  async unreadCount(): Promise<UnreadCountResponse> {
    return api.get<UnreadCountResponse>("/notifications/unread-count")
  },

  async markRead(id: string): Promise<MarkReadResponse> {
    return api.patch<MarkReadResponse>(`/notifications/${id}/read`, {})
  },

  async markAllRead(): Promise<ReadAllResponse> {
    return api.post<ReadAllResponse>("/notifications/read-all", {})
  },
}
