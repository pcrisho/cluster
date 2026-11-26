import { Prisma } from "@prisma/client"
import {
  DirectoryQueryDto,
  ListFilterOp,
  TextFilterOp,
} from "./dto/directory-query.dto"

const mode = "insensitive" as const

const textMatch = (value: string, op: TextFilterOp = TextFilterOp.CONTAINS): Prisma.StringFilter => {
  switch (op) {
    case TextFilterOp.STARTS_WITH:
      return { startsWith: value, mode }
    case TextFilterOp.ENDS_WITH:
      return { endsWith: value, mode }
    default:
      return { contains: value, mode }
  }
}

/** A negated operator means "does not match", so people without the field stay in. */
const negate = (op: TextFilterOp | ListFilterOp | undefined) =>
  op === TextFilterOp.NOT_CONTAINS || op === ListFilterOp.NOT_IN

/** Active members of the organization that match every filter in the query. */
export function buildDirectoryWhere(orgId: string, q: DirectoryQueryDto): Prisma.UserWhereInput {
  const conditions: Prisma.UserWhereInput[] = []
  const add = (condition: Prisma.UserWhereInput, negated = false) =>
    conditions.push(negated ? { NOT: condition } : condition)

  const search = q.search?.trim()
  if (search) {
    add({
      OR: [
        { firstName: textMatch(search) },
        { lastName: textMatch(search) },
        { email: textMatch(search) },
      ],
    })
  }

  const name = q.name?.trim()
  if (name) {
    add(
      { OR: [{ firstName: textMatch(name, q.nameOp) }, { lastName: textMatch(name, q.nameOp) }] },
      negate(q.nameOp),
    )
  }
  const email = q.email?.trim()
  if (email) add({ email: textMatch(email, q.emailOp) }, negate(q.emailOp))
  const bio = q.bio?.trim()
  if (bio) add({ profile: { bio: textMatch(bio, q.bioOp) } }, negate(q.bioOp))

  if (q.orgNodeIds?.length) {
    add({ profile: { orgNodeId: { in: q.orgNodeIds } } }, negate(q.orgNodeIdsOp))
  }
  if (q.positionIds?.length) {
    add({ profile: { positionId: { in: q.positionIds } } }, negate(q.positionIdsOp))
  }
  if (q.roles?.length) add({ role: { in: q.roles } }, negate(q.rolesOp))

  return { organizationId: orgId, isActive: true, AND: conditions }
}
