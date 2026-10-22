// Pure move-quality classification. No React, no worker, no chess.js: it only
// compares two engine scores, so it can be tested on its own.
//
// A move is banded by the WIN CHANCE the mover gave up (see win-percent.ts), not
// by raw centipawns: 1.0 pawn matters a lot in an equal position and almost
// nothing at +10. The centipawn loss is still reported, for display.
//
// The engine scores handed to the analysis are from White's point of view (see
// `toWhiteScore` in uci-info.ts). A move is judged from the point of view of the
// player who made it, so both scores are first converted with `scoreForPlayer`
// and only then compared. For Black this flips the sign of every centipawn
// value and swaps which side a mate belongs to.
//
// A missing or malformed score is never guessed at (and never treated as 0): the
// result is "unavailable" instead.

import type { WhiteScore } from "./uci-info.ts";
import { MATE_AS_CENTIPAWNS, winPercent } from "./win-percent.ts";

type Color = "w" | "b";

export type MoveQuality =
  | "brilliant"
  | "great"
  | "best"
  | "excellent"
  | "good"
  | "inaccuracy"
  | "mistake"
  | "blunder";

/** One band: a move that loses at most `maxLoss` win-chance points has this quality. */
export type QualityThreshold = {
  quality: Exclude<MoveQuality, "blunder" | "great" | "brilliant">;
  /** Inclusive upper bound, in win-chance points lost (0–100). */
  maxLoss: number;
};

/**
 * The one place the win-chance-loss bands are defined, in ascending order.
 * Anything above the last band is a blunder:
 *   best        0–1     excellent  1–2.5    good      2.5–5
 *   inaccuracy  5–10    mistake   10–20     blunder  > 20
 * In an equal position these are about 11 / 27 / 55 / 110 / 230 centipawns; the
 * same win-chance loss takes many more centipawns in a lopsided position.
 */
export const CLASSIFICATION_THRESHOLDS: readonly QualityThreshold[] = [
  { quality: "best", maxLoss: 1 },
  { quality: "excellent", maxLoss: 2.5 },
  { quality: "good", maxLoss: 5 },
  { quality: "inaccuracy", maxLoss: 10 },
  { quality: "mistake", maxLoss: 20 },
];

/**
 * How much better (in win-chance points, for the mover) the best move must be
 * than the second-best one for it to count as "great": the only move that keeps
 * the position. Compared on the same search as the played move. Measured in win
 * chance so a gap inside an already decided position (+11 against +8) does not
 * count.
 */
export const GREAT_GAP_WIN = 15;

/**
 * A sacrifice is only "brilliant" if the mover was not already clearly winning
 * (about +3.0, a 75% win chance): giving material in a won position is not
 * brave. After it the mover must be at least level (50%).
 */
export const BRILLIANT_MAX_WIN_BEFORE = 75;
export const BRILLIANT_MIN_WIN_AFTER = 50;

/**
 * Quality given to a move that makes a forced mate against the mover come
 * sooner, in a position that was already lost to mate. Such a move cannot be
 * measured in centipawns; the mate not being hastened is "best".
 */
export const MATE_HASTENED_QUALITY: MoveQuality = "inaccuracy";

/** A score from the point of view of one player. */
export type PlayerScore =
  | { kind: "cp"; /** Centipawns; positive is good for this player. */ cp: number }
  | {
      kind: "mate";
      /** True when this player delivers the mate, false when they are mated. */
      winning: boolean;
      /** Full moves until mate; 0 means the mate is already on the board. */
      moves: number;
    };

/** Why a move got its quality; useful for explaining it in the UI later. */
export type ClassificationReason =
  | "centipawn-loss" // compared as ordinary centipawn scores
  | "mate-delivered" // gave checkmate, or reached/kept a forced mate for the mover
  | "mate-lost" // had a forced mate and no longer does
  | "mate-allowed" // had no forced mate against and now does
  | "mate-escaped" // was being mated and no longer is
  | "mate-hastened" // was being mated and is now mated sooner
  | "mate-unchanged"; // was being mated and still is, no sooner

export type UnavailableReason = "missing-evaluation" | "invalid-evaluation";

export type MoveClassification =
  | {
      status: "classified";
      quality: MoveQuality;
      /**
       * Centipawns the mover lost (never negative: a move that improves the
       * position loses 0). Null when a mate score is involved, because a mate
       * is not a centipawn value.
       */
      centipawnLoss: number | null;
      /**
       * Win-chance points (0–100) the mover lost, never negative: what the
       * quality is banded by. Null when a mate score is involved.
       */
      winLoss: number | null;
      reason: ClassificationReason;
    }
  | { status: "unavailable"; reason: UnavailableReason };

const UNAVAILABLE_MISSING: MoveClassification = {
  status: "unavailable",
  reason: "missing-evaluation",
};
const UNAVAILABLE_INVALID: MoveClassification = {
  status: "unavailable",
  reason: "invalid-evaluation",
};

function isColor(value: unknown): value is Color {
  return value === "w" || value === "b";
}

/** True for a score that is well formed; never throws. */
function isValidWhiteScore(score: WhiteScore): boolean {
  if (score.kind === "cp") {
    return typeof score.cp === "number" && Number.isFinite(score.cp);
  }
  if (score.kind === "mate") {
    return (
      isColor(score.winner) &&
      typeof score.moves === "number" &&
      Number.isSafeInteger(score.moves) &&
      score.moves >= 0
    );
  }
  return false;
}

/**
 * Converts a White-perspective score to `player`'s perspective: centipawns
 * flip sign for Black, and a mate is "winning" when `player` is the one who
 * delivers it. The caller must pass a valid score.
 */
export function scoreForPlayer(score: WhiteScore, player: Color): PlayerScore {
  if (score.kind === "cp") {
    // `|| 0` avoids a negative zero.
    return { kind: "cp", cp: (player === "w" ? score.cp : -score.cp) || 0 };
  }
  return {
    kind: "mate",
    winning: score.winner === player,
    moves: score.moves,
  };
}

/** The quality for a win-chance loss, using `thresholds` (default: the shared bands). */
export function classifyWinLoss(
  loss: number,
  thresholds: readonly QualityThreshold[] = CLASSIFICATION_THRESHOLDS,
): MoveQuality {
  for (const band of thresholds) {
    if (loss <= band.maxLoss) return band.quality;
  }
  return "blunder";
}

export type ClassifyMoveInput = {
  /** Score of the position before the move, from White's point of view. */
  before: WhiteScore | null | undefined;
  /** Score of the position after the move, from White's point of view. */
  after: WhiteScore | null | undefined;
  /** The side that made the move. */
  mover: Color;
  /** Overrides the shared bands; must be in ascending `maxLoss` order. */
  thresholds?: readonly QualityThreshold[];
  /**
   * Score of the second-best move in the position before, from White's point
   * of view, when the search found one. Needed for "great".
   */
  secondBest?: WhiteScore | null;
  /**
   * True when the move is the engine's best move and gives up material that
   * the best line does not win back straight away (see `materialBalanceChange`).
   * Needed for "brilliant".
   */
  sacrificed?: boolean;
};

/** A score as the mover's win chance (0–100); a mate saturates at 0 or 100. */
function winOf(score: PlayerScore): number {
  if (score.kind === "cp") return winPercent(score.cp);
  return winPercent(score.winning ? MATE_AS_CENTIPAWNS : -MATE_AS_CENTIPAWNS);
}

const classified = (
  quality: MoveQuality,
  centipawnLoss: number | null,
  winLoss: number | null,
  reason: ClassificationReason,
): MoveClassification => ({
  status: "classified",
  quality,
  centipawnLoss,
  winLoss,
  reason,
});

/**
 * Judges one move from the mover's point of view.
 *
 * - Two centipawn scores: the loss is the win chance the mover had minus what
 *   they have now, floored at 0, banded by the thresholds. The centipawn loss is
 *   reported alongside but does not decide the band.
 * - Mate scores are never turned into centipawns. Reaching, delivering or
 *   keeping a forced mate for the mover is "best"; losing one, or allowing one
 *   against the mover, is a "blunder"; escaping a mate against the mover is
 *   "best". A move in a position that was already lost to mate is "best"
 *   unless it makes the mate come sooner (see `MATE_HASTENED_QUALITY`).
 * - A missing score, or one that is malformed or impossible (a mate already on
 *   the board in the position *before* a move, or one delivered *against* the
 *   mover by their own move) gives "unavailable".
 */
export function classifyMove({
  before,
  after,
  mover,
  thresholds = CLASSIFICATION_THRESHOLDS,
  secondBest = null,
  sacrificed = false,
}: ClassifyMoveInput): MoveClassification {
  if (before == null || after == null) return UNAVAILABLE_MISSING;
  if (!isColor(mover)) return UNAVAILABLE_INVALID;
  if (!isValidWhiteScore(before) || !isValidWhiteScore(after)) {
    return UNAVAILABLE_INVALID;
  }

  const was = scoreForPlayer(before, mover);
  const now = scoreForPlayer(after, mover);

  // The mover had a legal move, so the earlier position is not already mate;
  // and a move cannot checkmate its own side.
  if (was.kind === "mate" && was.moves === 0) return UNAVAILABLE_INVALID;
  if (now.kind === "mate" && now.moves === 0 && !now.winning) {
    return UNAVAILABLE_INVALID;
  }

  if (was.kind === "cp" && now.kind === "cp") {
    const loss = Math.max(0, was.cp - now.cp);
    const winBefore = winOf(was);
    const winAfter = winOf(now);
    const winLoss = Math.max(0, winBefore - winAfter);
    const quality = classifyWinLoss(winLoss, thresholds);
    if (quality === "best") {
      // A sacrifice the engine's best line keeps good for the mover, made from
      // a position that was not already won.
      if (
        sacrificed &&
        winAfter >= BRILLIANT_MIN_WIN_AFTER &&
        winBefore <= BRILLIANT_MAX_WIN_BEFORE
      ) {
        return classified("brilliant", loss, winLoss, "centipawn-loss");
      }
      // The best move is far ahead of the best alternative.
      if (
        secondBest !== null &&
        isValidWhiteScore(secondBest) &&
        winBefore - winOf(scoreForPlayer(secondBest, mover)) >= GREAT_GAP_WIN
      ) {
        return classified("great", loss, winLoss, "centipawn-loss");
      }
    }
    return classified(quality, loss, winLoss, "centipawn-loss");
  }

  if (now.kind === "mate" && now.winning) {
    // Delivered, reached or kept a forced mate; also escaping into one.
    return classified("best", null, null, "mate-delivered");
  }

  if (was.kind === "mate" && was.winning) {
    // Had a forced mate; the move no longer has one (now is cp or mated).
    return classified("blunder", null, null, "mate-lost");
  }

  if (was.kind === "cp") {
    // Now being mated, from a position with no forced mate against.
    return classified("blunder", null, null, "mate-allowed");
  }

  // Was being mated.
  if (now.kind === "cp") return classified("best", null, null, "mate-escaped");
  // Still being mated. `moves` counts the winner's moves, so a stronger
  // defence keeps it equal and a weaker one makes it smaller.
  return now.moves < was.moves
    ? classified(MATE_HASTENED_QUALITY, null, null, "mate-hastened")
    : classified("best", null, null, "mate-unchanged");
}
