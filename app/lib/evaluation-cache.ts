// Completed engine evaluations by position, shared by everything that asks the
// engine about a position, so a position evaluated once is never searched again.
// Plain data and pure functions: React state holds the map (see
// `use-evaluation-cache.ts`), and this file only decides how it is keyed,
// searched and trimmed.
import type { SearchLimit } from "./stockfish-engine.ts";
import type { PositionEvaluation } from "./use-position-analysis.ts";

export type EvaluationCache = ReadonlyMap<string, PositionEvaluation>;

/** Completed evaluations kept for revisited positions. */
export const CACHE_LIMIT = 300;

export const limitKey = (limit: SearchLimit): string =>
  limit.depth !== undefined ? `d${limit.depth}` : `t${limit.moveTimeMs}`;

/** The key of a position searched with `limit`. */
export const evaluationCacheKey = (fen: string, limit: SearchLimit): string =>
  `${fen}|${limitKey(limit)}`;

/**
 * The first cached evaluation of exactly this position (same FEN) among
 * `limits`, tried in order, or null. Never returns a neighbouring position's.
 */
export function lookupEvaluation(
  cache: EvaluationCache,
  fen: string,
  limits: readonly SearchLimit[],
): PositionEvaluation | null {
  for (const limit of limits) {
    const found = cache.get(evaluationCacheKey(fen, limit));
    if (found) return found;
  }
  return null;
}

/** A copy of `cache` with `evaluation` stored under `key`, newest last, trimmed to `max`. */
export function withEvaluation(
  cache: EvaluationCache,
  key: string,
  evaluation: PositionEvaluation,
  max: number = CACHE_LIMIT,
): Map<string, PositionEvaluation> {
  const next = new Map(cache);
  next.delete(key);
  next.set(key, evaluation);
  // Drop the oldest entries beyond the limit.
  while (next.size > max) {
    next.delete(next.keys().next().value as string);
  }
  return next;
}
