-- CreateEnum
CREATE TYPE "QuizCategory" AS ENUM ('TOAN', 'VAT_LI', 'HOA_HOC', 'SINH_HOC', 'VAN_HOC', 'LICH_SU', 'DIA_LY', 'TIENG_ANH', 'CONG_NGHE', 'KHAC');

-- DropForeignKey
ALTER TABLE "answers" DROP CONSTRAINT "answers_question_id_fkey";

-- DropForeignKey
ALTER TABLE "questions" DROP CONSTRAINT "questions_quiz_id_fkey";

-- AlterTable
ALTER TABLE "quizzes" ADD COLUMN     "category" "QuizCategory" NOT NULL DEFAULT 'KHAC';

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_quiz_id_fkey" FOREIGN KEY ("quiz_id") REFERENCES "quizzes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "answers" ADD CONSTRAINT "answers_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
