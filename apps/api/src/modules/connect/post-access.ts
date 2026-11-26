import { NotFoundException } from "@nestjs/common"
import { PrismaService } from "../../prisma/prisma.service"

/** Posts of other organizations do not exist as far as the caller is concerned. */
export async function findPostInOrg(prisma: PrismaService, postId: string, orgId: string) {
  const post = await prisma.post.findFirst({ where: { id: postId, organizationId: orgId } })
  if (!post) throw new NotFoundException("Post not found")
  return post
}

export const AUTHOR_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  avatarUrl: true,
  role: true,
} as const
