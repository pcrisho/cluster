import { ForbiddenException } from "@nestjs/common";
import type { PrismaService } from "../../prisma/prisma.service";
import type { AuthenticatedUser } from "../../common/decorators";

/**
 * A member who is not ADMIN may change their own name, avatar, phone and bio only while their organization
 * allows it (`Organization.memberProfileEditing`, docs/specs/org/member-data). Preferences stay theirs.
 */
export async function assertOwnProfileEditable(
  prisma: PrismaService,
  user: Pick<AuthenticatedUser, "orgId" | "role">,
) {
  if (user.role === "ADMIN") return;
  const { memberProfileEditing } = await prisma.organization.findUniqueOrThrow({
    where: { id: user.orgId },
    select: { memberProfileEditing: true },
  });
  if (!memberProfileEditing) {
    throw new ForbiddenException({
      code: "PROFILE_LOCKED",
      message: "Your organization manages your personal data",
    });
  }
}
