import type { Color } from "chess.js";

// A framework-free chess clock. Nothing here reads the time or sets timers:
// every function takes `now` (a monotonic timestamp in ms) from its caller, so
// the model is deterministic and unit-testable. It knows nothing about chess
// rules either; the game decides when a move was made and whether it ended
// the game.

export type ClockSettings = {
  /** Starting time per side in minutes; 0 means the game is untimed. */
  minutes: number;
  /** Fischer increment, added to the mover's clock after each move. */
  incrementSeconds: number;
};

export const DEFAULT_CLOCK_SETTINGS: ClockSettings = {
  minutes: 10,
  incrementSeconds: 0,
};

/** 0 = no clock. */
export const MINUTE_OPTIONS = [0, 1, 3, 5, 10, 15, 30, 60] as const;
export const INCREMENT_OPTIONS = [0, 1, 2, 3, 5, 10, 15, 30] as const;

/** Below this the clock shows tenths of a second and warns. */
export const LOW_TIME_MS = 10_000;

export function isTimed(settings: ClockSettings): boolean {
  return settings.minutes > 0;
}

/** Starting time in ms; untimed games get an infinite clock that never runs out. */
export function initialMsOf(settings: ClockSettings): number {
  return isTimed(settings) ? settings.minutes * 60_000 : Infinity;
}

export function incrementMsOf(settings: ClockSettings): number {
  return isTimed(settings) ? settings.incrementSeconds * 1000 : 0;
}

export type Remaining = Record<Color, number>;

export type ClockState = {
  /** Time left per side, exact as of `since` while the clock is running. */
  remaining: Remaining;
  /** The side to move: the only clock that can run. */
  turn: Color;
  running: boolean;
  /** Timestamp at which `remaining` was last exact. */
  since: number;
  /** The game is over (checkmate, draw or flag): nothing can start the clock. */
  ended: boolean;
  /** Time left after N plies (index 0 = the start), so undo can restore it. */
  snapshots: readonly Remaining[];
};

export function createClock(
  initialMs: number,
  running = false,
  now = 0,
): ClockState {
  const remaining: Remaining = { w: initialMs, b: initialMs };
  return {
    remaining,
    turn: "w",
    running,
    since: now,
    ended: false,
    snapshots: [remaining],
  };
}

/** Time left per side at `now`; only the running side's clock moves. */
export function remainingAt(state: ClockState, now: number): Remaining {
  if (!state.running) return state.remaining;
  const elapsed = Math.max(0, now - state.since);
  return {
    ...state.remaining,
    [state.turn]: Math.max(0, state.remaining[state.turn] - elapsed),
  };
}

/** What happens to the clock once a move has been made. */
export type AfterMove =
  /** The next side's clock starts now. */
  | "run"
  /** The next side's clock waits (the engine starts its own when it begins to search). */
  | "hold"
  /** The move ended the game. */
  | "end";

/**
 * The side to move plays: its clock stops, it receives the increment, and the
 * turn passes. Ignored once the game has ended.
 */
export function applyMove(
  state: ClockState,
  now: number,
  incrementMs: number,
  after: AfterMove,
): ClockState {
  if (state.ended) return state;
  const mover = state.turn;
  const settled = remainingAt(state, now);
  const remaining: Remaining = {
    ...settled,
    [mover]: settled[mover] + incrementMs,
  };
  return {
    remaining,
    turn: mover === "w" ? "b" : "w",
    running: after === "run",
    since: now,
    ended: after === "end",
    snapshots: [...state.snapshots, remaining],
  };
}

/**
 * Starts or pauses the clock of `side` while it is that side's turn, for
 * example while the engine is (not) searching. Anything else is ignored.
 */
export function setSearching(
  state: ClockState,
  now: number,
  side: Color,
  searching: boolean,
): ClockState {
  if (state.ended || state.turn !== side || state.running === searching) {
    return state;
  }
  return {
    ...state,
    remaining: remainingAt(state, now),
    running: searching,
    since: now,
  };
}

/** Freezes the clocks because the game ended. */
export function stopClock(state: ClockState, now: number): ClockState {
  return {
    ...state,
    remaining: remainingAt(state, now),
    running: false,
    since: now,
    ended: true,
  };
}

/** `side` ran out of time. */
export function flagClock(
  state: ClockState,
  now: number,
  side: Color,
): ClockState {
  return {
    ...state,
    remaining: { ...remainingAt(state, now), [side]: 0 },
    running: false,
    since: now,
    ended: true,
  };
}

/**
 * Returns to the clocks as they stood after `plies` plies (a takeback), and
 * runs or holds the clock of the side to move. Unchanged if that moment was
 * never recorded.
 */
export function restoreClock(
  state: ClockState,
  now: number,
  plies: number,
  after: "run" | "hold",
): ClockState {
  const snapshot = state.snapshots[plies];
  if (!snapshot) return state;
  return {
    remaining: snapshot,
    turn: plies % 2 === 0 ? "w" : "b",
    running: after === "run",
    since: now,
    ended: false,
    snapshots: state.snapshots.slice(0, plies + 1),
  };
}

/** "9:41", or "0:07.3" once under ten seconds. */
export function formatClock(ms: number): string {
  if (!Number.isFinite(ms)) return "--:--";
  const clamped = Math.max(0, ms);
  if (clamped < LOW_TIME_MS) {
    const tenths = Math.ceil(clamped / 100);
    return `0:${String(Math.floor(tenths / 10)).padStart(2, "0")}.${tenths % 10}`;
  }
  const totalSeconds = Math.ceil(clamped / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  return `${minutes}:${String(totalSeconds % 60).padStart(2, "0")}`;
}

/** Label for a settings pair, e.g. "10 min" or "5 min + 3 s". */
export function describeClock(settings: ClockSettings): string {
  if (!isTimed(settings)) return "No clock";
  const base = `${settings.minutes} min`;
  return settings.incrementSeconds > 0
    ? `${base} + ${settings.incrementSeconds} s`
    : base;
}
