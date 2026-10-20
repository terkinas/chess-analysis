import "server-only";
import { db } from "./db";

export type GameSummary = {
  id: string;
  createdAt: Date;
  humanColor: string;
  result: string;
  termination: string | null;
  levelId: string;
  clockMinutes: number;
  clockIncrementSeconds: number;
  plies: number;
};

export async function listGames(limit = 100): Promise<GameSummary[]> {
  return db().game.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      createdAt: true,
      humanColor: true,
      result: true,
      termination: true,
      levelId: true,
      clockMinutes: true,
      clockIncrementSeconds: true,
      plies: true,
    },
  });
}

export async function getGamePgn(id: string): Promise<string | null> {
  const game = await db().game.findUnique({
    where: { id },
    select: { pgn: true },
  });
  return game?.pgn ?? null;
}
