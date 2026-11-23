-- LMS core pieces (task T2): course authoring capability and the anchor of relative due dates.
ALTER TYPE "Capability" ADD VALUE 'GROW_COURSE_MANAGE';

ALTER TABLE "user_profiles" ADD COLUMN "assignmentChangedAt" TIMESTAMP(3);
