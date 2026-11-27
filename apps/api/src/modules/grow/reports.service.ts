import { ForbiddenException, Injectable } from "@nestjs/common";
import { CourseStatus } from "@prisma/client";
import type { AuthenticatedUser } from "../../common/decorators";
import { PrismaService } from "../../prisma/prisma.service";
import {
  byUrgency,
  derivedState,
  effectiveDue,
  reaches,
  type DerivedState,
} from "./assignment-resolution";
import { formatCode } from "./certificate-code";
import { toCsv } from "./csv";
import { translate, type MessageKey } from "../../i18n/translate";
import { dateIn, todayIn } from "./due-date";
import type { ReportQuery } from "./dto/report.dto";
import { dashboardOf } from "./report-dashboard";
import { complianceByMainNode } from "./report-main-nodes";
import { subtreeOf } from "../org/org-tree";
import { reportScope } from "./report-scope";
import { progressOf } from "./step-order";

const EXPORT_CAP = 50_000;
const STATES: DerivedState[] = [
  "NOT_STARTED",
  "IN_PROGRESS",
  "COMPLETED",
  "OVERDUE",
];

/**
 * The compliance report: one row per (active member, published course they must take), or with
 * `scope=all` also archived courses and voluntary enrolments. Built from the same rules the learner
 * sees (effectiveDue, derivedState), expanded in memory (the first client has fewer than 500 people).
 */
@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async compliance(user: AuthenticatedUser, query: ReportQuery) {
    const { rows, summary, filters } = await this.rows(user, query);
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;
    return {
      rows: rows.slice((page - 1) * pageSize, page * pageSize),
      total: rows.length,
      page,
      pageSize,
      summary,
      filters,
    };
  }

  /** Figures and charts over the same rows; a status filter does not apply (the tiles show every state). */
  async dashboard(user: AuthenticatedUser, query: ReportQuery) {
    const { rows, today, timeZone, filters } = await this.rows(user, {
      ...query,
      status: undefined,
    });
    return { ...dashboardOf(rows, today, timeZone), filters };
  }

  /** Mandatory-course compliance aggregated per active main node in the caller's scope. */
  async byMainNode(user: AuthenticatedUser) {
    const { rows, parentOf, activeMainNodeIds } = await this.rows(user, {});
    return {
      items: complianceByMainNode(rows, activeMainNodeIds, parentOf),
    };
  }

  /** In the downloader's language; dates stay ISO (YYYY-MM-DD, completion in the organization's zone) so spreadsheets sort them. */
  async exportCsv(user: AuthenticatedUser, query: ReportQuery) {
    const { rows, timeZone } = await this.rows(user, query);
    const t = (key: MessageKey) => translate(user.locale, key);
    return toCsv(
      [
        t("report.columns.person"),
        t("report.columns.email"),
        t("report.columns.area"),
        t("report.columns.position"),
        t("report.columns.course"),
        t("report.columns.status"),
        t("report.columns.progress"),
        t("report.columns.dueDate"),
        t("report.columns.completed"),
        t("report.columns.bestScore"),
        t("report.columns.attempts"),
      ],
      rows
        .slice(0, EXPORT_CAP)
        .map((r) => [
          r.name,
          r.email,
          r.area?.name,
          r.position?.name,
          r.courseTitle,
          t(`report.states.${r.state}`),
          `${r.progress.done}/${r.progress.total}`,
          r.dueAt,
          r.completedAt ? dateIn(r.completedAt, timeZone) : null,
          r.bestScore,
          r.attempts,
        ]),
    );
  }

  private async rows(user: AuthenticatedUser, query: ReportQuery) {
    const orgId = user.orgId;
    const [nodes, org, positions] = await Promise.all([
      this.prisma.orgNode.findMany({
        where: { organizationId: orgId },
        select: {
          id: true,
          parentId: true,
          name: true,
          managerId: true,
          isActive: true,
        },
      }),
      this.prisma.organization.findUniqueOrThrow({
        where: { id: orgId },
        select: { timezone: true },
      }),
      this.prisma.position.findMany({
        where: { organizationId: orgId },
        select: { id: true, name: true },
      }),
    ]);
    const parentOf = new Map(nodes.map((n) => [n.id, n.parentId]));
    const scope = reportScope(
      user,
      nodes.filter((n) => n.managerId === user.id).map((n) => n.id),
      parentOf,
    );
    if (!scope)
      throw new ForbiddenException(
        "You do not have permission to perform this action",
      );
    const nodeName = new Map(nodes.map((n) => [n.id, n.name]));
    const positionName = new Map(positions.map((p) => [p.id, p.name]));
    const inArea = query.orgNodeId
      ? subtreeOf(query.orgNodeId, parentOf)
      : null;
    const positionIds = query.positionId ? new Set(query.positionId) : null;
    const courseIds = query.courseId ? new Set(query.courseId) : null;
    const statuses = query.status ? new Set<string>(query.status) : null;
    const text = query.q?.trim().toLowerCase();

    const scopedMembers = (
      await this.prisma.user.findMany({
        where: { organizationId: orgId, isActive: true },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          profile: {
            select: {
              orgNodeId: true,
              positionId: true,
              assignmentChangedAt: true,
            },
          },
        },
      })
    )
      .map((u) => ({
        userId: u.id,
        name: `${u.firstName} ${u.lastName}`,
        email: u.email,
        orgNodeId: u.profile?.orgNodeId ?? null,
        positionId: u.profile?.positionId ?? null,
        assignmentChangedAt: u.profile?.assignmentChangedAt ?? null,
      }))
      .filter(
        (m) => scope.all || (m.orgNodeId && scope.nodeIds.has(m.orgNodeId)),
      );
    const members = scopedMembers.filter(
      (m) =>
        (!inArea || (m.orgNodeId && inArea.has(m.orgNodeId))) &&
        (!positionIds ||
          (m.positionId !== null && positionIds.has(m.positionId))) &&
        (!text ||
          m.name.toLowerCase().includes(text) ||
          m.email.toLowerCase().includes(text)),
    );

    const all = query.scope === "all";
    const scopedCourses = await this.prisma.course.findMany({
      where: {
        organizationId: orgId,
        status: {
          in: all
            ? [CourseStatus.PUBLISHED, CourseStatus.ARCHIVED]
            : [CourseStatus.PUBLISHED],
        },
      },
      select: {
        id: true,
        title: true,
        status: true,
        assignments: true,
        steps: {
          select: { id: true, position: true, required: true, type: true },
        },
      },
    });
    const courses = courseIds
      ? scopedCourses.filter((course) => courseIds.has(course.id))
      : scopedCourses;
    const enrollments = await this.prisma.enrollment.findMany({
      where: {
        courseId: { in: courses.map((c) => c.id) },
        userId: { in: members.map((m) => m.userId) },
      },
      select: {
        courseId: true,
        userId: true,
        status: true,
        completedAt: true,
        progress: { select: { stepId: true } },
        attempts: {
          select: { stepId: true, score: true, submittedAt: true },
        },
      },
    });
    const enrollmentOf = new Map(
      enrollments.map((e) => [`${e.courseId}:${e.userId}`, e]),
    );
    const certificates = await this.prisma.certificate.findMany({
      where: {
        organizationId: orgId,
        courseId: { in: courses.map((c) => c.id) },
        userId: { in: members.map((m) => m.userId) },
      },
      select: { courseId: true, userId: true, code: true },
    });
    const certificateOf = new Map(
      certificates.map((c) => [
        `${c.courseId}:${c.userId}`,
        formatCode(c.code),
      ]),
    );

    const today = todayIn(org.timezone);
    const rows = courses.flatMap((course) =>
      members.flatMap((m) => {
        const due = effectiveDue(
          course.assignments.filter((a) => reaches(a, m, parentOf)),
          m.assignmentChangedAt,
          org.timezone,
        );
        const enrollment = enrollmentOf.get(`${course.id}:${m.userId}`);
        if (!due.mandatory && !(all && enrollment)) return [];
        return [
          {
            userId: m.userId,
            name: m.name,
            email: m.email,
            area: m.orgNodeId
              ? { id: m.orgNodeId, name: nodeName.get(m.orgNodeId) ?? "" }
              : null,
            position: m.positionId
              ? { id: m.positionId, name: positionName.get(m.positionId) ?? "" }
              : null,
            courseId: course.id,
            courseTitle: course.title,
            courseStatus: course.status,
            mandatory: due.mandatory,
            state: derivedState({
              enrollment: enrollment?.status ?? null,
              dueAt: due.dueAt,
              today,
            }),
            progress: progressOf(
              course.steps,
              new Set(enrollment?.progress.map((p) => p.stepId)),
            ),
            dueAt: due.dueAt,
            completedAt: enrollment?.completedAt ?? null,
            ...quizResults(enrollment?.attempts ?? []),
            certificateCode:
              certificateOf.get(`${course.id}:${m.userId}`) ?? null,
          },
        ];
      }),
    );
    rows.sort(reportOrder(query.sort ?? "status", query.order ?? "asc"));
    // The tiles count every filtered row; the status filter applies to the list only.
    const summary = Object.fromEntries(
      STATES.map((s) => [s, rows.filter((r) => r.state === s).length]),
    ) as Record<DerivedState, number>;
    return {
      rows: statuses ? rows.filter((r) => statuses.has(r.state)) : rows,
      summary,
      today,
      timeZone: org.timezone,
      parentOf,
      activeMainNodeIds: nodes
        .filter(
          (n) =>
            n.isActive &&
            n.parentId === null &&
            (scope.all || scope.nodeIds.has(n.id)),
        )
        .map((n) => n.id),
      filters: {
        courses: scopedCourses
          .map((course) => ({
            id: course.id,
            name: course.title,
            archived: course.status === CourseStatus.ARCHIVED,
          }))
          .sort((a, b) => a.name.localeCompare(b.name)),
        areas: nodes
          .filter((node) => scope.all || scope.nodeIds.has(node.id))
          .map((node) => ({ id: node.id, name: node.name, main: node.parentId === null }))
          .sort((a, b) => a.name.localeCompare(b.name)),
        positions: positions
          .filter((position) =>
            scopedMembers.some((member) => member.positionId === position.id),
          )
          .map((position) => ({ id: position.id, name: position.name }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      },
    };
  }
}

type Sortable = { state: DerivedState; dueAt: string | null; name: string };

/** Status order is the learner's "Required" order; by due date, undated rows stay last and ties keep the status order. */
function reportOrder(sort: "status" | "due", order: "asc" | "desc") {
  const urgency = (a: Sortable, b: Sortable) =>
    byUrgency(
      { state: a.state, dueAt: a.dueAt, title: a.name },
      { state: b.state, dueAt: b.dueAt, title: b.name },
    );
  const sign = order === "asc" ? 1 : -1;
  if (sort === "status")
    return (a: Sortable, b: Sortable) => sign * urgency(a, b);
  return (a: Sortable, b: Sortable) =>
    (a.dueAt === null ? 1 : 0) - (b.dueAt === null ? 1 : 0) ||
    sign * (a.dueAt ?? "").localeCompare(b.dueAt ?? "") ||
    urgency(a, b);
}

/**
 * One number for a course that may hold several quizzes: the mean of the best score of each quiz
 * attempted, and every submitted attempt (D16).
 */
function quizResults(
  attempts: {
    stepId: string;
    score: number | null;
    submittedAt: Date | null;
  }[],
) {
  const best = new Map<string, number>();
  for (const a of attempts)
    if (a.score !== null)
      best.set(a.stepId, Math.max(best.get(a.stepId) ?? 0, a.score));
  const scores = [...best.values()];
  return {
    bestScore: scores.length
      ? Math.round((scores.reduce((s, x) => s + x, 0) / scores.length) * 10) /
        10
      : null,
    attempts: attempts.filter((a) => a.submittedAt !== null).length,
  };
}
