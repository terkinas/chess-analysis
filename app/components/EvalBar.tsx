import type { Color } from "chess.js";
import { barFillShare } from "../lib/eval-bar";
import {
  describeWhiteScore,
  formatWhiteScore,
  type WhiteScore,
} from "../lib/uci-info";

type EvalBarProps = {
  /** Score for the position on the board from White's side; null = none yet. */
  score: WhiteScore | null;
  /**
   * The last score that was shown for an earlier position. While `score` is
   * null the bar keeps this fill, and nothing else: no text, label or readout
   * is ever taken from it.
   */
  previousScore?: WhiteScore | null;
  /** Which side is at the bottom of the board; the bar mirrors it. */
  orientation?: Color;
};

// A slim vertical bar beside the board. White's share grows from White's edge
// (the bottom with White at the bottom), Black's from the opposite one. It is
// drawn from the engine score, never from text. Its text and readout belong to
// the position on show only; until that position has a score the fill rests on
// `previousScore` (balanced if there is none).
export default function EvalBar({
  score,
  previousScore = null,
  orientation = "w",
}: EvalBarProps) {
  const share = barFillShare(score, previousScore);
  const whiteAtBottom = orientation === "w";
  const whiteLeads = score === null || whiteScore(score) >= 0;
  const label = score
    ? `Evaluation bar: ${formatWhiteScore(score)}. ${describeWhiteScore(score)}.`
    : previousScore
      ? "Evaluation bar: no evaluation for this position yet. The bar still shows the previous evaluation."
      : "Evaluation bar: no evaluation for this position, shown balanced.";
  // A short, colour-independent readout at the leading side's end of the bar.
  const readout = score ? formatWhiteScore(score).replace(/^[+-]/, "") : null;
  const readoutAtBottom = whiteLeads === whiteAtBottom;

  return (
    <div
      role="img"
      aria-label={label}
      title={score ? `${formatWhiteScore(score)} · ${describeWhiteScore(score)}` : "No evaluation for this position"}
      className="relative w-4 shrink-0 self-stretch overflow-hidden rounded-sm bg-neutral-800 shadow-[0_0_0_1px_rgba(255,255,255,0.08)] sm:w-6"
    >
      <div
        aria-hidden
        className={`absolute inset-x-0 bg-board-light transition-[height] duration-300 motion-reduce:transition-none ${
          whiteAtBottom ? "bottom-0" : "top-0"
        }`}
        style={{ height: `${share * 100}%` }}
      />
      <div
        aria-hidden
        className="absolute inset-x-0 top-1/2 h-px bg-accent/70"
      />
      {readout && (
        <span
          aria-hidden
          className={`absolute inset-x-0 hidden text-center font-mono text-[9px] font-semibold leading-none sm:block ${
            readoutAtBottom ? "bottom-1" : "top-1"
          } ${whiteLeads ? "text-neutral-800" : "text-board-light"}`}
        >
          {readout}
        </span>
      )}
    </div>
  );
}

function whiteScore(score: WhiteScore): number {
  if (score.kind === "mate") return score.winner === "w" ? 1 : -1;
  return score.cp;
}
