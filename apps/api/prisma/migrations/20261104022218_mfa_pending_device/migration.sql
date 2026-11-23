-- AlterTable
ALTER TABLE "user_mfa" ADD COLUMN     "pendingAt" TIMESTAMP(3),
ADD COLUMN     "pendingSecretBox" TEXT;
