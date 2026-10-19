// The analysis board's move line and cursor, as plain data. Nothing here knows
// about chess rules: legality is decided by chess.js before a move reaches
// `playMove`. Keeping `moves` and `ply` in one value means they can never get
// out of step.

export type AnalysisLine = {
  /** SAN moves on the line, including any after the cursor. */
  moves: readonly string[];
  /** How many plies of `moves` are shown on the board (0 = start). */
  ply: number;
};

export const START_LINE: AnalysisLine = { moves: [], ply: 0 };

/** Moves the cursor to `target`, clamped to the ends of the line. */
export function goToPly(line: AnalysisLine, target: number): AnalysisLine {
  const ply = Number.isFinite(target)
    ? Math.min(line.moves.length, Math.max(0, Math.trunc(target)))
    : line.ply;
  return ply === line.ply ? line : { moves: line.moves, ply };
}

/**
 * Plays `san` from the position the cursor is on. Anything after the cursor is
 * dropped (there are no variations), so the new move is always the last one on
 * the line and the cursor sits on it.
 */
export function playMove(line: AnalysisLine, san: string): AnalysisLine {
  const moves = [...line.moves.slice(0, line.ply), san];
  return { moves, ply: moves.length };
}

/**
 * Plays `sans` in order from the position the cursor is on, like repeated
 * `playMove`: anything after the cursor is dropped and the cursor ends on the
 * last new move. An empty list leaves the line as it is.
 */
export function playMoves(
  line: AnalysisLine,
  sans: readonly string[],
): AnalysisLine {
  if (sans.length === 0) return line;
  const moves = [...line.moves.slice(0, line.ply), ...sans];
  return { moves, ply: moves.length };
}

export const canStepBack = (line: AnalysisLine) => line.ply > 0;
export const canStepForward = (line: AnalysisLine) =>
  line.ply < line.moves.length;

/** A line made of `moves`, with the cursor on the last one (the final position). */
export function lineFromMoves(moves: readonly string[]): AnalysisLine {
  return { moves: [...moves], ply: moves.length };
}
