-- CreateTable
CREATE TABLE "Game" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "white" TEXT NOT NULL,
    "black" TEXT NOT NULL,
    "humanColor" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "termination" TEXT,
    "levelId" TEXT NOT NULL,
    "clockMinutes" INTEGER NOT NULL,
    "clockIncrementSeconds" INTEGER NOT NULL,
    "plies" INTEGER NOT NULL,
    "moves" TEXT[],
    "pgn" TEXT NOT NULL,

    CONSTRAINT "Game_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Game_createdAt_idx" ON "Game"("createdAt" DESC);
