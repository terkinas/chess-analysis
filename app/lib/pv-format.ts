// Pure helpers for the principal variation (PV): choosing it, numbering its
// moves, and the bookkeeping for stepping through it. No chess.js here (the
// SAN conversion lives in `pv-line.ts`), so everything can be tested on its own.

type Color = "w" | "b";

/** One engine move: its UCI form, its SAN, and the position after it. */
export type PvMove = {
  uci: string;
  san: string;
  fen: string;
};

/** A PV replayed on a separate chess.js instance, starting from `startFen`. */
export type PvLine = {
  /** The analysed position the line starts from. */
  startFen: string;
  moves: readonly PvMove[];
  /** True when the engine's line was cut at a move that was invalid here. */
  stoppedEarly: boolean;
};

/** The longest line shown, in plies. Keeps the panel compact. */
export const MAX_PV_PLIES = 12;

/**
 * The UCI moves to replay: the engine's PV when it starts with the validated
 * best move, otherwise just the best move, so the line can never contradict the
 * suggestion shown next to it.
 */
export function choosePv(bestUci: string, infoPv: readonly string[]): string[] {
  const line = infoPv[0] === bestUci ? infoPv : [bestUci];
  return line.slice(0, MAX_PV_PLIES);
}

export type PvStart = {
  turn: Color;
  /** The FEN's fullmove number; the number of the first PV move's pair. */
  fullmove: number;
};

/** Side to move and move number from a FEN; null if the turn is invalid. */
export function pvStartFromFen(fen: string): PvStart | null {
  const fields = fen.trim().split(/\s+/);
  const turn = fields[1];
  if (turn !== "w" && turn !== "b") return null;
  const fullmove = Number(fields[5]);
  return {
    turn,
    fullmove: Number.isInteger(fullmove) && fullmove >= 1 ? fullmove : 1,
  };
}

export type PvEntry = {
  /** 0-based position in the line. */
  index: number;
  san: string;
  /** The side that plays this move. */
  color: Color;
  /** Full-move number of this move (a Black reply shares its White move's). */
  number: number;
  /**
   * "12." before a White move; "12…" before a Black move that opens the line
   * (it has no White move before it); null for a Black reply, which follows its
   * White move directly.
   */
  label: string | null;
};

/** Numbers `sans` starting from either side to move. */
export function labelPvMoves(start: PvStart, sans: readonly string[]): PvEntry[] {
  let color = start.turn;
  let number = start.fullmove;
  return sans.map((san, index) => {
    const label =
      color === "w" ? `${number}.` : index === 0 ? `${number}…` : null;
    const entry: PvEntry = { index, san, color, number, label };
    if (color === "b") number += 1;
    color = color === "w" ? "b" : "w";
    return entry;
  });
}

/** One-line text form, e.g. "12… Nf6 13. Bb5 a6". */
export function formatPvText(entries: readonly PvEntry[]): string {
  return entries
    .map((entry) => (entry.label ? `${entry.label} ${entry.san}` : entry.san))
    .join(" ");
}

/**
 * The position after `index` PV moves (0 = the analysed position). The index
 * is clamped to the line.
 */
export function pvFenAt(
  pv: { startFen: string; moves: readonly { fen: string }[] },
  index: number,
): string {
  if (!(index > 0)) return pv.startFen;
  const move = pv.moves[Math.min(Math.trunc(index), pv.moves.length) - 1];
  return move ? move.fen : pv.startFen;
}

/**
 * Next PV index after stepping. `null` means "not browsing the PV": stepping
 * forward from there enters the line at its first move, stepping back stays out.
 * Within the line the index is clamped to 0..length.
 */
export function stepPvIndex(
  current: number | null,
  delta: 1 | -1,
  length: number,
): number | null {
  if (length <= 0) return null;
  if (current === null) return delta === 1 ? 1 : null;
  return Math.min(length, Math.max(0, current + delta));
}

/**
 * True while `pv` was computed for exactly the position in `fen`. Applying a PV
 * to the game is only allowed then: any other position means the line is stale.
 */
export function pvMatchesPosition(
  pv: { startFen: string },
  fen: string,
): boolean {
  return pv.startFen === fen;
}

/** Temporary PV browsing: which line, and how many of its moves are applied. */
export type PvView = {
  pv: PvLine;
  index: number;
};

/**
 * The view, but only while it belongs to `current`, the PV on show now. A view
 * of a PV that was replaced or discarded (new position, new evaluation, reset,
 * import) is dead, so it can never put an old line back on the board.
 */
export function activePvView(
  view: PvView | null,
  current: PvLine | null,
): PvView | null {
  return view && current && view.pv === current ? view : null;
}
