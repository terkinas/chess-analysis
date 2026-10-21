// Pure helpers for reading UCI `info` lines and presenting scores. No React,
// no worker, no chess.js: everything here is plain string/number handling so it
// can be tested on its own.
//
// UCI reports every score from the point of view of the side to move. The UI
// shows a single consistent scale, so scores are converted to White's point of
// view with `toWhiteScore` before they are displayed.

type Color = "w" | "b";

/** A score exactly as the engine reports it: relative to the side to move. */
export type UciScore =
  | { kind: "cp"; /** Centipawns; positive is good for the side to move. */ value: number }
  | {
      kind: "mate";
      /**
       * Full moves to mate. Positive: the side to move delivers mate.
       * Negative: the side to move gets mated. Zero: it is already mated.
       */
      moves: number;
    };

/** The parts of an `info` line the analysis cares about. */
export type UciInfo = {
  depth: number;
  score: UciScore;
  /**
   * Principal variation of the `multipv 1` line in UCI notation; may be empty.
   * It ends at the first token that is not a well-formed UCI move.
   */
  pv: string[];
};

/** A score from White's point of view, whoever is to move. */
export type WhiteScore =
  | { kind: "cp"; /** Centipawns; positive favours White. */ cp: number }
  | {
      kind: "mate";
      /** Which side delivers mate. */
      winner: Color;
      /** Full moves until mate; 0 means the position is already checkmate. */
      moves: number;
    };

const INTEGER = /^-?\d+$/;
const UCI_MOVE_TOKEN = /^[a-h][1-8][a-h][1-8][qrbn]?$/;

/** The leading run of well-formed UCI moves in `tokens`. */
function takeUciMoves(tokens: readonly string[]): string[] {
  const end = tokens.findIndex((token) => !UCI_MOVE_TOKEN.test(token));
  return tokens.slice(0, end === -1 ? tokens.length : end);
}

function parseInteger(token: string | undefined): number | null {
  if (token === undefined || !INTEGER.test(token)) return null;
  const value = Number(token);
  return Number.isSafeInteger(value) ? value : null;
}

/**
 * Parses an `info` line from any principal variation (`multipv`), with the
 * number of that line. Lines that are not `info`, have no score, have a
 * malformed score, or report a bound instead of an exact score are ignored
 * rather than guessed at.
 */
export function parseScoredInfo(
  line: string,
): { multipv: number; info: UciInfo } | null {
  const tokens = line.trim().split(/\s+/);
  if (tokens[0] !== "info") return null;
  // Free text after `string` can contain anything, including the word "score".
  if (tokens.includes("string")) return null;

  let depth: number | null = null;
  let score: UciScore | null = null;
  let isBound = false;
  let multipv = 1;
  let pv: string[] = [];

  for (let i = 1; i < tokens.length; i++) {
    switch (tokens[i]) {
      case "depth": {
        depth = parseInteger(tokens[i + 1]);
        break;
      }
      case "multipv": {
        const value = parseInteger(tokens[i + 1]);
        if (value !== null) multipv = value;
        break;
      }
      case "score": {
        const type = tokens[i + 1];
        const value = parseInteger(tokens[i + 2]);
        if (value === null) return null;
        if (type === "cp") score = { kind: "cp", value };
        else if (type === "mate") score = { kind: "mate", moves: value };
        else return null;
        const flag = tokens[i + 3];
        if (flag === "lowerbound" || flag === "upperbound") isBound = true;
        break;
      }
      case "pv": {
        // The principal variation runs to the end of the line.
        pv = takeUciMoves(tokens.slice(i + 1));
        i = tokens.length;
        break;
      }
    }
  }

  if (!score || isBound) return null;
  if (depth === null || depth < 0) return null;
  return { multipv, info: { depth, score, pv } };
}

/**
 * Parses an `info` line that carries a usable score for the best line
 * (`multipv` 1), or returns null. Lines of secondary lines (`multipv` 2+) are
 * ignored here; see `parseScoredInfo` to read them.
 */
export function parseInfoLine(line: string): UciInfo | null {
  const parsed = parseScoredInfo(line);
  return parsed && parsed.multipv === 1 ? parsed.info : null;
}

/** The side to move in a FEN, or null if the FEN has no valid turn field. */
export function turnFromFen(fen: string): Color | null {
  const turn = fen.trim().split(/\s+/)[1];
  return turn === "w" || turn === "b" ? turn : null;
}

/**
 * Converts a side-to-move score into White's point of view. `turn` is the side
 * to move in the position that was searched.
 */
export function toWhiteScore(score: UciScore, turn: Color): WhiteScore {
  const opponent: Color = turn === "w" ? "b" : "w";
  if (score.kind === "cp") {
    // `|| 0` avoids a negative zero.
    return { kind: "cp", cp: (turn === "w" ? score.value : -score.value) || 0 };
  }
  // `mate 0` means the side to move has been checkmated.
  const winner = score.moves > 0 ? turn : opponent;
  return { kind: "mate", winner, moves: Math.abs(score.moves) };
}

/**
 * Compact score for display, always from White's side: "+0.34", "-1.20",
 * "0.00", "+M3" (White mates in 3), "-M3" (Black mates in 3). Checkmate on the
 * board is "1-0" / "0-1".
 */
export function formatWhiteScore(score: WhiteScore): string {
  if (score.kind === "cp") {
    if (score.cp === 0) return "0.00";
    const pawns = (Math.abs(score.cp) / 100).toFixed(2);
    return `${score.cp > 0 ? "+" : "-"}${pawns}`;
  }
  if (score.moves === 0) return score.winner === "w" ? "1-0" : "0-1";
  return `${score.winner === "w" ? "+" : "-"}M${score.moves}`;
}

/** Plain-language version of a score for screen readers and tooltips. */
export function describeWhiteScore(score: WhiteScore): string {
  if (score.kind === "mate") {
    const side = score.winner === "w" ? "White" : "Black";
    if (score.moves === 0) return `Checkmate — ${side} wins`;
    const unit = score.moves === 1 ? "move" : "moves";
    return `${side} mates in ${score.moves} ${unit}`;
  }
  if (score.cp === 0) return "Equal position";
  const side = score.cp > 0 ? "White" : "Black";
  return `${side} is better by ${(Math.abs(score.cp) / 100).toFixed(2)} pawns`;
}
