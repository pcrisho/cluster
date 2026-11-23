/*
  Warnings:

  - You are about to drop the column `repostCount` on the `Post` table. All the data in the column will be lost.
  - You are about to drop the `Repost` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "Repost" DROP CONSTRAINT "Repost_authorId_fkey";

-- DropForeignKey
ALTER TABLE "Repost" DROP CONSTRAINT "Repost_postId_fkey";

-- AlterTable
ALTER TABLE "Post" DROP COLUMN "repostCount";

-- DropTable
DROP TABLE "Repost";
