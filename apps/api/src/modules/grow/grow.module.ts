import { Module } from "@nestjs/common";
import { NotificationModule } from "../notification/notification.module";
import { OrgModule } from "../org/org.module";
import { AssignmentsController } from "./assignments.controller";
import { AssignmentsService } from "./assignments.service";
import { AttemptsController } from "./attempts.controller";
import { AttemptsService } from "./attempts.service";
import {
  CertificatesController,
  VerifyController,
} from "./certificates.controller";
import { CertificatesService } from "./certificates.service";
import { CourseAccessService } from "./course-access.service";
import { CourseContentController } from "./course-content.controller";
import { CourseContentService } from "./course-content.service";
import { CourseFilesController } from "./course-files.controller";
import { CourseFilesService } from "./course-files.service";
import { CoursesController } from "./courses.controller";
import { CoursesService } from "./courses.service";
import { CourseProgressService } from "./course-progress.service";
import { LearningController } from "./learning.controller";
import { LearningService } from "./learning.service";
import { QuizReviewsService } from "./quiz-reviews.service";
import { ReportsController } from "./reports.controller";
import { ReportsService } from "./reports.service";

/** GROW: the LMS. Every controller carries @RequireModule(ModuleKey.GROW) (the public verify route excepted). */
@Module({
  imports: [OrgModule, NotificationModule],
  controllers: [
    CoursesController,
    CourseContentController,
    CourseFilesController,
    AssignmentsController,
    LearningController,
    AttemptsController,
    CertificatesController,
    VerifyController,
    ReportsController,
  ],
  providers: [
    CourseAccessService,
    CoursesService,
    CourseContentService,
    CourseFilesService,
    AssignmentsService,
    CourseProgressService,
    LearningService,
    AttemptsService,
    QuizReviewsService,
    CertificatesService,
    ReportsService,
  ],
})
export class GrowModule {}
