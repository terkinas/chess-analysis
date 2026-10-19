import type { Color } from "chess.js";
import { getOutcome, replay, toPgn, type GameOutcome } from "./chess-game.ts";
import { INCREMENT_OPTIONS, MINUTE_OPTIONS } from "./chess-clock.ts";
import { ENGINE_LEVELS } from "./engine-levels.ts";

// What gets stored for a finished game, and the checks that stand between the
// browser and the database. The browser only sends the facts it knows (moves,
// colour, level, clock, who resigned or flagged); the result, termination and
// PGN are worked out here by replaying the moves with chess.js, so a bad or
// hand-made request can never store an illegal game or a made-up result.
// The string unions match the enums in prisma/schema.prisma.

export type PlayerColor = "WHITE" | "BLACK";
export type GameResult = "WHITE_WIN" | "BLACK_WIN" | "DRAW";
export type Termination =
  | "CHECKMATE"
  | "STALEMATE"
  | "DRAW"
  | "TIMEOUT"
  | "RESIGNATION";

/** The body the browser sends to save (or re-save) a finished game. */
export type SaveGameRequest = {
  id: string;
  moves: readonly string[];
  humanColor: Color;
  levelId: string;
  clockMinutes: number;
  clockIncrementSeconds: number;
  /** The side whose clock ran out, if the game ended on time. */
  timedOut: Color | null;
  /** The side that resigned, if the game ended that way. */
  resigned: Color | null;
};

/** One row of the games table, minus the date. */
export type GameRecord = {
  id: string;
  pgn: string;
  plies: number;
  humanColor: PlayerColor;
  result: GameResult;
  termination: Termination;
  engineLevel: string;
  clockMinutes: number;
  clockIncrementSeconds: number;
};

/** A stored game as the history API returns it (dates travel as ISO text). */
export type StoredGame = GameRecord & { playedAt: string };

export type ParseResult =
  | { ok: true; record: GameRecord }
  | { ok: false; error: string };

/** Ids are made by the browser; this keeps them short and URL-safe. */
export const GAME_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

/** Far beyond any real game; stops absurd payloads before they are replayed. */
export const MAX_PLIES = 1000;

const TERMINATIONS: Record<GameOutcome["kind"], Termination> = {
  checkmate: "CHECKMATE",
  stalemate: "STALEMATE",
  draw: "DRAW",
  timeout: "TIMEOUT",
  resignation: "RESIGNATION",
};

const fail = (error: string): ParseResult => ({ ok: false, error });

function isColor(value: unknown): value is Color {
  return value === "w" || value === "b";
}

/** Validates a save request and turns it into the row to store. */
export function parseSaveRequest(body: unknown, now: Date): ParseResult {
  if (typeof body !== "object" || body === null) {
    return fail("Expected a JSON object.");
  }
  const b = body as Record<string, unknown>;

  if (typeof b.id !== "string" || !GAME_ID_PATTERN.test(b.id)) {
    return fail("Invalid game id.");
  }

  const { moves } = b;
  if (
    !Array.isArray(moves) ||
    moves.length === 0 ||
    moves.length > MAX_PLIES ||
    !moves.every((m) => typeof m === "string" && m.length > 0 && m.length <= 16)
  ) {
    return fail("Invalid move list.");
  }

  if (!isColor(b.humanColor)) return fail("Invalid player colour.");
  const humanColor = b.humanColor;

  const timedOut = b.timedOut ?? null;
  const resigned = b.resigned ?? null;
  if (timedOut !== null && !isColor(timedOut)) return fail("Invalid timeout.");
  if (resigned !== null && !isColor(resigned)) {
    return fail("Invalid resignation.");
  }
  // Only the human can resign; Stockfish never does.
  if (resigned !== null && resigned !== humanColor) {
    return fail("Only the human player can resign.");
  }

  const { levelId } = b;
  if (
    typeof levelId !== "string" ||
    !ENGINE_LEVELS.some((level) => level.id === levelId)
  ) {
    return fail("Unknown engine level.");
  }

  const { clockMinutes, clockIncrementSeconds } = b;
  if (
    typeof clockMinutes !== "number" ||
    !(MINUTE_OPTIONS as readonly number[]).includes(clockMinutes) ||
    typeof clockIncrementSeconds !== "number" ||
    !(INCREMENT_OPTIONS as readonly number[]).includes(clockIncrementSeconds)
  ) {
    return fail("Invalid clock settings.");
  }

  let game;
  try {
    game = replay(moves as string[]);
  } catch {
    return fail("The move list is not a legal game.");
  }

  const outcome = getOutcome(game, timedOut, resigned);
  if (!outcome) return fail("The game is not finished.");

  const players =
    humanColor === "w"
      ? { white: "You", black: "Stockfish" }
      : { white: "Stockfish", black: "You" };

  return {
    ok: true,
    record: {
      id: b.id,
      pgn: toPgn(moves as string[], now, players, timedOut, resigned),
      plies: moves.length,
      humanColor: humanColor === "w" ? "WHITE" : "BLACK",
      result:
        outcome.winner === null
          ? "DRAW"
          : outcome.winner === "w"
            ? "WHITE_WIN"
            : "BLACK_WIN",
      termination: TERMINATIONS[outcome.kind],
      engineLevel: levelId,
      clockMinutes,
      // An untimed game has no increment, whatever the setup dialog held.
      clockIncrementSeconds: clockMinutes === 0 ? 0 : clockIncrementSeconds,
    },
  };
}
