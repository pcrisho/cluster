import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, StepType } from "@prisma/client";
import { bestEffort } from "../../common/best-effort";
import type { AuthenticatedUser } from "../../common/decorators";
import { PrismaService } from "../../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import { CourseAccessService } from "./course-access.service";
import { CourseProgressService } from "./course-progress.service";
import { outlineForAuthor, stepForAuthor } from "./course-dto";
import {
  EMPTY_LESSON,
  lessonFileKeysOf,
  parseLessonContent,
  removedFileKeys,
} from "./lesson-content";
import { EMPTY_QUIZ, parseQuizContent } from "./quiz-content";
import type { CreateStepDto, UpdateStepDto } from "./dto/content.dto";

type Tx = Prisma.TransactionClient;

/**
 * A course's outline (sections and their steps) and step content, for course managers.
 * Positions are plain integers renumbered on every change (outlines are small).
 */
@Injectable()
export class CourseContentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: CourseAccessService,
    private readonly progress: CourseProgressService,
    private readonly storage: StorageService,
  ) {}

  async addSection(user: AuthenticatedUser, courseId: string, title: string) {
    await this.access.requireCourse(user, courseId, "MANAGE");
    const position = await this.prisma.courseSection.count({
      where: { courseId },
    });
    const section = await this.prisma.courseSection.create({
      data: { courseId, title, position },
    });
    return { ...section, steps: [] };
  }

  async renameSection(
    user: AuthenticatedUser,
    sectionId: string,
    title: string,
  ) {
    await this.requireSection(user, sectionId);
    return this.prisma.courseSection.update({
      where: { id: sectionId },
      data: { title },
    });
  }

  async deleteSection(user: AuthenticatedUser, sectionId: string) {
    const section = await this.requireSection(user, sectionId);
    const candidateKeys = await this.prisma.$transaction(async (tx) => {
      const steps = await tx.courseStep.findMany({
        where: { sectionId },
        select: { content: true },
      });
      await tx.courseSection.delete({ where: { id: sectionId } });
      await this.renumberSections(tx, section.courseId);
      await this.progress.reconcile(tx, section.courseId);
      return steps.flatMap((s) => lessonFileKeysOf(s.content));
    });
    await this.deleteUnusedCourseFiles(section.courseId, candidateKeys);
  }

  async moveSection(
    user: AuthenticatedUser,
    sectionId: string,
    position: number,
  ) {
    const section = await this.requireSection(user, sectionId);
    await this.prisma.$transaction(async (tx) => {
      const ids = (await this.sectionsOf(tx, section.courseId)).filter(
        (id) => id !== sectionId,
      );
      ids.splice(Math.min(position, ids.length), 0, sectionId);
      await this.renumber(tx, "courseSection", ids);
    });
    return this.outline(section.courseId);
  }

  async addStep(
    user: AuthenticatedUser,
    sectionId: string,
    dto: CreateStepDto,
  ) {
    const section = await this.requireSection(user, sectionId);
    const position = await this.prisma.courseStep.count({
      where: { sectionId },
    });
    const step = await this.prisma.courseStep.create({
      data: {
        courseId: section.courseId,
        sectionId,
        type: dto.type,
        title: dto.title,
        position,
        content: (dto.type === StepType.QUIZ
          ? EMPTY_QUIZ
          : EMPTY_LESSON) as unknown as Prisma.InputJsonValue,
      },
    });
    return stepForAuthor(step);
  }

  async updateStep(
    user: AuthenticatedUser,
    stepId: string,
    dto: UpdateStepDto,
  ) {
    const step = await this.requireStep(user, stepId);
    const { saved, removed } = await this.prisma.$transaction(async (tx) => {
      const now = await tx.courseStep.findUnique({ where: { id: stepId } });
      if (!now) throw new NotFoundException("Step not found");
      const data: Prisma.CourseStepUpdateInput = {};
      if (dto.title !== undefined) data.title = dto.title;
      if (dto.required !== undefined) data.required = dto.required;
      if (dto.durationMinutes !== undefined)
        data.durationMinutes = dto.durationMinutes;
      if (dto.content !== undefined) {
        const content =
          now.type === StepType.QUIZ
            ? parseQuizContent(dto.content)
            : parseLessonContent(dto.content, {
                orgId: user.orgId,
                courseId: now.courseId,
                current: now.content,
              });
        if (
          now.type === StepType.LESSON &&
          "kind" in content &&
          content.kind === "files" &&
          content.files.length > 0
        ) {
          const others = await tx.courseStep.findMany({
            where: { courseId: now.courseId, id: { not: stepId } },
            select: { content: true },
          });
          const usedElsewhere = new Set(
            others.flatMap((s) => lessonFileKeysOf(s.content)),
          );
          if (content.files.some((f) => usedElsewhere.has(f.key))) {
            throw new BadRequestException({
              code: "LESSON_FILE_IN_USE",
              message: "A file already belongs to another lesson",
            });
          }
        }
        data.content = content as unknown as Prisma.InputJsonValue;
      }
      const saved = await tx.courseStep.update({
        where: { id: stepId },
        data,
      });
      if (dto.required === false)
        await this.progress.reconcile(tx, now.courseId);
      return {
        saved,
        removed: removedFileKeys(now.content, saved.content),
      };
    });
    await this.deleteUnusedCourseFiles(step.courseId, removed);
    return stepForAuthor(saved);
  }

  async deleteStep(user: AuthenticatedUser, stepId: string) {
    const step = await this.requireStep(user, stepId);
    const candidateKeys = await this.prisma.$transaction(async (tx) => {
      const now = await tx.courseStep.findUnique({
        where: { id: stepId },
        select: { content: true },
      });
      await tx.courseStep.delete({ where: { id: stepId } });
      await this.renumber(
        tx,
        "courseStep",
        await this.stepsOf(tx, step.sectionId),
      );
      await this.progress.reconcile(tx, step.courseId);
      return lessonFileKeysOf(now?.content);
    });
    await this.deleteUnusedCourseFiles(step.courseId, candidateKeys);
  }

  /** Removes storage objects that left a lesson, only after verifying no other step in the course still holds them. */
  private async deleteUnusedCourseFiles(
    courseId: string,
    candidateKeys: string[],
  ) {
    const unique = [...new Set(candidateKeys)];
    if (unique.length === 0) return;
    const remaining = await this.prisma.courseStep.findMany({
      where: { courseId },
      select: { content: true },
    });
    const stillReferenced = new Set(
      remaining.flatMap((s) => lessonFileKeysOf(s.content)),
    );
    for (const key of unique) {
      if (!stillReferenced.has(key)) {
        await bestEffort("delete lesson file", () =>
          this.storage.deleteFile(key),
        );
      }
    }
  }

  /** Moves a step to `position` in a section of the same course (clamped to the end). */
  async moveStep(
    user: AuthenticatedUser,
    stepId: string,
    sectionId: string,
    position: number,
  ) {
    const step = await this.requireStep(user, stepId);
    const target = await this.prisma.courseSection.findFirst({
      where: { id: sectionId, courseId: step.courseId },
    });
    if (!target)
      throw new BadRequestException("The target section is not in this course");
    await this.prisma.$transaction(async (tx) => {
      if (step.sectionId !== sectionId) {
        await tx.courseStep.update({
          where: { id: stepId },
          data: { sectionId },
        });
        await this.renumber(
          tx,
          "courseStep",
          await this.stepsOf(tx, step.sectionId),
        );
      }
      const ids = (await this.stepsOf(tx, sectionId)).filter(
        (id) => id !== stepId,
      );
      ids.splice(Math.min(position, ids.length), 0, stepId);
      await this.renumber(tx, "courseStep", ids);
    });
    return this.outline(step.courseId);
  }

  private async outline(courseId: string) {
    const sections = await this.prisma.courseSection.findMany({
      where: { courseId },
      include: { steps: true },
    });
    return { sections: outlineForAuthor(sections) };
  }

  private async requireSection(user: AuthenticatedUser, sectionId: string) {
    const section = await this.prisma.courseSection.findFirst({
      where: { id: sectionId, course: { organizationId: user.orgId } },
    });
    if (!section) throw new NotFoundException("Section not found");
    await this.access.requireCourse(user, section.courseId, "MANAGE");
    return section;
  }

  private async requireStep(user: AuthenticatedUser, stepId: string) {
    const step = await this.prisma.courseStep.findFirst({
      where: { id: stepId, course: { organizationId: user.orgId } },
    });
    if (!step) throw new NotFoundException("Step not found");
    await this.access.requireCourse(user, step.courseId, "MANAGE");
    return step;
  }

  private async sectionsOf(tx: Tx, courseId: string) {
    const rows = await tx.courseSection.findMany({
      where: { courseId },
      orderBy: { position: "asc" },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  private async stepsOf(tx: Tx, sectionId: string) {
    const rows = await tx.courseStep.findMany({
      where: { sectionId },
      orderBy: { position: "asc" },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  private renumberSections(tx: Tx, courseId: string) {
    return this.sectionsOf(tx, courseId).then((ids) =>
      this.renumber(tx, "courseSection", ids),
    );
  }

  private async renumber(
    tx: Tx,
    model: "courseSection" | "courseStep",
    ids: string[],
  ) {
    for (const [position, id] of ids.entries()) {
      if (model === "courseSection")
        await tx.courseSection.update({ where: { id }, data: { position } });
      else await tx.courseStep.update({ where: { id }, data: { position } });
    }
  }
}
