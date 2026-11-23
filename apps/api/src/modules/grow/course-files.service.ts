import {
  BadRequestException,
  Injectable,
  NotFoundException,
  type OnModuleInit,
} from "@nestjs/common";
import { Prisma, StepType } from "@prisma/client";
import { randomUUID } from "crypto";
import { rm } from "fs/promises";
import type { IncomingHttpHeaders } from "http";
import type { Readable } from "stream";
import { bestEffort } from "../../common/best-effort";
import type { AuthenticatedUser } from "../../common/decorators";
import { PrismaService } from "../../prisma/prisma.service";
import { acceptFile } from "../storage/file-rules";
import { FileAccessRegistry } from "../storage/file-access.registry";
import { StorageService } from "../storage/storage.service";
import { receiveFile } from "../storage/streamed-upload";
import { UploadGate } from "../storage/upload-gate";
import { CourseAccessService } from "./course-access.service";
import { stepForAuthor } from "./course-dto";
import {
  courseFilePrefix,
  videoKeyOf,
  type LessonContent,
  type LessonFile,
} from "./lesson-content";

/** Documents and videos of a course's lessons, stored under the course's prefix. */
@Injectable()
export class CourseFilesService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: CourseAccessService,
    private readonly storage: StorageService,
    private readonly files: FileAccessRegistry,
    private readonly gate: UploadGate,
  ) {}

  /** Course files (`organizations/<org>/grow/<courseId>/…`) are readable by whoever sees the course. */
  onModuleInit(): void {
    this.files.register("grow", (user, courseId) =>
      this.access.canRead(user, courseId),
    );
  }

  async upload(
    user: AuthenticatedUser,
    courseId: string,
    upload: Express.Multer.File | undefined,
  ): Promise<LessonFile> {
    await this.access.requireCourse(user, courseId, "MANAGE");
    const { file, extension, name } = await acceptFile("document", upload);
    const key = `${courseFilePrefix(user.orgId, courseId)}${randomUUID()}.${extension}`;
    await this.storage.putObject(key, file);
    return { key, name, size: file.size };
  }

  /**
   * Makes the uploaded video (the request body) the lesson's content; the previous video goes.
   * Access and the step are checked before a byte is read.
   */
  async uploadVideo(
    user: AuthenticatedUser,
    stepId: string,
    body: Readable & { headers: IncomingHttpHeaders },
    name: unknown,
  ) {
    const step = await this.prisma.courseStep.findFirst({
      where: { id: stepId, course: { organizationId: user.orgId } },
    });
    if (!step) throw new NotFoundException("Step not found");
    await this.access.requireCourse(user, step.courseId, "MANAGE");
    if (step.type !== StepType.LESSON)
      throw new BadRequestException({
        code: "STEP_NOT_LESSON",
        message: "Only a lesson holds a video",
      });

    const fileName =
      (typeof name === "string" && name.trim().slice(0, 255)) || "video";
    const file = await receiveFile("video", body, fileName, this.gate);
    const key = `${courseFilePrefix(user.orgId, step.courseId)}${randomUUID()}.${file.extension}`;
    try {
      await this.storage.putFile(key, file.path, file.size, file.mime);
    } finally {
      await rm(file.path, { force: true });
      file.release();
    }

    const content: LessonContent = {
      kind: "video",
      video: { key, name: fileName, size: file.size },
    };
    // Read again: the lesson may have changed (or gone) while the file arrived.
    const saved = await this.prisma
      .$transaction(async (tx) => {
        const now = await tx.courseStep.findUnique({ where: { id: stepId } });
        if (!now) throw new NotFoundException("Step not found");
        const updated = await tx.courseStep.update({
          where: { id: stepId },
          data: { content: content as unknown as Prisma.InputJsonValue },
        });
        return { updated, previous: videoKeyOf(now.content) };
      })
      .catch(async (error: unknown) => {
        await bestEffort("delete unsaved lesson video", () =>
          this.storage.deleteFile(key),
        );
        throw error;
      });
    const previous = saved.previous;
    if (previous)
      await bestEffort("delete replaced lesson video", () =>
        this.storage.deleteFile(previous),
      );
    return stepForAuthor(saved.updated);
  }
}
