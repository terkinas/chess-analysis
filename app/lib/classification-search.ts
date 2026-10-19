// The engine side of move classification, free of React so it can be tested
// with a fake engine: which positions still need a search, and the search
// itself with in-flight sharing.
//
// Both sides of a move are judged at ONE search limit. A cached evaluation made
// at any other limit (for example a full-length manual one) is never compared
// against it, because scores from different depths are not comparable.

import { resolveUciMove } from "./chess-game.ts";
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
  { best, info }: AnalysisResult,
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
