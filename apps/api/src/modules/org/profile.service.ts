import { Injectable } from "@nestjs/common"
import { PrismaService } from "../../prisma/prisma.service"
import { UpdateMyProfileDto } from "./dto/update-profile.dto"
import type { AuthenticatedUser } from "../../common/decorators"
import { assertOwnProfileEditable } from "./profile-lock"

/** The caller's own profile: bio/phone (editable) and area/position (assigned by admins). */
@Injectable()
export class ProfileService {
  constructor(private readonly prisma: PrismaService) {}

  async getMine(userId: string) {
    const profile = await this.prisma.userProfile.findUnique({
      where: { userId },
      include: {
        orgNode: {
          select: {
            id: true,
            name: true,
            manager: {
              select: { id: true, firstName: true, lastName: true, avatarUrl: true },
            },
          },
        },
        position: { select: { id: true, name: true } },
      },
    })
    return { success: true, data: profile }
  }

  async updateMine(user: AuthenticatedUser, dto: UpdateMyProfileDto) {
    const userId = user.id
    if (dto.bio !== undefined || dto.phone !== undefined) await assertOwnProfileEditable(this.prisma, user)
    const data: Record<string, unknown> = {}
    if (dto.bio !== undefined) data.bio = dto.bio || null
    if (dto.phone !== undefined) data.phone = dto.phone || null
    if (dto.showBirthday !== undefined) data.showBirthday = dto.showBirthday
    // orgNodeId / positionId are admin-only (PATCH /org/members/:userId/assignment).

    const profile = await this.prisma.userProfile.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
      include: {
        orgNode: { select: { id: true, name: true } },
        position: { select: { id: true, name: true } },
      },
    })
    return { success: true, data: profile }
  }
}
