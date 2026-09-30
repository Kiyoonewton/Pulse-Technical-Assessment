-- CreateEnum
CREATE TYPE "Intention" AS ENUM ('CHAT', 'GOOD_NEWS', 'LANGUAGE', 'LISTEN');

-- AlterTable
ALTER TABLE "Presence" ADD COLUMN     "intention" "Intention" NOT NULL DEFAULT 'CHAT';
