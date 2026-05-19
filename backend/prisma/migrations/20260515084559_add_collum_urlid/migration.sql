-- AlterTable
ALTER TABLE "questions" ADD COLUMN     "image_id" TEXT,
ADD COLUMN     "image_url" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "avatar_id" TEXT;
