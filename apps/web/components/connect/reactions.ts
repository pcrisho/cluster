import type { Liker } from "@/lib/connect-api"

const SHOWN_LIKERS = 3

/**
 * The likers after the signed-in person likes or unlikes, before the server answers: they go first,
 * and the count never names nobody ("and 1 more" with no avatar) while the request is in flight.
 */
export function withMyLike(
  likers: Liker[],
  me: Liker,
  liked: boolean
): Liker[] {
  const others = likers.filter((l) => l.id !== me.id)
  return liked ? [me, ...others].slice(0, SHOWN_LIKERS) : others
}

export type ReactionLabel =
  | { key: "likedBy"; values: { name: string } }
  | { key: "likedByTwo"; values: { first: string; second: string } }
  | { key: "andOthers"; values: { name: string; count: number } }
  | { key: "likes"; values: { count: number } }

/** Who the line under a post names: one or two people by name, or the newest one and a count of the rest. */
export function reactionLabel(count: number, likers: Liker[]): ReactionLabel {
  const [first, second] = likers
  if (!first) return { key: "likes", values: { count } }
  if (count === 1) return { key: "likedBy", values: { name: first.firstName } }
  if (count === 2 && second) {
    return {
      key: "likedByTwo",
      values: { first: first.firstName, second: second.firstName },
    }
  }
  return {
    key: "andOthers",
    values: { name: first.firstName, count: count - 1 },
  }
}
