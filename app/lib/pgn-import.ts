import { Chess } from "chess.js";
import { replay } from "./chess-game.ts";
import {
  MAX_PGN_LENGTH,
  hasVariations,
  looksLikeMultipleGames,
  normalizePgn,
} from "./pgn-text.ts";

// Turns pasted PGN text into a SAN move list for the analysis board. chess.js
// does all the parsing and move validation (headers, comments, annotations and
// the main line); this file only checks what the analysis board can show and
// words the problems. The analysis model is a single line, so variations are
// left out and the result says when that happened.

export type PgnImportSuccess = {
  ok: true;
  /** SAN moves of the main line, in order. */
  moves: string[];
  /** Player names from the headers, when given. */
  white: string | null;
  black: string | null;
  /** "1-0", "0-1" or "1/2-1/2" from the Result header, when decided. */
  result: string | null;
  /** True when the movetext appears to contain variations that were left out. */
  variationsIgnored: boolean;
};

export type PgnImportFailure = {
  ok: false;
  /** What went wrong, in plain words. */
  error: string;
  /** The parser's own message, when it adds something useful. */
  detail?: string;
};

export type PgnImportResult = PgnImportSuccess | PgnImportFailure;

const DECIDED_RESULTS = new Set(["1-0", "0-1", "1/2-1/2"]);

/** First line of a thrown error, shortened so it fits in the dialog. */
function describeError(error: unknown): string | undefined {
  if (!(error instanceof Error)) return undefined;
  const line = error.message.split("\n")[0].trim();
  if (line === "") return undefined;
  return line.length > 160 ? `${line.slice(0, 157)}…` : line;
}

/** A header value, or null when it is missing, empty or the PGN placeholder "?". */
function headerValue(
  headers: Record<string, string | null | undefined>,
  key: string,
): string | null {
  const value = headers[key];
  return typeof value === "string" && value !== "" && value !== "?"
    ? value
    : null;
}

export function parsePgn(input: string): PgnImportResult {
  const pgn = normalizePgn(input);

  if (pgn === "") {
    return { ok: false, error: "Paste a PGN to import." };
  }
  if (pgn.length > MAX_PGN_LENGTH) {
    return {
      ok: false,
      error: "This text is too long to be a single game.",
    };
  }
  if (looksLikeMultipleGames(pgn)) {
    return {
      ok: false,
      error: "This looks like more than one game. Paste a single game.",
    };
  }

  const game = new Chess();
  try {
    game.loadPgn(pgn);
  } catch (error) {
    return {
      ok: false,
      error:
        "Couldn't read this PGN. Check the moves for typos or illegal moves.",
      detail: describeError(error),
    };
  }

  // chess.js's history is the main line only; variations are never in it.
  const moves = game.history();
  if (moves.length === 0) {
    return { ok: false, error: "This PGN has no moves to import." };
  }

  // The analysis board always starts from the standard position. A game that
  // starts elsewhere (a FEN header) cannot be replayed from there, so refuse it
  // rather than show the wrong position.
  let fromStandardStart = false;
  try {
    fromStandardStart = replay(moves).fen() === game.fen();
  } catch {
    fromStandardStart = false;
  }
  if (!fromStandardStart) {
    return {
      ok: false,
      error:
        "This game doesn't start from the standard position, which the analysis board can't load yet.",
    };
  }

  const headers: Record<string, string | null | undefined> = game.header();
  const result = headerValue(headers, "Result");
  return {
    ok: true,
    moves,
    white: headerValue(headers, "White"),
    black: headerValue(headers, "Black"),
    result: result !== null && DECIDED_RESULTS.has(result) ? result : null,
    variationsIgnored: hasVariations(pgn),
  };
}
