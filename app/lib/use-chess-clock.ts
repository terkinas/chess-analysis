"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Color } from "chess.js";
import {
  applyMove,
  createClock,
  flagClock,
  remainingAt,
  restoreClock,
  setSearching,
  stopClock,
  type AfterMove,
  type ClockState,
} from "./chess-clock";

type Options = {
  /** `side` ran out of time. The clock has already stopped when this is called. */
  onFlag: (side: Color) => void;
};

/**
 * React wrapper around the pure clock in `chess-clock.ts`. Time is read only
 * in the returned actions and in the flag timer, never during render, so it is
 * safe for prerendering. While a clock runs, one timeout is armed for the
 * moment that side would reach zero; display components tick on their own.
 */
export function useChessClock({ onFlag }: Options) {
  // Placeholder until the first game starts; the page shows the chosen
  // settings from `createClock` itself while the game is in setup.
  const [clock, setClock] = useState<ClockState>(() => createClock(Infinity));
  const onFlagRef = useRef(onFlag);

  useEffect(() => {
    onFlagRef.current = onFlag;
  });

  // Reads the time once, in the caller's event, then applies a pure update.
  const update = useCallback(
    (change: (state: ClockState, now: number) => ClockState) => {
      const now = performance.now();
      setClock((state) => change(state, now));
    },
    [],
  );

  useEffect(() => {
    if (!clock.running) return;
    const side = clock.turn;
    if (!Number.isFinite(clock.remaining[side])) return;

    let timer: ReturnType<typeof setTimeout>;
    const check = () => {
      const left = remainingAt(clock, performance.now())[side];
      if (left > 0) {
        // Timers may fire a little early; wait out the rest.
        timer = setTimeout(check, left);
        return;
      }
      setClock((state) => flagClock(state, performance.now(), side));
      onFlagRef.current(side);
    };
    timer = setTimeout(
      check,
      Math.max(0, remainingAt(clock, performance.now())[side]),
    );
    return () => clearTimeout(timer);
  }, [clock]);

  /** A new game: both clocks reset; `run` starts the side to move (White). */
  const begin = useCallback(
    (initialMs: number, run: boolean) =>
      update((_state, now) => createClock(initialMs, run, now)),
    [update],
  );

  /** The side to move has played. */
  const move = useCallback(
    (incrementMs: number, after: AfterMove) =>
      update((state, now) => applyMove(state, now, incrementMs, after)),
    [update],
  );

  /** The engine started (true) or stopped without moving (false) its search. */
  const search = useCallback(
    (side: Color, searching: boolean) =>
      update((state, now) => setSearching(state, now, side, searching)),
    [update],
  );

  /** Freeze both clocks (game over, or back to setup). */
  const stop = useCallback(
    () => update((state, now) => stopClock(state, now)),
    [update],
  );

  /** Takeback: clocks return to where they were after `plies` plies. */
  const restore = useCallback(
    (plies: number, after: "run" | "hold") =>
      update((state, now) => restoreClock(state, now, plies, after)),
    [update],
  );

  return { clock, begin, move, search, stop, restore };
}
