-- CreateEnum
CREATE TYPE "PickStatus" AS ENUM ('PENDING', 'WON', 'LOST', 'PUSH', 'VOID');

-- AlterTable
ALTER TABLE "Pick" ADD COLUMN     "awayTeam" TEXT,
ADD COLUMN     "eventId" TEXT,
ADD COLUMN     "homeTeam" TEXT,
ADD COLUMN     "marketKey" TEXT,
ADD COLUMN     "point" DOUBLE PRECISION,
ADD COLUMN     "selectionKey" TEXT,
ADD COLUMN     "settledAt" TIMESTAMP(3),
ADD COLUMN     "sportKey" TEXT,
ADD COLUMN     "status" "PickStatus" NOT NULL DEFAULT 'PENDING';

-- CreateIndex
CREATE INDEX "Pick_status_matchTime_idx" ON "Pick"("status", "matchTime");
