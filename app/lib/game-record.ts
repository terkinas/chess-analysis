import type { Color } from "chess.js";
import { getOutcome, pgnResult, replay, toPgn } from "./chess-game.ts";
import { INCREMENT_OPTIONS, MINUTE_OPTIONS } from "./chess-clock.ts";
import { ENGINE_LEVELS } from "./engine-levels.ts";

// Turns what the browser sends when it saves a game into the row to store.
// Server actions can be called by anyone with a POST, so nothing from the
// client is trusted: the moves are replayed, and the result and the way the
// game ended are worked out here rather than taken from the request.

export const MAX_PLIES = 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type GameRecord = {
  id: string;
  white: string;
  black: string;
  humanColor: Color;
  result: string;
  termination: string | null;
  levelId: string;
  clockMinutes: number;
  clockIncrementSeconds: number;
  plies: number;
  moves: string[];
  pgn: string;
};

export type BuildResult =
  | { ok: true; record: GameRecord }
  | { ok: false; error: string };

const isColor = (value: unknown): value is Color =>
  value === "w" || value === "b";
const isColorOrNull = (value: unknown): value is Color | null =>
  value === null || isColor(value);

function isOneOf(options: readonly number[], value: unknown): value is number {
  return typeof value === "number" && options.includes(value);
}

export function buildGameRecord(input: unknown, now: Date): BuildResult {
  if (typeof input !== "object" || input === null) {
    return { ok: false, error: "Invalid game." };
  }
  const data = input as Record<string, unknown>;

  if (typeof data.id !== "string" || !UUID.test(data.id)) {
    return { ok: false, error: "Invalid game id." };
  }
  const { moves } = data;
  if (
    !Array.isArray(moves) ||
    moves.length === 0 ||
    moves.length > MAX_PLIES ||
    !moves.every((m) => typeof m === "string" && m.length > 0 && m.length <= 12)
  ) {
    return { ok: false, error: "Invalid move list." };
  }
  if (!isColor(data.humanColor)) {
    return { ok: false, error: "Invalid side." };
  }
  const level = ENGINE_LEVELS.find((l) => l.id === data.levelId);
  if (!level) return { ok: false, error: "Invalid level." };
  if (
    !isOneOf(MINUTE_OPTIONS, data.clockMinutes) ||
    !isOneOf(INCREMENT_OPTIONS, data.clockIncrementSeconds)
  ) {
    return { ok: false, error: "Invalid clock." };
  }
  if (!isColorOrNull(data.timedOut) || !isColorOrNull(data.resigned)) {
    return { ok: false, error: "Invalid ending." };
  }

  const sans = moves as string[];
  let game;
  try {
    game = replay(sans);
  } catch {
    return { ok: false, error: "The moves are not a legal game." };
  }

  const human = data.humanColor;
  const players =
    human === "w"
      ? { white: "You", black: "Stockfish" }
      : { white: "Stockfish", black: "You" };
  const { timedOut, resigned } = data;

  return {
    ok: true,
    record: {
      id: data.id,
      ...players,
      humanColor: human,
      result: pgnResult(game, timedOut ?? resigned),
      termination: getOutcome(game, timedOut, resigned)?.kind ?? null,
      levelId: level.id,
      clockMinutes: data.clockMinutes,
      clockIncrementSeconds: data.clockIncrementSeconds,
      plies: sans.length,
      moves: sans,
      pgn: toPgn(sans, now, players, timedOut, resigned),
    },
  };
}

export type Verdict = "win" | "loss" | "draw" | "unfinished";

/** The result from the human's side, for the history list. */
export function verdictFor(result: string, human: Color): Verdict {
  if (result === "1/2-1/2") return "draw";
  if (result === "1-0") return human === "w" ? "win" : "loss";
  if (result === "0-1") return human === "b" ? "win" : "loss";
  return "unfinished";
}
