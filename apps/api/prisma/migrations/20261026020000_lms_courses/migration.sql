-- LMS courses (task T4): courses, sections, steps and assignments.
-- CreateEnum
CREATE TYPE "CourseStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "StepType" AS ENUM ('LESSON', 'QUIZ');

-- CreateTable
CREATE TABLE "courses" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT NOT NULL DEFAULT 'graduation',
    "iconType" "SpaceIconType" NOT NULL DEFAULT 'LUCIDE',
    "emoji" TEXT,
    "status" "CourseStatus" NOT NULL DEFAULT 'DRAFT',
    "restricted" BOOLEAN NOT NULL DEFAULT false,
    "sequential" BOOLEAN NOT NULL DEFAULT false,
    "issuesCertificate" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course_sections" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "course_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course_steps" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "type" "StepType" NOT NULL,
    "title" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "durationMinutes" INTEGER,
    "content" JSONB NOT NULL,

    CONSTRAINT "course_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course_assignments" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "mandatory" BOOLEAN NOT NULL DEFAULT true,
    "dueAt" DATE,
    "dueInDays" INTEGER,
    "userId" TEXT,
    "orgNodeId" TEXT,
    "positionId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "course_assignments_pkey" PRIMARY KEY ("id"),
    -- exactly one principal per row
    CONSTRAINT "course_assignments_one_principal" CHECK (num_nonnulls("userId", "orgNodeId", "positionId") = 1),
    CONSTRAINT "course_assignments_due_in_days" CHECK ("dueInDays" IS NULL OR "dueInDays" BETWEEN 1 AND 365)
);

-- CreateIndex
CREATE INDEX "courses_organizationId_status_idx" ON "courses"("organizationId", "status");

-- CreateIndex
CREATE INDEX "course_sections_courseId_idx" ON "course_sections"("courseId");

-- CreateIndex
CREATE INDEX "course_steps_courseId_idx" ON "course_steps"("courseId");

-- CreateIndex
CREATE INDEX "course_steps_sectionId_idx" ON "course_steps"("sectionId");

-- CreateIndex
CREATE INDEX "course_assignments_userId_idx" ON "course_assignments"("userId");

-- CreateIndex
CREATE INDEX "course_assignments_orgNodeId_idx" ON "course_assignments"("orgNodeId");

-- CreateIndex
CREATE INDEX "course_assignments_positionId_idx" ON "course_assignments"("positionId");

-- CreateIndex
CREATE UNIQUE INDEX "course_assignments_courseId_userId_key" ON "course_assignments"("courseId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "course_assignments_courseId_orgNodeId_key" ON "course_assignments"("courseId", "orgNodeId");

-- CreateIndex
CREATE UNIQUE INDEX "course_assignments_courseId_positionId_key" ON "course_assignments"("courseId", "positionId");

-- AddForeignKey
ALTER TABLE "courses" ADD CONSTRAINT "courses_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_sections" ADD CONSTRAINT "course_sections_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_steps" ADD CONSTRAINT "course_steps_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_steps" ADD CONSTRAINT "course_steps_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "course_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_assignments" ADD CONSTRAINT "course_assignments_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_assignments" ADD CONSTRAINT "course_assignments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_assignments" ADD CONSTRAINT "course_assignments_orgNodeId_fkey" FOREIGN KEY ("orgNodeId") REFERENCES "org_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_assignments" ADD CONSTRAINT "course_assignments_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "positions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

