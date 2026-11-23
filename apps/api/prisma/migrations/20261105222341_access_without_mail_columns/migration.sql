-- AlterTable
ALTER TABLE "User" ADD COLUMN     "inviteQueuedAt" TIMESTAMP(3),
ADD COLUMN     "tempPasswordExpiresAt" TIMESTAMP(3);
