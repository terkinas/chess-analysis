import type { WhiteScore } from "./uci-info";

/** Never fully fill or empty the bar, so both colours stay visible. */
const MIN_SHARE = 0.02;
const MAX_SHARE = 0.98;
/** Same logistic curve (centipawns → expected score) that lichess uses. */
const CP_SCALE = 0.00368208;

/**
 * How much of the evaluation bar White's colour fills, from 0 to 1, for a
 * score from White's point of view. 0.5 is balanced (also used when there is no
 * evaluation). Centipawns go through a logistic curve, so small differences
 * stay subtle and large ones flatten out; a mate fills the winner's side to the
 * limit. The result is clamped to [0.02, 0.98].
 */
export function whiteBarShare(score: WhiteScore | null): number {
  if (score === null) return 0.5;
  let share: number;
  if (score.kind === "mate") {
    share = score.winner === "w" ? 1 : 0;
  } else {
    share = 1 / (1 + Math.exp(-CP_SCALE * score.cp));
  }
  return Math.min(MAX_SHARE, Math.max(MIN_SHARE, share));
}

/**
 * How much of the bar White fills while the position on show may not have its
 * own evaluation yet. The position's own score wins; without one the bar keeps
 * the fill of the last evaluation that was shown (`previous`) instead of
 * snapping to balanced; only with neither is it balanced. This is a visual
 * continuity aid only: the score text and best move never come from `previous`.
 */
export function barFillShare(
  score: WhiteScore | null,
  previous: WhiteScore | null,
): number {
  return whiteBarShare(score ?? previous);
}
