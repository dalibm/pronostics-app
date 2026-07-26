-- CreateTable
CREATE TABLE "Pick" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "sport" TEXT NOT NULL,
    "league" TEXT,
    "event" TEXT NOT NULL,
    "market" TEXT NOT NULL,
    "selection" TEXT NOT NULL,
    "odds" DOUBLE PRECISION,
    "confidence" INTEGER NOT NULL,
    "reasoning" TEXT NOT NULL,
    "sourceUrls" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Pick_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Pick_date_idx" ON "Pick"("date");
