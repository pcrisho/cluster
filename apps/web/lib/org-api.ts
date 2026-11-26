import type { Seeds } from "@cluster/theme"
import { api } from "./api"

/** Organization structure (areas, positions, assignment) and the caller's own profile. Core API, not tied to a feature module. */

export type PrincipalType = "USER" | "ORG_NODE" | "POSITION"

/** Someone access or a course can be granted to: a person, an area (with its sub-areas) or a position. */
export interface Principal {
  type: PrincipalType
  id: string
  name: string
  /** Email for people. */
  detail?: string
  /** Only for `ORG_NODE`: true when the node has no parent (a main node). */
  main?: boolean
}

export interface OrgNodeRef {
  id: string
  name: string
  path?: string[]
}

export interface ManagerRef {
  id: string
  firstName: string
  lastName: string
  avatarUrl: string | null
  position: { name: string } | null
}

export interface PositionRef {
  id: string
  name: string
}

export interface MyProfile {
  id: string
  userId: string
  bio: string | null
  phone: string | null
  showBirthday: boolean
  orgNode: OrgNodeRef | null
  position: PositionRef | null
}

/** An area of the org chart. */
export interface OrgNode {
  id: string
  name: string
  icon: string | null
  sortOrder: number
  parentId: string | null
  managerId: string | null
  manager: {
    id: string
    firstName: string
    lastName: string
    avatarUrl: string | null
    isActive: boolean
  } | null
  isActive: boolean
  archivedAt: string | null
  /** Stable identifier (RUC, client code); upper-cased by the API, unique in the organization. */
  code: string | null
  /** Label of a main node: its own structure (false) or a client or partner (true). */
  external: boolean
  _count: { profiles: number }
}

export interface Position {
  id: string
  name: string
  description: string | null
  color: string | null
  isActive: boolean
  orgNodeId: string | null
  orgNode: { id: string; name: string } | null
  _count: { profiles: number }
}

export interface AreaPosition {
  id: string
  name: string
  color: string | null
  _count: { profiles: number }
}

export interface FullOrgChartData {
  nodes: (OrgNode & { positions: AreaPosition[] })[]
  globalPositions: AreaPosition[]
}

export const orgApi = {
  /** Sets or clears (nulls) the organization's theme; 403 ORG_THEMING_DISABLED when not allowed. */
  updateTheme: (seeds: Seeds) => api.patch<Seeds>("/org/theme", seeds),

  getMyProfile: () =>
    api.get<{ success: boolean; data: MyProfile | null }>("/profile/me"),

  updateMyProfile: (data: {
    bio?: string
    phone?: string
    showBirthday?: boolean
  }) => api.patch<{ success: boolean; data: MyProfile }>("/profile/me", data),

  // Areas
  getAreas: () => api.get<{ success: boolean; data: OrgNode[] }>("/org/areas"),

  getFullAreas: () =>
    api.get<{ success: boolean; data: FullOrgChartData }>("/org/areas/full"),

  createArea: (data: {
    name: string
    icon?: string | null
    parentId?: string | null
    sortOrder?: number
    managerId?: string | null
    code?: string | null
    external?: boolean
  }) => api.post<{ success: boolean; data: OrgNode }>("/org/areas", data),

  updateArea: (
    id: string,
    data: {
      name?: string
      icon?: string | null
      sortOrder?: number
      managerId?: string | null
      code?: string | null
      external?: boolean
    }
  ) => api.patch<{ success: boolean; data: OrgNode }>(`/org/areas/${id}`, data),

  moveArea: (
    id: string,
    /** `beforeId`: the sibling to go before; omitted or null goes last. */
    data: { newParentId?: string | null; beforeId?: string | null }
  ) =>
    api.patch<{ success: boolean; data: OrgNode }>(
      `/org/areas/${id}/move`,
      data
    ),

  archiveArea: (id: string, reassignTo: string) =>
    api.del<{ success: boolean }>(`/org/areas/${id}?reassignTo=${reassignTo}`),

  // Positions
  getPositions: (includeInactive = false) =>
    api.get<{ success: boolean; data: Position[] }>(
      `/org/positions${includeInactive ? "?includeInactive=true" : ""}`
    ),

  getPositionsForArea: (areaId: string) =>
    api.get<{ success: boolean; data: Position[] }>(
      `/org/positions/for-area/${areaId}`
    ),

  createPosition: (data: {
    name: string
    description?: string
    color?: string
    orgNodeId?: string | null
  }) => api.post<{ success: boolean; data: Position }>("/org/positions", data),

  updatePosition: (
    id: string,
    data: {
      name?: string
      description?: string
      color?: string | null
      orgNodeId?: string | null
    }
  ) =>
    api.patch<{ success: boolean; data: Position }>(
      `/org/positions/${id}`,
      data
    ),

  archivePosition: (id: string) =>
    api.post<{ success: boolean; data: Position }>(
      `/org/positions/${id}/archive`,
      {}
    ),

  deletePosition: (id: string) =>
    api.del<{ success: boolean }>(`/org/positions/${id}`),

  // Assignment (admin): the member's area and/or position
  setAssignment: (
    userId: string,
    data: { orgNodeId?: string | null; positionId?: string | null }
  ) =>
    api.patch<{
      success: boolean
      data: { orgNodeId: string | null; positionId: string | null }
    }>(`/org/members/${userId}/assignment`, data),

  /** Active people, live areas and active positions whose name matches. */
  searchPrincipals: (q: string) =>
    api.get<Principal[]>(`/org/principals?q=${encodeURIComponent(q)}`),
}
