import {
  type DirectoryFilter,
  type FilterField,
  type FilterOperator,
  FILTER_FIELDS,
} from "@/lib/directory-filters"

export type DirectoryView = "table" | "grid" | "tree"
export type DirectorySortKey = "name-asc" | "name-desc"

export const PAGE_SIZES = [10, 25, 50] as const

/** Everything the directory screen remembers; it lives in the URL. */
export interface DirectoryUrlState {
  view: DirectoryView
  search: string
  filters: DirectoryFilter[]
  sort: DirectorySortKey
  page: number
  pageSize: number
}

export const DEFAULT_DIRECTORY_STATE: DirectoryUrlState = {
  view: "table",
  search: "",
  filters: [],
  sort: "name-asc",
  page: 1,
  pageSize: 25,
}

const VIEWS: DirectoryView[] = ["table", "grid", "tree"]

/** `f=<field>:<operator>:<value>|<value>`, each value URI-encoded so `:` and `|` survive. */
function encodeFilter(f: DirectoryFilter): string {
  return `${f.field}:${f.operator}:${f.values.map(encodeURIComponent).join("|")}`
}

function decodeFilter(raw: string): DirectoryFilter | null {
  const [field, operator, values = ""] = raw.split(":")
  const config = FILTER_FIELDS.find((c) => c.field === field)
  if (!config || !config.operators.includes(operator as FilterOperator))
    return null
  const list = values ? values.split("|").map(decodeURIComponent) : []
  return {
    id: field,
    field: field as FilterField,
    operator: operator as FilterOperator,
    values: config.type === "text" ? list.slice(0, 1) : list,
  }
}

/** Reads the state from the query string; anything invalid falls back to its default. */
export function parseDirectoryUrl(params: URLSearchParams): DirectoryUrlState {
  const d = DEFAULT_DIRECTORY_STATE
  const view = params.get("view")
  const sort = params.get("sort")
  const page = Number(params.get("page"))
  const size = Number(params.get("size"))
  const seen = new Set<string>()
  const filters: DirectoryFilter[] = []
  for (const raw of params.getAll("f")) {
    let f: DirectoryFilter | null = null
    try {
      f = decodeFilter(raw)
    } catch {
      // A malformed escape: drop that filter.
    }
    // One filter per field, as the "Add filter" menu enforces.
    if (f && !seen.has(f.field)) {
      seen.add(f.field)
      filters.push(f)
    }
  }
  return {
    view: VIEWS.includes(view as DirectoryView)
      ? (view as DirectoryView)
      : d.view,
    search: params.get("q") ?? d.search,
    filters,
    sort: sort === "name-desc" ? "name-desc" : d.sort,
    page: Number.isInteger(page) && page > 0 ? page : d.page,
    pageSize: (PAGE_SIZES as readonly number[]).includes(size)
      ? size
      : d.pageSize,
  }
}

/** The query string for a state; defaults are left out so the plain directory URL stays clean. */
export function serializeDirectoryUrl(
  state: DirectoryUrlState
): URLSearchParams {
  const d = DEFAULT_DIRECTORY_STATE
  const out = new URLSearchParams()
  if (state.view !== d.view) out.set("view", state.view)
  if (state.search) out.set("q", state.search)
  for (const f of state.filters) out.append("f", encodeFilter(f))
  if (state.sort !== d.sort) out.set("sort", state.sort)
  if (state.page !== d.page) out.set("page", String(state.page))
  if (state.pageSize !== d.pageSize) out.set("size", String(state.pageSize))
  return out
}

/** The directory table already filtered by some areas (a node of the org chart). */
export function directoryHrefForAreas(areaIds: string[]): string {
  const query = serializeDirectoryUrl({
    ...DEFAULT_DIRECTORY_STATE,
    filters: [{ id: "area", field: "area", operator: "in", values: areaIds }],
  })
  return `/connect/directory?${query}`
}
