/*
  Warnings:

  - You are about to drop the column `player_id` on the `player_answers` table. All the data in the column will be lost.
  - You are about to drop the column `score` on the `players` table. All the data in the column will be lost.
  - You are about to drop the column `current_question_index` on the `rooms` table. All the data in the column will be lost.
  - You are about to drop the column `questionStartedAt` on the `rooms` table. All the data in the column will be lost.
  - You are about to drop the column `status` on the `rooms` table. All the data in the column will be lost.
  - You are about to drop the `sessions` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[player_session_id,question_id]` on the table `player_answers` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `player_session_id` to the `player_answers` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "player_answers" DROP CONSTRAINT "player_answers_player_id_fkey";

-- DropForeignKey
ALTER TABLE "sessions" DROP CONSTRAINT "sessions_user_id_fkey";

-- DropIndex
DROP INDEX "player_answers_answer_id_idx";

-- DropIndex
DROP INDEX "player_answers_player_id_idx";

-- DropIndex
DROP INDEX "player_answers_player_id_question_id_key";

-- DropIndex
DROP INDEX "player_answers_player_id_score_earned_idx";

-- DropIndex
DROP INDEX "player_answers_question_id_is_correct_idx";

-- DropIndex
DROP INDEX "rooms_pin_idx";

-- AlterTable
ALTER TABLE "player_answers" DROP COLUMN "player_id",
ADD COLUMN     "answer_content" TEXT,
ADD COLUMN     "player_session_id" TEXT NOT NULL,
ADD COLUMN     "question_content" TEXT;

-- AlterTable
ALTER TABLE "players" DROP COLUMN "score";

-- AlterTable
ALTER TABLE "quizzes" ADD COLUMN     "deleted_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "rooms" DROP COLUMN "current_question_index",
DROP COLUMN "questionStartedAt",
DROP COLUMN "status";

-- DropTable
DROP TABLE "sessions";

-- CreateTable
CREATE TABLE "game_sessions" (
    "id" TEXT NOT NULL,
    "room_id" TEXT NOT NULL,
    "status" "RoomStatus" NOT NULL DEFAULT 'WAITING',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),
    "current_question_index" INTEGER NOT NULL DEFAULT 0,
    "question_started_at" TIMESTAMP(3),

    CONSTRAINT "game_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "player_sessions" (
    "id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "player_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "refresh_token" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "game_sessions_room_id_idx" ON "game_sessions"("room_id");

-- CreateIndex
CREATE INDEX "player_sessions_session_id_idx" ON "player_sessions"("session_id");

-- CreateIndex
CREATE INDEX "player_sessions_player_id_idx" ON "player_sessions"("player_id");

-- CreateIndex
CREATE UNIQUE INDEX "player_sessions_player_id_session_id_key" ON "player_sessions"("player_id", "session_id");

-- CreateIndex
CREATE INDEX "auth_sessions_user_id_idx" ON "auth_sessions"("user_id");

-- CreateIndex
CREATE INDEX "auth_sessions_expires_at_idx" ON "auth_sessions"("expires_at");

-- CreateIndex
CREATE INDEX "player_answers_player_session_id_idx" ON "player_answers"("player_session_id");

-- CreateIndex
CREATE INDEX "player_answers_player_session_id_is_correct_idx" ON "player_answers"("player_session_id", "is_correct");

-- CreateIndex
CREATE UNIQUE INDEX "player_answers_player_session_id_question_id_key" ON "player_answers"("player_session_id", "question_id");

-- CreateIndex
CREATE INDEX "quizzes_deleted_at_idx" ON "quizzes"("deleted_at");

-- AddForeignKey
ALTER TABLE "game_sessions" ADD CONSTRAINT "game_sessions_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_sessions" ADD CONSTRAINT "player_sessions_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_sessions" ADD CONSTRAINT "player_sessions_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "game_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_answers" ADD CONSTRAINT "player_answers_player_session_id_fkey" FOREIGN KEY ("player_session_id") REFERENCES "player_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
