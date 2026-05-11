/*
  Warnings:

  - The `status` column on the `game_sessions` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "GameStatus" AS ENUM ('WAITING', 'STARTING', 'QUESTION_ACTIVE', 'QUESTION_RESULT', 'LEADERBOARD', 'FINISHED');

-- AlterTable
ALTER TABLE "game_sessions" DROP COLUMN "status",
ADD COLUMN     "status" "GameStatus" NOT NULL DEFAULT 'WAITING';
