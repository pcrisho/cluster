export type FilterField =
  | "name"
  | "email"
  | "bio"
  | "area"
  | "position"
  | "role"

export type TextOp = "contains" | "not_contains" | "starts_with" | "ends_with"
export type ListOp = "in" | "not_in"
export type FilterOperator = TextOp | ListOp

/** A field's name is `connect.directory.fields.<field>` in the catalogs, an operator's `connect.directory.operators.<op>`. */
export interface FilterFieldConfig {
  field: FilterField
  type: "text" | "select"
  operators: FilterOperator[]
}

export interface DirectoryFilter {
  id: string
  field: FilterField
  operator: FilterOperator
  values: string[]
}

export const FILTER_FIELDS: FilterFieldConfig[] = [
  {
    field: "name",
    type: "text",
    operators: ["contains", "not_contains", "starts_with", "ends_with"],
  },
  {
    field: "email",
    type: "text",
    operators: ["contains", "not_contains", "starts_with", "ends_with"],
  },
  {
    field: "bio",
    type: "text",
    operators: ["contains", "not_contains", "starts_with", "ends_with"],
  },
  {
    field: "area",
    type: "select",
    operators: ["in", "not_in"],
  },
  {
    field: "position",
    type: "select",
    operators: ["in", "not_in"],
  },
  {
    field: "role",
    type: "select",
    operators: ["in", "not_in"],
  },
]

/** Tenant roles a filter can pick; names are `common.roles.<ROLE>`. */
export const ROLES = ["ADMIN", "MANAGER", "COLLABORATOR"] as const

export function getDefaultOperator(type: "text" | "select"): FilterOperator {
  return type === "text" ? "contains" : "in"
}

export function getFieldConfig(field: FilterField): FilterFieldConfig {
  return FILTER_FIELDS.find((f) => f.field === field)!
}

interface DirectoryApiParams {
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
}

export function filtersToApiParams(
  filters: DirectoryFilter[],
  search?: string,
  page?: number,
  sort?: "name-asc" | "name-desc"
): DirectoryApiParams {
  const params: DirectoryApiParams = {
    search: search || undefined,
    page,
    sort,
    limit: 20,
  }

  for (const f of filters) {
    if (f.values.length === 0) continue
    switch (f.field) {
      case "name":
        params.name = f.values[0]
        params.nameOp = f.operator as DirectoryApiParams["nameOp"]
        break
      case "email":
        params.email = f.values[0]
        params.emailOp = f.operator as DirectoryApiParams["emailOp"]
        break
      case "bio":
        params.bio = f.values[0]
        params.bioOp = f.operator as DirectoryApiParams["bioOp"]
        break
      case "area":
        params.orgNodeIds = f.values
        params.orgNodeIdsOp = f.operator as DirectoryApiParams["orgNodeIdsOp"]
        break
      case "position":
        params.positionIds = f.values
        params.positionIdsOp = f.operator as DirectoryApiParams["positionIdsOp"]
        break
      case "role":
        params.roles = f.values
        params.rolesOp = f.operator as DirectoryApiParams["rolesOp"]
        break
    }
  }

  return params
}

/** An option of a select field's value combobox. */
export interface SelectOption {
  value: string
  label: string
}
