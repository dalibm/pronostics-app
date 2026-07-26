-- CreateEnum
CREATE TYPE "PickPeriod" AS ENUM ('DAILY', 'WEEKLY');

-- DropIndex
DROP INDEX "Pick_date_idx";

-- AlterTable
ALTER TABLE "Pick" ADD COLUMN     "period" "PickPeriod" NOT NULL DEFAULT 'DAILY',
ALTER COLUMN "matchTime" DROP DEFAULT;

-- CreateIndex
CREATE INDEX "Pick_period_date_idx" ON "Pick"("period", "date");
