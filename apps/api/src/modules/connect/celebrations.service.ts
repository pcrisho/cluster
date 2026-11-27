import { Injectable, NotFoundException } from "@nestjs/common"
import type { AuthenticatedUser } from "../../common/decorators"
import { PrismaService } from "../../prisma/prisma.service"
import { NotificationService } from "../notification/notification.service"
import { PartitionService } from "../org/partition.service"
import { bestEffort } from "../../common/best-effort"
import { UpdateCelebrationsSettingsDto } from "./dto/celebrations.dto"

const SETTINGS_SELECT = {
  celebrationsEnabled: true,
  showBirthdays: true,
  showAnniversaries: true,
} as const

/** Year, month and day of `date` on the organization's calendar. Falls back to UTC for an unknown zone. */
export function calendarDayIn(date: Date, timeZone: string): { year: number; month: number; day: number } {
  let formatter: Intl.DateTimeFormat
  try {
    formatter = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "numeric", day: "numeric" })
  } catch {
    formatter = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", year: "numeric", month: "numeric", day: "numeric" })
  }
  const parts = formatter.formatToParts(date)
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value)
  return { year: get("year"), month: get("month"), day: get("day") }
}

/** Month and day of `date` on the organization's calendar. */
export function monthDayIn(date: Date, timeZone: string): { month: number; day: number } {
  const { month, day } = calendarDayIn(date, timeZone)
  return { month, day }
}

/** Full years from `joinedAt` to `now` on the organization's calendar. */
export function completedYears(joinedAt: Date, now: Date, timeZone: string): number {
  const today = calendarDayIn(now, timeZone)
  const joinedMonth = joinedAt.getUTCMonth() + 1
  const joinedDay = joinedAt.getUTCDate()
  const beforeAnniversary =
    today.month < joinedMonth || (today.month === joinedMonth && today.day < joinedDay)
  return Math.max(0, today.year - joinedAt.getUTCFullYear() - (beforeAnniversary ? 1 : 0))
}

/** Birthdays and join dates are stored as calendar dates (UTC midnight), so compare their UTC parts. */
const occursOn = (stored: Date, today: { month: number; day: number }) =>
  stored.getUTCMonth() + 1 === today.month && stored.getUTCDate() === today.day

@Injectable()
export class CelebrationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationService,
    private readonly partition: PartitionService,
  ) {}

  async today(user: AuthenticatedUser) {
    const { orgId, id: userId } = user
    const org = await this.prisma.organization.findUniqueOrThrow({
      where: { id: orgId },
      select: { timezone: true, ...SETTINGS_SELECT },
    })
    if (!org.celebrationsEnabled) return { success: true, data: { birthdays: [], anniversaries: [] } }

    const scope = await this.partition.scopeFor(user)
    const now = new Date()
    const today = monthDayIn(now, org.timezone)
    const year = now.getUTCFullYear()
    const people = await this.prisma.user.findMany({
      where: {
        organizationId: orgId,
        isActive: true,
        profile: { isNot: null },
        ...this.partition.peopleFilter(scope),
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        avatarUrl: true,
        profile: { select: { birthDate: true, joinedAt: true, showBirthday: true } },
      },
    })

    const publicPerson = ({ profile: _profile, ...person }: (typeof people)[number]) => person
    const birthdays = org.showBirthdays
      ? people
          .filter((p) => p.profile?.birthDate && p.profile.showBirthday && occursOn(p.profile.birthDate, today))
          .map((p) => ({ ...publicPerson(p), type: "BIRTHDAY" as const, age: year - p.profile!.birthDate!.getUTCFullYear() }))
      : []
    // An anniversary needs at least one full year: nobody celebrates the day they joined.
    const anniversaries = org.showAnniversaries
      ? people
          .filter((p) => p.profile && occursOn(p.profile.joinedAt, today) && year > p.profile.joinedAt.getUTCFullYear())
          .map((p) => ({ ...publicPerson(p), type: "ANNIVERSARY" as const, years: year - p.profile!.joinedAt.getUTCFullYear() }))
      : []

    const reactions = await this.prisma.celebrationReaction.findMany({
      where: { userId, targetUserId: { in: [...birthdays, ...anniversaries].map((p) => p.id) } },
    })
    const mine = new Map(reactions.map((r) => [`${r.targetUserId}:${r.type}`, r.emoji]))
    const withReaction = <T extends { id: string; type: string }>(item: T) => ({
      ...item,
      reacted: mine.has(`${item.id}:${item.type}`),
      reaction: mine.get(`${item.id}:${item.type}`) ?? null,
    })

    return {
      success: true,
      data: { birthdays: birthdays.map(withReaction), anniversaries: anniversaries.map(withReaction) },
    }
  }

  /** Adds the caller's reaction to someone's celebration, or removes it if it was already there. */
  async toggleReaction(
    user: AuthenticatedUser,
    targetUserId: string,
    type: "BIRTHDAY" | "ANNIVERSARY",
    emoji: string,
  ) {
    const { id: userId, orgId } = user
    const scope = targetUserId !== userId ? await this.partition.scopeFor(user) : { all: true as const }
    const target = await this.prisma.user.findFirst({
      where: {
        id: targetUserId,
        organizationId: orgId,
        isActive: true,
        ...(targetUserId !== userId ? this.partition.peopleFilter(scope) : {}),
      },
      select: { id: true },
    })
    if (!target) throw new NotFoundException("User not found")

    const removed = await this.prisma.celebrationReaction.deleteMany({
      where: { userId, targetUserId, type },
    })
    if (removed.count > 0) return { success: true, data: { reacted: false, emoji: null } }

    await this.prisma.celebrationReaction.create({ data: { userId, targetUserId, type, emoji } })
    if (userId !== targetUserId) {
      await bestEffort("celebration notification", async () => {
        const reactor = await this.prisma.user.findUniqueOrThrow({
          where: { id: userId },
          select: { firstName: true, lastName: true },
        })
        await this.notifications.notify(targetUserId, {
          type: "connect:celebration:reaction",
          title: `${reactor.firstName} ${reactor.lastName} reacted to your ${type.toLowerCase()}`,
          body: `Sent ${emoji}`,
          link: "/connect/directory",
          payload: {
            targetUserId,
            reactorId: userId,
            type,
            emoji,
            params: { name: `${reactor.firstName} ${reactor.lastName}`, kind: type, emoji },
          },
        })
      })
    }
    return { success: true, data: { reacted: true, emoji } }
  }

  async getSettings(orgId: string) {
    const data = await this.prisma.organization.findUniqueOrThrow({
      where: { id: orgId },
      select: SETTINGS_SELECT,
    })
    return { success: true, data }
  }

  async updateSettings(orgId: string, dto: UpdateCelebrationsSettingsDto) {
    const data = await this.prisma.organization.update({
      where: { id: orgId },
      data: dto,
      select: SETTINGS_SELECT,
    })
    return { success: true, data }
  }
}
