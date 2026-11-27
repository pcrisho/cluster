import { audienceForViewer, canOpenPostToAll, canReadPost, isFeedModerator, visiblePostWhere } from "./post-access"
import { PrincipalType } from "../org/principal"

describe("post-access pure rules", () => {
  const moderator = { id: "u-mod", orgId: "org1", role: "MANAGER", isSuperAdmin: false }
  const author = { id: "u-a", orgId: "org1", role: "COLLABORATOR", capabilities: [], isSuperAdmin: false }
  const ctxA = { userId: "u-a", orgNodeIds: ["area-a", "root-a"], positionId: "pos-a" }
  const ctxB = { userId: "u-b", orgNodeIds: ["area-b", "root-b"], positionId: "pos-b" }

  it("identifies feed moderators and open-post permission", () => {
    expect(isFeedModerator(moderator)).toBe(true)
    expect(isFeedModerator({ role: "ADMIN", isSuperAdmin: false })).toBe(true)
    expect(isFeedModerator({ role: "COLLABORATOR", isSuperAdmin: true })).toBe(true)
    expect(isFeedModerator(author)).toBe(false)

    expect(canOpenPostToAll(author, false)).toBe(true)
    expect(canOpenPostToAll(author, true)).toBe(false)
    expect(canOpenPostToAll({ role: "COLLABORATOR", capabilities: ["GROW_COURSE_MANAGE"], isSuperAdmin: false }, true)).toBe(true)
  })

  it("checks single-post readability consistently with visiblePostWhere", () => {
    const open = { restricted: false, authorId: "u-x", audience: [] }
    const targeted = {
      restricted: true,
      authorId: "u-x",
      audience: [{ userId: null, orgNodeId: "root-a", positionId: null }],
    }

    expect(canReadPost(author, open, ctxA)).toBe(true)
    expect(canReadPost(author, targeted, ctxA)).toBe(true)
    expect(canReadPost({ id: "u-b", role: "COLLABORATOR", isSuperAdmin: false }, targeted, ctxB)).toBe(false)
    expect(canReadPost({ id: "u-x", role: "COLLABORATOR", isSuperAdmin: false }, targeted, ctxB)).toBe(true)
    expect(canReadPost(moderator, targeted, null)).toBe(true)

    expect(visiblePostWhere(moderator, null)).toEqual({ organizationId: "org1" })
    expect(visiblePostWhere(author, ctxA)).toMatchObject({ organizationId: "org1", OR: expect.any(Array) })
  })

  it("filters out audience entries outside scope and counts hiddenAudienceCount", () => {
    const entries = [
      {
        userId: "u1",
        orgNodeId: null,
        positionId: null,
        user: { id: "u1", firstName: "Ana", lastName: "A", email: "a@x.com", profile: { orgNodeId: "area-a" } },
      },
      {
        userId: null,
        orgNodeId: "root-b",
        positionId: null,
        orgNode: { id: "root-b", name: "Client B", parentId: null },
      },
      {
        userId: null,
        orgNodeId: null,
        positionId: "pos-global",
        position: { id: "pos-global", name: "Global", orgNodeId: null, orgNode: null },
      },
    ]

    const scoped = audienceForViewer(entries, { all: false, nodeIds: new Set(["root-a", "area-a"]) })
    expect(scoped.hiddenAudienceCount).toBe(2)
    expect(scoped.audience).toEqual([{ type: PrincipalType.USER, id: "u1", name: "Ana A", detail: "a@x.com" }])

    const full = audienceForViewer(entries, { all: true })
    expect(full.hiddenAudienceCount).toBe(0)
    expect(full.audience).toHaveLength(3)
  })
})
