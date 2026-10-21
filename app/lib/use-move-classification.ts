"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  classificationDetails,
  ensureEvaluations,
} from "./classification-search";
import { classifyMove, type MoveClassification } from "./move-classification";
import type { MoveContext } from "./move-context";
import type { MoveClassificationStatus } from "./move-quality-label";
import {
  EngineCancelledError,
  StockfishEngine,
  type SearchLimit,
} from "./stockfish-engine";
import type { EvaluationStore } from "./use-evaluation-cache";
import { AUTO_ANALYSIS_LIMIT } from "./use-position-analysis";

export type { MoveClassificationStatus } from "./move-quality-label";

/**
 * The one search limit both sides of a move are judged at: the same shallow,
 * fast limit as automatic analysis (reused, not changed). Evaluations made at
 * any other limit are neither used nor compared.
 */
export const CLASSIFICATION_LIMIT: SearchLimit = {
  ...AUTO_ANALYSIS_LIMIT,
  multiPv: 2,
};

type Options = {
  /** The move to classify (see `moveContextAt`), or null for none. */
  context: MoveContext | null;
  /** Bump on reset or PGN import, like for `usePositionAnalysis`. */
  epoch: number;
  /** Shared with `usePositionAnalysis`, so finished and running searches are reused. */
  store: EvaluationStore;
  /** Nothing is searched while false; cached results are still used. */
  enabled?: boolean;
};

/**
 * Classifies one move by the engine's evaluation of the position before and
 * after it, both at `CLASSIFICATION_LIMIT`.
 *
 * The classification is derived, not stored: it is recomputed on every render
 * from the shared cache for the exact before/after positions of `context`, so
 * a result for any other move can never be returned for this one, and the
 * status names the context it belongs to. Missing positions are searched on
 * this hook's own engine (see `ensureEvaluations`: cache rechecked, in-flight
 * searches shared, game-over positions scored without a search). When the move,
 * line or epoch changes, the pending search is cancelled and its reply dropped.
 * Nothing here plays a move or touches the board.
 */
export function useMoveClassification({
  context,
  epoch,
  store,
  enabled = true,
}: Options): MoveClassificationStatus {
  const { cache, getLatest, put, claim } = store;
  const engineRef = useRef<StockfishEngine | null>(null);
  const contextKey = context?.key ?? null;
  const requestKey = context ? `${epoch}|${context.key}` : null;

  // A failure belongs to the request (epoch and move) it happened for.
  const [failure, setFailure] = useState<{
    key: string;
    message: string;
  } | null>(null);

  const details = useMemo(
    () =>
      context ? classificationDetails(cache, context, CLASSIFICATION_LIMIT) : null,
    [cache, context],
  );

  const classification = useMemo<MoveClassification | null>(() => {
    if (!context || !details || details.before === null || details.after === null) {
      return null;
    }
    return classifyMove({
      before: details.before,
      after: details.after,
      mover: context.mover,
      secondBest: details.secondBest,
      sacrificed: details.sacrificed,
    });
  }, [context, details]);

  const failed = failure !== null && failure.key === requestKey;
  const needsSearch = enabled && context !== null && classification === null;

  // Release the worker when the component goes away.
  useEffect(() => {
    return () => {
      engineRef.current?.terminate();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!needsSearch || failed || !context || requestKey === null) return;
    let cancelled = false;

    // Deferred a tick so a request that is immediately superseded (or
    // StrictMode's mount → cleanup → mount in dev) is never sent to the engine.
    const timer = setTimeout(() => {
      ensureEvaluations({
        context,
        limit: CLASSIFICATION_LIMIT,
        store: { getLatest, put, claim },
        isCancelled: () => cancelled,
        getEngine: () => {
          let engine = engineRef.current;
          if (!engine || ["error", "terminated"].includes(engine.getStatus())) {
            engine?.terminate();
            engine = new StockfishEngine();
            engineRef.current = engine;
          }
          return engine;
        },
      }).catch((error: unknown) => {
        if (cancelled || error instanceof EngineCancelledError) return;
        setFailure({
          key: requestKey,
          message: error instanceof Error ? error.message : "Engine error",
        });
      });
    }, 0);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      engineRef.current?.cancel();
    };
  }, [needsSearch, failed, context, requestKey, getLatest, put, claim]);

  if (!context || contextKey === null) return { phase: "idle" };
  if (classification) {
    return { phase: "done", contextKey, classification };
  }
  if (failed) {
    return { phase: "error", contextKey, message: failure.message };
  }
  return enabled ? { phase: "thinking" } : { phase: "idle" };
}
