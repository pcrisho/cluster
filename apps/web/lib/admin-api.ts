import {
  api,
  requestFile,
  setTokens,
  type AuthUser,
  type Capability,
  type Locale,
  type ModuleKey,
  type Tokens,
  type UserRole,
} from "./api"
import type { GlassKey, Seeds } from "@cluster/theme"
import type { OrgNodeRef, PositionRef } from "./org-api"

// ── Public instance info (no auth) ──────────────────────────────────────────

export type AccessKind = "link" | "password"

// ── Bulk import (mirrors apps/api/src/modules/org/import/import-types.ts) ───

/** One problem in an import report; `code` is translated by `settings.import.codes.*`. */
export interface ImportIssue {
  row: number
  column?: string
  code: string
  params?: Record<string, string | number>
}

export interface ImportReport {
  rows: number
  create: number
  update: number
  unchanged: number
  /** Paths from the main node down, one per area to create. */
  nodesToCreate: string[][]
  managersReplaced: { node: string; from: string; to: string }[]
  errors: ImportIssue[]
  warnings: ImportIssue[]
}

export interface ImportResult {
  report: ImportReport
  created: number
  updated: number
  mainNodeIds: string[]
}

/** What an access grant gives: the link (INVITE or RESET) or the initial password, and until when. */
export interface AccessGrant {
  url?: string
  password?: string
  expiresAt: string
}

export interface PublicInstance {
  name: string
  registrationOpen: boolean
  /** False: the instance sends no e-mail, so flows offer access links from an administrator. */
  mailEnabled: boolean
  /** For people with no language of their own, and for signed-out pages. */
  defaultLocale: Locale
  /** The instance layer: the brand seeds and the glass level (`null` = Off). */
  theme: Seeds & { glassKey: GlassKey | null }
}

// ── Tenant administration (ADMIN) ───────────────────────────────────────────

export interface Organization {
  id: string
  name: string
  slug: string
  timezone: string
  /** Storage key of the logo; null = the default icon. */
  logoUrl: string | null
  /** The organization's ADMINs must sign in with 2FA. */
  requireAdminMfa: boolean
  /** Members who are not ADMIN may edit their own name, avatar, phone and bio. */
  memberProfileEditing: boolean
  /** Language of members with no choice; null = the instance's. */
  locale: Locale | null
  createdAt: string
  /** Active members. */
  memberCount: number
  enabledModules: ModuleKey[]
  availableModules: ModuleKey[]
  /** Main-node isolation: the instance allows it, whether the organization turned it on, and active people with no main node. */
  isolation: { allowed: boolean; enabled: boolean; peopleWithoutNode: number }
}

export interface ActivityEntry {
  id: string
  /** `<Entity>.<VERB>`, e.g. `Course.PUBLISH`. */
  action: string
  entityType: string
  entityId: string
  createdAt: string
  actor: {
    id: string
    firstName: string
    lastName: string
    avatarUrl: string | null
  }
}

export interface Member {
  id: string
  email: string
  firstName: string
  lastName: string
  role: UserRole
  isActive: boolean
  avatarUrl: string | null
  /** The instance administrator: a tenant ADMIN cannot change them. */
  isSuperAdmin: boolean
  invitationPending: boolean
  /** Two-step verification is on. */
  mfaEnabled: boolean
  createdAt: string
  /** The organization's own code for the person (e.g. from HR). */
  employeeCode: string | null
  profile: {
    orgNode: OrgNodeRef | null
    position: PositionRef | null
    phone: string | null
    /** ISO instant of a day at UTC midnight. */
    birthDate: string | null
    joinedAt: string
  } | null
}

export type MemberState = "ACTIVE" | "PENDING" | "DEACTIVATED"
export type MemberSort = "name" | "role"

/** What `GET /org/members` takes: the server filters, sorts and cuts the page. */
export interface MemberFilters {
  q?: string
  /** `ENABLED`: everyone not deactivated, invitations pending included. */
  status?: MemberState | "ENABLED"
  orgNodeId?: string
  sort?: MemberSort
  order?: "asc" | "desc"
  page?: number
  pageSize?: number
}

export interface MembersPage {
  total: number
  page: number
  pageSize: number
  items: Member[]
}

/** What an ADMIN may change of a member; days are `YYYY-MM-DD`, null clears. */
export interface MemberUpdate {
  role?: UserRole
  isActive?: boolean
  firstName?: string
  lastName?: string
  email?: string
  employeeCode?: string | null
  phone?: string | null
  birthDate?: string | null
  joinedAt?: string
}

// ── Instance administration (superadmin) ────────────────────────────────────

/** The settings row: the theme comes as its four columns, not as `theme`. */
export interface InstanceSettings extends Omit<PublicInstance, "theme">, Seeds {
  glassKey: GlassKey | null
  availableModules: ModuleKey[]
  orgThemingAllowed: boolean
  /** Organizations may isolate their main nodes (docs/specs/org/node-partitions). */
  nodeIsolationAllowed: boolean
  /** Refuse new passwords found in Have I Been Pwned. */
  passwordBreachCheck: boolean
}

export interface InstanceOrganization {
  id: string
  name: string
  slug: string
  isActive: boolean
  themingEnabled: boolean
  isolateRootNodes: boolean
  enabledModules: ModuleKey[]
  memberCount: number
  createdAt: string
}

export const adminApi = {
  getPublicInstance: () => api.get<PublicInstance>("/instance/public"),

  getOrganization: () => api.get<Organization>("/org"),
  updateOrganization: (
    data: Partial<
      Pick<
        Organization,
        | "name"
        | "timezone"
        | "enabledModules"
        | "logoUrl"
        | "locale"
        | "requireAdminMfa"
        | "memberProfileEditing"
      >
    > & {
      /** Write-only: the response carries `isolation.enabled` instead. */
      isolateRootNodes?: boolean
    }
  ) => api.patch<Organization>("/org", data),
  listActivity: (cursor?: string) =>
    api.get<{ items: ActivityEntry[]; nextCursor: string | null }>(
      `/org/activity?limit=20${cursor ? `&cursor=${cursor}` : ""}`
    ),

  listMembers: (filters: MemberFilters = {}) => {
    const params = new URLSearchParams()
    if (filters.q?.trim()) params.set("q", filters.q.trim())
    for (const key of [
      "status",
      "orgNodeId",
      "page",
      "pageSize",
      "sort",
      "order",
    ] as const) {
      if (filters[key] !== undefined) params.set(key, String(filters[key]))
    }
    const query = params.toString()
    return api.get<MembersPage>(`/org/members${query ? `?${query}` : ""}`)
  },
  createMember: (
    data: Pick<Member, "email" | "firstName" | "lastName" | "role"> & {
      /** Required for a collaborator while main nodes are isolated. */
      orgNodeId?: string
      positionId?: string
    }
  ) =>
    api.post<{ member: Member; inviteSent: boolean; mailEnabled: boolean }>(
      "/org/members",
      data
    ),
  updateMember: (id: string, data: MemberUpdate) =>
    api.patch<Member>(`/org/members/${id}`, data),
  listCapabilities: () =>
    api.get<{ capability: Capability; module: ModuleKey }[]>(
      "/org/capabilities"
    ),
  getMemberCapabilities: (id: string) =>
    api.get<{ capabilities: Capability[] }>(`/org/members/${id}/capabilities`),
  setMemberCapabilities: (id: string, capabilities: Capability[]) =>
    api.put<{ capabilities: Capability[] }>(`/org/members/${id}/capabilities`, {
      capabilities,
    }),
  /** Turns a member's 2FA off (lost phone): they are signed out everywhere and emailed. */
  resetMemberMfa: (id: string) => api.del<void>(`/org/members/${id}/mfa`),
  resendInvite: (id: string) =>
    api.post<{ inviteSent: boolean; mailEnabled: boolean }>(
      `/org/members/${id}/resend-invite`,
      {}
    ),
  /** The credentials workbook of a node's pending members; `X-Skipped-Active` counts the active ones left out. */
  exportAccess: (data: {
    nodeId: string
    kind: AccessKind
    lifetime: number
  }) => api.postFile("/org/access-export", data),
  /** Queues the pending members of a node's subtree for the paced sender (409 when mail is off). */
  queueInvitations: (nodeId: string) =>
    api.post<{ queued: number }>("/org/invitations", { nodeId }),
  /** A link or an initial password the administrator hands over; the secret is in this answer only. */
  issueAccess: (id: string, data: { kind: AccessKind; lifetime: number }) =>
    api.post<AccessGrant>(`/org/members/${id}/access`, data),

  /** The import template workbook. */
  importTemplate: () => requestFile("/org/import/template"),
  /** Plans the file without writing; file problems are 400s, row problems come in the report. */
  importPreview: (file: File) => {
    const body = new FormData()
    body.append("file", file)
    return api.upload<ImportReport>("/org/import/preview", body)
  },
  /** Applies the file in one transaction; a file with errors is a 422 whose body carries the report. */
  importApply: (file: File, sendInvitations: boolean) => {
    const body = new FormData()
    body.append("file", file)
    body.append("sendInvitations", String(sendInvitations))
    return api.upload<ImportResult>("/org/import/apply", body)
  },

  getInstanceSettings: () => api.get<InstanceSettings>("/instance/settings"),
  updateInstanceSettings: (
    data: Partial<Omit<InstanceSettings, keyof Seeds | "glassKey">> & {
      theme?: Seeds & { glassKey?: GlassKey | null }
    }
  ) => api.patch<InstanceSettings>("/instance/settings", data),
  listInstanceOrganizations: () =>
    api.get<InstanceOrganization[]>("/instance/organizations"),
  createInstanceOrganization: (data: {
    name: string
    timezone: string
    admin: { email: string; firstName: string; lastName: string }
  }) =>
    api.post<{ inviteSent: boolean; mailEnabled: boolean }>(
      "/instance/organizations",
      data
    ),
  updateInstanceOrganization: (
    id: string,
    data: { name?: string; isActive?: boolean; themingEnabled?: boolean }
  ) => api.patch(`/instance/organizations/${id}`, data),

  /** Signs out every other session; this device keeps working with the new session it returns. */
  changePassword: async (currentPassword: string, newPassword: string) => {
    const session = await api.patch<{ user: AuthUser } & Tokens>(
      "/auth/me/password",
      {
        currentPassword,
        newPassword,
      }
    )
    setTokens(session)
  },
  forgotPassword: (email: string) =>
    api.post<void>("/auth/forgot-password", { email }),
}
