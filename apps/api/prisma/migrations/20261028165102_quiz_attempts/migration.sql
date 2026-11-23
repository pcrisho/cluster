-- CreateEnum
CREATE TYPE "AttemptStatus" AS ENUM ('IN_PROGRESS', 'PENDING_REVIEW', 'GRADED');

-- CreateTable
CREATE TABLE "quiz_attempts" (
    "id" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "stepId" TEXT NOT NULL,
    "status" "AttemptStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "questions" JSONB NOT NULL,
    "passScore" INTEGER NOT NULL,
    "answers" JSONB,
    "openScores" JSONB,
    "score" DOUBLE PRECISION,
    "passed" BOOLEAN,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3),
    "gradedAt" TIMESTAMP(3),
    "gradedById" TEXT,

    CONSTRAINT "quiz_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "quiz_attempts_enrollmentId_stepId_idx" ON "quiz_attempts"("enrollmentId", "stepId");

-- CreateIndex
CREATE INDEX "quiz_attempts_stepId_status_idx" ON "quiz_attempts"("stepId", "status");

-- AddForeignKey
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "course_steps"("id") ON DELETE CASCADE ON UPDATE CASCADE;
