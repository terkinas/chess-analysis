// The engine side of move classification, free of React so it can be tested
// with a fake engine: which positions still need a search, and the search
// itself with in-flight sharing.
//
// Both sides of a move are judged at ONE search limit. A cached evaluation made
// at any other limit (for example a full-length manual one) is never compared
// against it, because scores from different depths are not comparable.

import { resolveUciMove } from "./chess-game.ts";
import { materialBalanceChange } from "./material.ts";
import {
  evaluationCacheKey,
  type EvaluationCache,
} from "./evaluation-cache.ts";
import type { Claim } from "./in-flight.ts";
import { terminalWhiteScore, type MoveContext } from "./move-context.ts";
import { choosePv } from "./pv-format.ts";
import { buildPvLine } from "./pv-line.ts";
import type {
  AnalysisResult,
  EngineStatus,
  SearchLimit,
} from "./stockfish-engine.ts";
import { toWhiteScore, turnFromFen, type WhiteScore } from "./uci-info.ts";
import type { PositionEvaluation } from "./use-position-analysis.ts";

/** What the search needs from an engine; `StockfishEngine` fits. */
export type SearchEngine = {
  getStatus(): EngineStatus;
  init(): Promise<void>;
  analyze(fen: string, limit: SearchLimit): Promise<AnalysisResult>;
};

/** What the search needs from the shared evaluation store. */
export type SearchStore = {
  getLatest(): EvaluationCache;
  put(key: string, evaluation: PositionEvaluation): void;
  claim(key: string): Claim;
};

/**
 * The score of `fen` for classification at `limit`: the game-over score when
 * the position is finished (no search needed, same at any depth), else a cached
 * evaluation made at exactly `limit`, else null.
 */
export function classificationScore(
  cache: EvaluationCache,
  fen: string,
  limit: SearchLimit,
): WhiteScore | null {
  return (
    terminalWhiteScore(fen) ??
    cache.get(evaluationCacheKey(fen, limit))?.score ??
    null
  );
}

/**
 * Everything the classifier needs about a move at `limit`: the scores before
 * and after, the second-best score before the move (null if not searched), and
 * whether the move is a sacrifice in the engine's best line. When the move is
 * the engine's best move, `after` equals `before` (see `classificationDetails`).
 */
export type ClassificationDetails = {
  before: WhiteScore | null;
  after: WhiteScore | null;
  secondBest: WhiteScore | null;
  sacrificed: boolean;
};

/**
 * True when `context.san` is the engine's best move and the best line gives up
 * at least two pawns of material for the mover (judged after the opponent's
 * reply and the mover's next move) that it does not win back straight away.
 */
export function isSacrificeLine(
  evaluation: PositionEvaluation,
  context: MoveContext,
): boolean {
  if (evaluation.bestMoveSan !== context.san) return false;
  const moves = evaluation.pv.moves;
  for (let plies = 1; plies <= Math.min(2, moves.length - 1); plies++) {
    const change = materialBalanceChange(
      context.beforeFen,
      moves[plies].fen,
      context.mover,
    );
    if (change !== null && change <= -2) return true;
  }
  return false;
}

/** The details of a move at `limit`, all read from the cache (see `ClassificationDetails`). */
export function classificationDetails(
  cache: EvaluationCache,
  context: MoveContext,
  limit: SearchLimit,
): ClassificationDetails {
  const beforeEvaluation =
    terminalWhiteScore(context.beforeFen) === null
      ? (cache.get(evaluationCacheKey(context.beforeFen, limit)) ?? null)
      : null;
  const before = classificationScore(cache, context.beforeFen, limit);
  const searchedAfter = classificationScore(cache, context.afterFen, limit);

  // The engine's own best move keeps the score of the position before it, by
  // definition. Comparing it with a separate search of the position after the
  // move is unfair: that search starts one ply deeper into the same line, so at
  // a shallow depth its score drifts from the "before" score by tens of
  // centipawns and the best move gets labelled an inaccuracy. So when the move
  // played is the best move of the "before" search, its score after the move is
  // that same score (loss 0). A finished game (mate / stalemate) keeps its exact
  // terminal score.
  const playedEngineBest =
    beforeEvaluation !== null && beforeEvaluation.bestMoveSan === context.san;
  const after =
    terminalWhiteScore(context.afterFen) ??
    (playedEngineBest ? beforeEvaluation.score : searchedAfter);

  return {
    before,
    after,
    secondBest: beforeEvaluation?.secondScore ?? null,
    sacrificed: beforeEvaluation
      ? isSacrificeLine(beforeEvaluation, context)
      : false,
  };
}

/** The before and after scores of a move at `limit`; either may be null. */
export function classificationScores(
  cache: EvaluationCache,
  context: MoveContext,
  limit: SearchLimit,
): { before: WhiteScore | null; after: WhiteScore | null } {
  return {
    before: classificationScore(cache, context.beforeFen, limit),
    after: classificationScore(cache, context.afterFen, limit),
  };
}

/** Turns a finished search into a validated evaluation; throws if it is unusable. */
export function toPositionEvaluation(
  fen: string,
  { best, info, second }: AnalysisResult,
): PositionEvaluation {
  const turn = turnFromFen(fen);
  const legal = resolveUciMove(fen, best.move);
  if (!turn || !legal) {
    throw new Error(`Stockfish returned an illegal move (${best.move.uci})`);
  }
  if (!info) throw new Error("Stockfish did not report a score");
  return {
    score: toWhiteScore(info.score, turn),
    depth: info.depth,
    bestMoveSan: legal.san,
    bestMoveUci: best.move.uci,
    pv: buildPvLine(fen, choosePv(best.move.uci, info.pv)),
    secondScore: second ? toWhiteScore(second.score, turn) : null,
  };
}

type EnsureOptions = {
  context: MoveContext;
  limit: SearchLimit;
  store: SearchStore;
  /** The engine to search with, created on first use by the caller. */
  getEngine: () => SearchEngine;
  /** True once the result is no longer wanted; checked between every step. */
  isCancelled: () => boolean;
};

/**
 * Makes sure both positions of a move have an evaluation at `limit`: the one
 * before the move first, then the one after. A position is only searched when
 *  - it is not a finished game,
 *  - the cache (read again right now) has no evaluation at `limit`, and
 *  - nobody else is already searching it; in that case this waits for them and
 *    looks again, searching it itself only if they left nothing behind.
 * Each result is stored under its own position's key, so it is valid whatever
 * the user does next. Rejects with the engine's error if a search fails (an
 * `EngineCancelledError` when it was cancelled); returns quietly when
 * `isCancelled` turns true.
 */
export async function ensureEvaluations({
  context,
  limit,
  store,
  getEngine,
  isCancelled,
}: EnsureOptions): Promise<void> {
  for (const fen of [context.beforeFen, context.afterFen]) {
    if (terminalWhiteScore(fen) !== null) continue;
    const key = evaluationCacheKey(fen, limit);

    for (;;) {
      if (isCancelled()) return;
      if (store.getLatest().has(key)) break;

      const claim = store.claim(key);
      if (!claim.owned) {
        await claim.wait;
        continue;
      }
      try {
        const engine = getEngine();
        if (engine.getStatus() !== "ready") {
          await engine.init();
          if (isCancelled()) return;
        }
        const result = await engine.analyze(fen, limit);
        if (isCancelled()) return;
        store.put(key, toPositionEvaluation(fen, result));
      } finally {
        claim.release();
      }
      break;
    }
  }
}
