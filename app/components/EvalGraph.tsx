import type { KeyboardEvent, PointerEvent } from "react";
import type { AnalyzedMove } from "../lib/game-analysis";
import { markFor } from "../lib/quality-style";

type EvalGraphProps = {
  /** SAN of every move on the line, to describe the position under the cursor. */
  moves: readonly string[];
  /** One entry per move; only judged moves are plotted. */
  analyses: readonly (AnalyzedMove | null | undefined)[];
  /** Plies shown on the board (0 = starting position). */
  ply: number;
  onSelectPly: (ply: number) => void;
};

type Point = { ply: number; win: number };

// The whole game at a glance: White's chance of winning after every move, from
// the first move on the left to the last on the right. Light below the line is
// White's share, as on the evaluation bar, so a rise is good for White. Coloured
// dots mark the moves worth a look (see quality-style.ts), and the cursor marks
// the move on the board. The graph is also a slider: click or drag to jump to a
// move, or use the arrow keys when it has focus.
//
// The shapes are drawn in a stretched SVG; the dots and cursor are ordinary
// elements placed by percentage, so they stay round at any width.
export default function EvalGraph({
  moves,
  analyses,
  ply,
  onSelectPly,
}: EvalGraphProps) {
  const total = moves.length;
  if (total === 0) return null;

  const xPercent = (at: number) => (at / total) * 100;
  const yPercent = (win: number) => 100 - win;

  const points: Point[] = [{ ply: 0, win: 50 }];
  analyses.forEach((analysis, index) => {
    if (analysis) points.push({ ply: index + 1, win: analysis.whiteWin });
  });
  const last = points[points.length - 1];
  const line = points
    .map((p) => `${xPercent(p.ply)},${yPercent(p.win)}`)
    .join(" ");
  const area = `M0,100 L${line.replaceAll(" ", " L")} L${xPercent(last.ply)},100 Z`;
  const cursorPoint = points.find((p) => p.ply === ply);

  const mark = ply > 0 ? markFor(analyses[ply - 1]?.quality) : null;
  const valueText =
    ply === 0
      ? "Starting position"
      : `After ${Math.ceil(ply / 2)}${ply % 2 === 1 ? "." : "…"} ${moves[ply - 1]}${
          mark ? `, ${mark.label.toLowerCase()}` : ""
        }`;

  function select(target: number) {
    const clamped = Math.min(total, Math.max(0, target));
    if (clamped !== ply) onSelectPly(clamped);
  }

  function plyAt(event: PointerEvent<HTMLDivElement>): number {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width === 0) return ply;
    return Math.round(((event.clientX - rect.left) / rect.width) * total);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const target =
      event.key === "ArrowLeft" || event.key === "ArrowDown"
        ? ply - 1
        : event.key === "ArrowRight" || event.key === "ArrowUp"
          ? ply + 1
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? total
              : null;
    if (target === null) return;
    event.preventDefault();
    select(target);
  }

  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label="Evaluation graph. Left and right arrow keys step through the game."
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={ply}
      aria-valuetext={valueText}
      onKeyDown={onKeyDown}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        select(plyAt(event));
      }}
      onPointerMove={(event) => {
        if (event.buttons === 1) select(plyAt(event));
      }}
      className="relative h-16 cursor-pointer touch-pan-y rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:h-20"
    >
      <div className="absolute inset-0 overflow-hidden rounded-md bg-neutral-800 shadow-[0_0_0_1px_rgba(255,255,255,0.08)]">
        <svg
          aria-hidden
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="h-full w-full"
        >
          {points.length > 1 && (
            <>
              <path d={area} className="fill-board-light/90" />
              <polyline
                points={line}
                fill="none"
                strokeWidth={1.5}
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
                className="stroke-foreground"
              />
            </>
          )}
          <line
            x1={0}
            y1={50}
            x2={100}
            y2={50}
            strokeWidth={1}
            strokeDasharray="3 3"
            vectorEffect="non-scaling-stroke"
            className="stroke-accent"
            opacity={0.8}
          />
        </svg>
      </div>

      {analyses.map((analysis, index) => {
        const dot = markFor(analysis?.quality);
        if (!analysis || !dot) return null;
        return (
          <span
            key={index}
            aria-hidden
            className={`pointer-events-none absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full ring-1 ring-neutral-800 ${dot.fill}`}
            style={{
              left: `${xPercent(index + 1)}%`,
              top: `${yPercent(analysis.whiteWin)}%`,
            }}
          />
        );
      })}

      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 w-px -translate-x-1/2 bg-foreground/60"
        style={{ left: `${xPercent(ply)}%` }}
      />
      {cursorPoint && (
        <span
          aria-hidden
          className="pointer-events-none absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-foreground bg-background"
          style={{
            left: `${xPercent(cursorPoint.ply)}%`,
            top: `${yPercent(cursorPoint.win)}%`,
          }}
        />
      )}
    </div>
  );
}
