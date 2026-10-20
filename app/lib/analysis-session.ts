// The analysis board's lines, as plain data. A session has one MAIN line, the
// game as it was imported or first recorded, plus any number of VARIATIONS the
// user explored from earlier positions. Nothing here knows chess rules:
// legality is decided by chess.js before a move reaches `playMoveInSession`.
//
// Every line is a full SAN list from the starting position (a variation repeats
// the moves it shares with the line it branched from), so any line can be
// replayed on its own. `activeId` and `ply` say which line is on the board and
// how far; keeping them in one value with the lines means they cannot get out
// of step.
//
// The main line is never overwritten or truncated. Playing a move from an
// earlier position either follows a line that already makes that move, or
// starts a new variation. The one case where the main line itself grows is a
// move played at the end of a main line that was NOT imported (free play, where
// the line is simply the game being recorded). An imported main line is locked:
// playing on past its last move starts a variation.

import { goToPly, type AnalysisLine } from "./analysis-line.ts";

export type SessionLine = {
  id: number;
  /** SAN moves from the starting position, including the shared ones. */
  moves: readonly string[];
  /**
   * How many leading plies this line shares with the line it branched from;
   * 0 for the main line. The line's own moves start at index `branchPly`.
   */
  branchPly: number;
  /** The line it was created from, or null for the main line. */
  parentId: number | null;
};

export type AnalysisSession = {
  /** The main line first, then variations in creation order. */
  lines: readonly SessionLine[];
  /** The line shown on the board. */
  activeId: number;
  /** How many plies of the active line are shown (0 = start). */
  ply: number;
  /** True for an imported game: its end cannot be extended in place. */
  mainLocked: boolean;
  nextId: number;
};

export const MAIN_ID = 0;

/** A session whose main line is `moves`, with the cursor on its last move. */
export function newSession(
  moves: readonly string[] = [],
  mainLocked = false,
): AnalysisSession {
  return {
    lines: [{ id: MAIN_ID, moves: [...moves], branchPly: 0, parentId: null }],
    activeId: MAIN_ID,
    ply: moves.length,
    mainLocked,
    nextId: MAIN_ID + 1,
  };
}

/** The empty session: free play from the starting position. */
export const EMPTY_SESSION: AnalysisSession = newSession();

/** A session for an imported game; its main line is locked. */
export const importedSession = (moves: readonly string[]): AnalysisSession =>
  newSession(moves, true);

export function activeLine(session: AnalysisSession): SessionLine {
  return (
    session.lines.find((line) => line.id === session.activeId) ??
    session.lines[0]
  );
}

/** The active line and cursor as the plain `AnalysisLine` the board reads. */
export function lineView(session: AnalysisSession): AnalysisLine {
  return { moves: activeLine(session).moves, ply: session.ply };
}

export const isMainActive = (session: AnalysisSession): boolean =>
  session.activeId === MAIN_ID;

/** Moves the cursor along the active line, clamped to its ends. */
export function goToPlyInSession(
  session: AnalysisSession,
  target: number,
): AnalysisSession {
  const next = goToPly(lineView(session), target);
  return next.ply === session.ply ? session : { ...session, ply: next.ply };
}

function sharedPrefixLength(a: readonly string[], b: readonly string[]): number {
  const max = Math.min(a.length, b.length);
  let i = 0;
  while (i < max && a[i] === b[i]) i++;
  return i;
}

/**
 * Shows another line. The cursor stays where it is while that position is
 * shared by both lines; otherwise it lands on the first move where the target
 * line differs, so switching always shows what makes the line its own. Unknown
 * ids change nothing.
 */
export function selectLine(
  session: AnalysisSession,
  id: number,
): AnalysisSession {
  if (id === session.activeId) return session;
  const target = session.lines.find((line) => line.id === id);
  if (!target) return session;
  const shared = sharedPrefixLength(activeLine(session).moves, target.moves);
  const ply =
    session.ply <= shared
      ? session.ply
      : Math.min(shared + 1, target.moves.length);
  return { ...session, activeId: id, ply };
}

/**
 * Plays `san` from the position the cursor is on, never discarding anything:
 *  1. If a line already makes this move from this exact position (the active
 *     line's own next move, or another variation), that line is shown and the
 *     cursor steps onto the move; nothing is created.
 *  2. Otherwise, at the end of a line that may grow, the move is appended.
 *  3. Otherwise a new variation is created from this position.
 */
export function playMoveInSession(
  session: AnalysisSession,
  san: string,
): AnalysisSession {
  const current = activeLine(session);
  const ply = session.ply;
  const prefix = current.moves.slice(0, ply);

  // Own line first, then the rest in creation order.
  const candidates = [
    current,
    ...session.lines.filter((line) => line.id !== current.id),
  ];
  const existing = candidates.find(
    (line) =>
      line.moves.length > ply &&
      line.moves[ply] === san &&
      sharedPrefixLength(line.moves, prefix) >= ply,
  );
  if (existing) return { ...session, activeId: existing.id, ply: ply + 1 };

  const atEnd = ply === current.moves.length;
  const growable = !(current.id === MAIN_ID && session.mainLocked);
  if (atEnd && growable) {
    return {
      ...session,
      lines: session.lines.map((line) =>
        line.id === current.id ? { ...line, moves: [...prefix, san] } : line,
      ),
      ply: ply + 1,
    };
  }

  const variation: SessionLine = {
    id: session.nextId,
    moves: [...prefix, san],
    branchPly: ply,
    parentId: current.id,
  };
  return {
    ...session,
    lines: [...session.lines, variation],
    activeId: variation.id,
    ply: ply + 1,
    nextId: session.nextId + 1,
  };
}

/**
 * Plays `sans` in order, like repeated `playMoveInSession`: the first may start
 * a variation and the rest then continue it. An empty list changes nothing.
 */
export function playMovesInSession(
  session: AnalysisSession,
  sans: readonly string[],
): AnalysisSession {
  return sans.reduce(playMoveInSession, session);
}

/** "Main line" or "Variation 2" (numbered in creation order). */
export function lineName(session: AnalysisSession, id: number): string {
  if (id === MAIN_ID) return "Main line";
  const index = session.lines.findIndex((line) => line.id === id);
  return index > 0 ? `Variation ${index}` : "Main line";
}

/**
 * Where a variation leaves the line it came from, e.g. "after 3. Nf3" or
 * "after 2… e5"; "from the start" when it differs from the very first move.
 */
export function branchPointText(line: SessionLine): string | null {
  if (line.parentId === null) return null;
  if (line.branchPly === 0) return "from the start";
  const move = line.moves[line.branchPly - 1];
  const number = Math.ceil(line.branchPly / 2);
  return `after ${number}${line.branchPly % 2 === 1 ? "." : "…"} ${move}`;
}

export type LineOption = {
  id: number;
  /** Compact text for the selector: "Main" or "Var 2". */
  short: string;
  /** Full name: "Main line" or "Variation 2". */
  name: string;
  /** Where it branches, or null for the main line. */
  branch: string | null;
};

/** One entry per line, in order, for the line selector. */
export function lineOptions(session: AnalysisSession): LineOption[] {
  return session.lines.map((line, index) => ({
    id: line.id,
    short: index === 0 ? "Main" : `Var ${index}`,
    name: lineName(session, line.id),
    branch: branchPointText(line),
  }));
}
