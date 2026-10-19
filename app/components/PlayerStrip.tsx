"use client";

import { useEffect, useState } from "react";
import type { Color } from "chess.js";
import {
  LOW_TIME_MS,
  formatClock,
  remainingAt,
  type ClockState,
} from "../lib/chess-clock";

const COLOR_NAMES: Record<Color, string> = { w: "White", b: "Black" };

type ClockFaceProps = {
  clock: ClockState;
  side: Color;
};

// Ticks on its own so the rest of the game UI does not re-render every tick.
// The clock state stays the source of truth: this only reads it.
function ClockFace({ clock, side }: ClockFaceProps) {
  const [now, setNow] = useState(0);
  const running = clock.running && clock.turn === side;
  const remaining = remainingAt(clock, now)[side];
  const low = remaining < LOW_TIME_MS;

  useEffect(() => {
    if (!running) return;
    // Finer ticks once tenths of a second are shown.
    const id = setInterval(
      () => setNow(performance.now()),
      low ? 100 : 250,
    );
    return () => clearInterval(id);
  }, [running, low]);

  const flagged = clock.ended && remaining <= 0;
  const tone = flagged
    ? "bg-background text-danger"
    : running
      ? low
        ? "bg-danger text-background"
        : "bg-accent text-background"
      : low
        ? "bg-background text-danger"
        : "bg-background text-foreground";

  return (
    <span
      role="timer"
      aria-label={`${COLOR_NAMES[side]} clock`}
      className={`min-w-[4.75rem] rounded px-2.5 py-0.5 text-right font-mono text-lg font-semibold tabular-nums transition-colors ${tone}`}
    >
      {formatClock(remaining)}
    </span>
  );
}

type PlayerStripProps = {
  side: Color;
  name: string;
  /** Muted text after the name, e.g. "Black · Standard". */
  detail: string;
  /** Null for an untimed game: no clock is shown. */
  clock: ClockState | null;
  /** True while it is this player's turn in a live game. */
  toMove: boolean;
};

export default function PlayerStrip({
  side,
  name,
  detail,
  clock,
  toMove,
}: PlayerStripProps) {
  return (
    <div
      role="group"
      aria-label={`${COLOR_NAMES[side]}: ${name}`}
      className="flex items-center justify-between gap-3 rounded-md border border-line bg-surface px-3 py-1.5"
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <span
          aria-hidden
          className={`size-3.5 shrink-0 rounded-full border ${
            side === "w"
              ? "border-board-light bg-board-light"
              : "border-muted bg-background"
          } ${toMove ? "ring-2 ring-accent ring-offset-2 ring-offset-surface" : ""}`}
        />
        <p className="truncate text-sm">
          <span className="font-medium text-foreground">{name}</span>{" "}
          <span className="text-xs text-muted">{detail}</span>
        </p>
      </div>
      {clock && <ClockFace clock={clock} side={side} />}
    </div>
  );
}
