import type { AuthUser } from "./api"
import { canViewReports, reportQuery } from "./grow-api"

const user = (
  role: AuthUser["role"],
  options: Partial<Pick<AuthUser, "capabilities" | "managesArea">> = {}
): AuthUser => ({
  id: "user",
  email: "person@example.com",
  firstName: "Test",
  lastName: "Person",
  role,
  avatarUrl: null,
  locale: null,
  effectiveLocale: "en",
  isSuperAdmin: false,
  organizationId: "org",
  organization: {
    id: "org",
    name: "Org",
    slug: "org",
    timezone: "UTC",
    logoUrl: null,
    locale: null,
    theme: null,
    themingAllowed: false,
    memberProfileEditing: true,
    isolated: false,
  },
  modules: ["GROW"],
  capabilities: options.capabilities ?? [],
  managesArea: options.managesArea ?? false,
  mfaEnabled: false,
  recoveryCodesLeft: null,
  mfaRequired: false,
})

describe("canViewReports", () => {
  it("allows organization-wide and area-scoped report viewers", () => {
    expect(canViewReports(user("ADMIN"))).toBe(true)
    expect(canViewReports(user("MANAGER"))).toBe(true)
    expect(
      canViewReports(
        user("COLLABORATOR", { capabilities: ["GROW_COURSE_MANAGE"] })
      )
    ).toBe(true)
    expect(canViewReports(user("COLLABORATOR", { managesArea: true }))).toBe(
      true
    )
  })

  it("hides reports from collaborators without report scope", () => {
    expect(canViewReports(user("COLLABORATOR"))).toBe(false)
    expect(canViewReports(null)).toBe(false)
  })
})

describe("reportQuery", () => {
  it("serializes meaningful filters and omits defaults", () => {
    expect(
      reportQuery({
        courseId: ["course", "other"],
        orgNodeId: ["area"],
        positionId: ["position"],
        status: ["OVERDUE", "NOT_STARTED"],
        scope: "all",
        sort: "due",
        order: "desc",
        q: "  Ana  ",
        page: 2,
        pageSize: 25,
      })
    ).toBe(
      "courseId=course%2Cother&orgNodeId=area&positionId=position&status=OVERDUE%2CNOT_STARTED&scope=all&sort=due&order=desc&q=Ana&page=2&pageSize=25"
    )
    expect(
      reportQuery({ scope: "assigned", sort: "status", order: "asc", page: 1 })
    ).toBe("")
  })
})
