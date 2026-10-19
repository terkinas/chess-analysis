import { ENGINE_LEVELS } from "./engine-levels.ts";
import type { GameResult, PlayerColor, Termination } from "./game-record.ts";

// Wording for the history list. Pure functions, so they are unit-tested.

export type HumanResult = "win" | "loss" | "draw";

/** The result from the human's point of view. */
export function humanResult(
  result: GameResult,
  humanColor: PlayerColor,
): HumanResult {
  if (result === "DRAW") return "draw";
  return (result === "WHITE_WIN") === (humanColor === "WHITE") ? "win" : "loss";
}

export const RESULT_LABELS: Record<HumanResult, string> = {
  win: "Win",
  loss: "Loss",
  draw: "Draw",
};

const TERMINATION_LABELS: Record<Termination, string> = {
  CHECKMATE: "Checkmate",
  STALEMATE: "Stalemate",
  DRAW: "Draw",
  TIMEOUT: "Time out",
  RESIGNATION: "Resignation",
};

export function terminationLabel(termination: Termination): string {
  return TERMINATION_LABELS[termination];
}

/** "Standard" for "standard"; an id that no longer exists is shown as is. */
export function levelName(id: string): string {
  const level = ENGINE_LEVELS.find((l) => l.id === id);
  return level ? level.label.split(" · ")[0] : id;
}

export function clockLabel(minutes: number, incrementSeconds: number): string {
  if (minutes === 0) return "Untimed";
  return incrementSeconds > 0
    ? `${minutes}+${incrementSeconds}`
    : `${minutes} min`;
}

/** Full moves played, counting a lone White move as one. */
export function moveCount(plies: number): number {
  return Math.ceil(plies / 2);
}

export function pgnFileName(playedAt: string, id: string): string {
  return `gambit-${playedAt.slice(0, 10)}-${id.slice(0, 6)}.pgn`;
}
