-- CreateEnum
CREATE TYPE "PlayerColor" AS ENUM ('WHITE', 'BLACK');

-- CreateEnum
CREATE TYPE "GameResult" AS ENUM ('WHITE_WIN', 'BLACK_WIN', 'DRAW');

-- CreateEnum
CREATE TYPE "Termination" AS ENUM ('CHECKMATE', 'STALEMATE', 'DRAW', 'TIMEOUT', 'RESIGNATION');

-- CreateTable
CREATE TABLE "games" (
    "id" TEXT NOT NULL,
    "playedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pgn" TEXT NOT NULL,
    "plies" INTEGER NOT NULL,
    "humanColor" "PlayerColor" NOT NULL,
    "result" "GameResult" NOT NULL,
    "termination" "Termination" NOT NULL,
    "engineLevel" TEXT NOT NULL,
    "clockMinutes" INTEGER NOT NULL,
    "clockIncrementSeconds" INTEGER NOT NULL,
    "ownerKey" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "games_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "games_ownerKey_playedAt_id_idx" ON "games"("ownerKey", "playedAt" DESC, "id" DESC);
