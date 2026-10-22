"use client";

import { useState } from "react";
import type { LineKind, MoveExplanation } from "../lib/move-explanation";
import { labelPvMoves, pvStartFromFen } from "../lib/pv-format";

const SMALL_BUTTON =
  "rounded-md border border-line px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent aria-disabled:cursor-not-allowed aria-disabled:opacity-40 aria-disabled:hover:bg-transparent";

type Props = {
  explanation: MoveExplanation;
  /** The line on the board right now, if one from this card is shown. */
  lineView: { kind: LineKind; index: number } | null;
  onShowLine: (kind: LineKind) => void;
  onSelectLineIndex: (index: number) => void;
  onStepLine: (delta: 1 | -1) => void;
  onCloseLine: () => void;
};

/**
 * "Why this rating?": the reason for the move's label, and buttons that put the
 * engine's lines on the board to show it. Viewing a line never changes the game
 * (it is the same temporary view as the engine-line browser).
 */
export default function MoveExplanationCard({
  explanation,
  lineView,
  onShowLine,
  onSelectLineIndex,
  onStepLine,
  onCloseLine,
}: Props) {
  const [open, setOpen] = useState(false);
  const shown = lineView ? explanation.lines[lineView.kind] : null;
  const entries =
    shown && pvStartFromFen(shown.pv.startFen)
      ? labelPvMoves(
          pvStartFromFen(shown.pv.startFen)!,
          shown.pv.moves.map((move) => move.san),
        )
      : [];
  const hasLines = explanation.lines.best || explanation.lines.next;

  return (
    <div className="border-b border-line px-4 py-3">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="move-explanation-body"
        onClick={() => {
          if (open && lineView) onCloseLine();
          setOpen((value) => !value);
        }}
        className="flex w-full items-center justify-between gap-2 rounded-md text-left text-sm font-medium text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <span>Why this rating?</span>
        <span aria-hidden className="text-muted">
          {open ? "▴" : "▾"}
        </span>
      </button>

      {open && (
        <div id="move-explanation-body" className="mt-2 space-y-2 text-sm">
          <p className="text-foreground">{explanation.headline}</p>
          {explanation.points.length > 0 && (
            <ul className="list-disc space-y-1 pl-5 text-muted">
              {explanation.points.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          )}

          {hasLines && (
            <div className="flex flex-wrap gap-2 pt-1">
              {(["best", "next"] as const).map((kind) => {
                const option = explanation.lines[kind];
                if (!option) return null;
                const active = lineView?.kind === kind;
                return (
                  <button
                    key={kind}
                    type="button"
                    aria-pressed={active}
                    onClick={() => (active ? onCloseLine() : onShowLine(kind))}
                    className={`${SMALL_BUTTON} ${active ? "border-accent" : ""}`}
                  >
                    {active ? "Hide line" : option.label}
                  </button>
                );
              })}
            </div>
          )}

          {shown && lineView && (
            <div className="rounded-md border border-line p-2">
              <p className="mb-2 text-xs text-muted">
                {lineView.kind === "best"
                  ? "Engine line from the position before the move"
                  : "Engine line after the move was played"}
              </p>
              <ol className="flex flex-wrap gap-1 text-xs" aria-label="Engine line">
                {entries.map((entry) => (
                  <li key={entry.index}>
                    <button
                      type="button"
                      aria-current={lineView.index === entry.index + 1 ? "step" : undefined}
                      onClick={() => onSelectLineIndex(entry.index + 1)}
                      className={`rounded px-1.5 py-0.5 font-mono hover:bg-background focus-visible:outline-2 focus-visible:outline-accent ${
                        lineView.index === entry.index + 1
                          ? "bg-background font-semibold text-foreground"
                          : "text-muted"
                      }`}
                    >
                      {entry.label ? `${entry.label} ` : ""}
                      {entry.san}
                    </button>
                  </li>
                ))}
              </ol>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  aria-disabled={lineView.index === 0}
                  onClick={() => {
                    if (lineView.index > 0) onStepLine(-1);
                  }}
                  className={SMALL_BUTTON}
                >
                  ‹ Back
                </button>
                <button
                  type="button"
                  aria-disabled={lineView.index >= shown.pv.moves.length}
                  onClick={() => {
                    if (lineView.index < shown.pv.moves.length) onStepLine(1);
                  }}
                  className={SMALL_BUTTON}
                >
                  Forward ›
                </button>
                <button type="button" onClick={onCloseLine} className={SMALL_BUTTON}>
                  Back to game
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
