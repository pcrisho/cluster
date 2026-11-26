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
import { EMPTY_LESSON, parseLessonContent, videoKeyOf } from "./lesson-content";
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
    const steps = await this.prisma.courseStep.findMany({
      where: { sectionId },
      select: { content: true },
    });
    await this.prisma.$transaction(async (tx) => {
      await tx.courseSection.delete({ where: { id: sectionId } });
      await this.renumberSections(tx, section.courseId);
      await this.progress.reconcile(tx, section.courseId);
    });
    for (const step of steps) await this.deleteVideo(videoKeyOf(step.content));
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
    const data: Prisma.CourseStepUpdateInput = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.required !== undefined) data.required = dto.required;
    if (dto.durationMinutes !== undefined)
      data.durationMinutes = dto.durationMinutes;
    if (dto.content !== undefined) {
      const content =
        step.type === StepType.QUIZ
          ? parseQuizContent(dto.content)
          : parseLessonContent(dto.content, {
              orgId: user.orgId,
              courseId: step.courseId,
              current: step.content,
            });
      data.content = content as unknown as Prisma.InputJsonValue;
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.courseStep.update({
        where: { id: stepId },
        data,
      });
      if (dto.required === false)
        await this.progress.reconcile(tx, step.courseId);
      return saved;
    });
    if (videoKeyOf(updated.content) !== videoKeyOf(step.content))
      await this.deleteVideo(videoKeyOf(step.content));
    return stepForAuthor(updated);
  }

  async deleteStep(user: AuthenticatedUser, stepId: string) {
    const step = await this.requireStep(user, stepId);
    await this.prisma.$transaction(async (tx) => {
      await tx.courseStep.delete({ where: { id: stepId } });
      await this.renumber(
        tx,
        "courseStep",
        await this.stepsOf(tx, step.sectionId),
      );
      await this.progress.reconcile(tx, step.courseId);
    });
    await this.deleteVideo(videoKeyOf(step.content));
  }

  /** A video belongs to one lesson (it gets there only by its upload): when it leaves, it goes. */
  private async deleteVideo(key: string | null) {
    if (key)
      await bestEffort("delete lesson video", () =>
        this.storage.deleteFile(key),
      );
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
