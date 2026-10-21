// Whole-game analysis as plain data: for each move, its quality (from
// move-classification.ts) and an accuracy score, and for each player the average
// accuracy and how many inaccuracies, mistakes and blunders they made.
//
// Accuracy uses win probability, not centipawns, so the same centipawn swing
// costs more when the position was already decided. The win-percent curve and
// the accuracy curve are the ones Lichess publishes. They are applied to the
// depth-limited engine scores this app stores, so the numbers are a guide, not
// a reproduction of Lichess's figures for the same game.

import {
  classifyMove,
  scoreForPlayer,
  type ClassifyMoveInput,
  type MoveQuality,
  type PlayerScore,
} from "./move-classification.ts";
import { isNotable, type NotableQuality } from "./quality-style.ts";
import type { WhiteScore } from "./uci-info.ts";

type Color = "w" | "b";

/**
 * Stands in for a forced mate when it is turned into a number. It is far
 * beyond any centipawn score, so the win percentage saturates at 0 or 100.
 */
const MATE_AS_CENTIPAWNS = 10000;

/** Win probability (0–100) for the side with `cp` centipawns. */
export function winPercent(cp: number): number {
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
}

function centipawnsFor(score: PlayerScore): number {
  if (score.kind === "cp") return score.cp;
  return score.winning ? MATE_AS_CENTIPAWNS : -MATE_AS_CENTIPAWNS;
}

/**
 * Accuracy of one move (0–100) from the mover's win percentage before and
 * after it. A move that keeps the win chance scores 100; the score falls
 * quickly as the win chance drops.
 */
export function moveAccuracy(winBefore: number, winAfter: number): number {
  const drop = Math.max(0, winBefore - winAfter);
  const raw = 103.1668 * Math.exp(-0.04354 * drop) - 3.1669;
  return Math.min(100, Math.max(0, raw));
}

/** The analysis of one move that could be judged. */
export type AnalyzedMove = {
  mover: Color;
  quality: MoveQuality;
  /** 0–100, see `moveAccuracy`. */
  accuracy: number;
  /**
   * White's win chance (0–100) in the position after this move, whoever moved.
   * This is what the evaluation graph plots.
   */
  whiteWin: number;
};

/**
 * Judges one move from the mover's side. Null when either score is missing or
 * unusable, so an unjudged move never counts for or against anyone.
 */
export function analyzeMove(
  before: WhiteScore | null | undefined,
  after: WhiteScore | null | undefined,
  mover: Color,
  extras: Pick<ClassifyMoveInput, "secondBest" | "sacrificed"> = {},
): AnalyzedMove | null {
  const result = classifyMove({ before, after, mover, ...extras });
  if (result.status !== "classified" || !before || !after) return null;

  const winBefore = winPercent(
    centipawnsFor(scoreForPlayer(before, mover)),
  );
  const winAfter = winPercent(centipawnsFor(scoreForPlayer(after, mover)));
  return {
    mover,
    quality: result.quality,
    accuracy: moveAccuracy(winBefore, winAfter),
    whiteWin: mover === "w" ? winAfter : 100 - winAfter,
  };
}

/** The qualities that are tallied for each player. */
export type CountedQuality = NotableQuality;

export type ColorSummary = {
  /** Average accuracy of the analysed moves, one decimal; null if none yet. */
  accuracy: number | null;
  /** Moves of this colour that have been judged. */
  analysedMoves: number;
  counts: Record<CountedQuality, number>;
};

export type GameSummary = {
  white: ColorSummary;
  black: ColorSummary;
};

/**
 * Totals per player over the moves judged so far. `moves` holds one entry per
 * move of the line; `undefined` (not yet known) and `null` (unjudged) are both
 * skipped.
 */
export function summarizeGame(
  moves: readonly (AnalyzedMove | null | undefined)[],
): GameSummary {
  const empty = (): ColorSummary => ({
    accuracy: null,
    analysedMoves: 0,
    counts: { brilliant: 0, great: 0, inaccuracy: 0, mistake: 0, blunder: 0 },
  });
  const summary: Record<Color, ColorSummary & { total: number }> = {
    w: { ...empty(), total: 0 },
    b: { ...empty(), total: 0 },
  };

  for (const move of moves) {
    if (!move) continue;
    const side = summary[move.mover];
    side.analysedMoves += 1;
    side.total += move.accuracy;
    if (isNotable(move.quality)) side.counts[move.quality] += 1;
  }

  const finish = (side: ColorSummary & { total: number }): ColorSummary => ({
    accuracy:
      side.analysedMoves === 0
        ? null
        : Math.round((side.total / side.analysedMoves) * 10) / 10,
    analysedMoves: side.analysedMoves,
    counts: side.counts,
  });
  return { white: finish(summary.w), black: finish(summary.b) };
}
