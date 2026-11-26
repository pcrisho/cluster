import type { Liker } from "@/lib/connect-api"
import { reactionLabel, withMyLike } from "./reactions"

const person = (id: string): Liker => ({
  id,
  firstName: id,
  lastName: "X",
  avatarUrl: null,
})

describe("withMyLike", () => {
  it("puts me first and keeps three at most", () => {
    const result = withMyLike(
      [person("a"), person("b"), person("c")],
      person("me"),
      true
    )
    expect(result.map((l) => l.id)).toEqual(["me", "a", "b"])
  })

  it("never lists me twice", () => {
    const result = withMyLike([person("a"), person("me")], person("me"), true)
    expect(result.map((l) => l.id)).toEqual(["me", "a"])
  })

  it("takes me out when I unlike", () => {
    const result = withMyLike([person("me"), person("a")], person("me"), false)
    expect(result.map((l) => l.id)).toEqual(["a"])
  })
})

describe("reactionLabel", () => {
  it("names one or two people", () => {
    expect(reactionLabel(1, [person("a")])).toEqual({
      key: "likedBy",
      values: { name: "a" },
    })
    expect(reactionLabel(2, [person("a"), person("b")])).toEqual({
      key: "likedByTwo",
      values: { first: "a", second: "b" },
    })
  })

  it("names the newest person and counts everyone else", () => {
    expect(reactionLabel(5, [person("a"), person("b"), person("c")])).toEqual({
      key: "andOthers",
      values: { name: "a", count: 4 },
    })
    // Two likes but only one liker known: still names somebody, never a bare "and 1 more".
    expect(reactionLabel(2, [person("a")])).toEqual({
      key: "andOthers",
      values: { name: "a", count: 1 },
    })
  })

  it("falls back to the bare count when nobody is known", () => {
    expect(reactionLabel(3, [])).toEqual({ key: "likes", values: { count: 3 } })
  })
})
