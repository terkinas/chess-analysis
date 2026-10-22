"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  classificationDetails,
  ensureEvaluations,
} from "./classification-search";
import { analyzeMove, type AnalyzedMove } from "./game-analysis";
import type { MoveContext } from "./move-context";
import {
  EngineCancelledError,
  StockfishEngine,
} from "./stockfish-engine";
import type { EvaluationStore } from "./use-evaluation-cache";
import { CLASSIFICATION_LIMIT } from "./use-move-classification";

export type GameAnalysisState = {
  /**
   * One entry per move of the line. `undefined`: not judged yet. `null`: cannot
   * be judged (for example an illegal move). Otherwise the judgement.
   */
  analyses: readonly (AnalyzedMove | null | undefined)[];
  /** Moves whose judgement is settled (judged, or known to be unjudgeable). */
  done: number;
  total: number;
  /** True once the user has asked for the analysis and it is still filling in. */
  running: boolean;
  /** The search error for the current line, or null. */
  failure: string | null;
  /** Starts (or restarts) judging every move of the line. */
  start: () => void;
};

type Options = {
  /** The context of each move of the shown line (see `moveContextsForLine`). */
  contexts: readonly (MoveContext | null)[];
  /** Shared with the other evaluation hooks, so nothing is searched twice. */
  store: EvaluationStore;
};

/**
 * Judges every move of the shown line by searching the positions on either
 * side of each one, at the same limit as the single-move classification (`CLASSIFICATION_LIMIT`).
 *
 * Nothing is searched until `start` is called. After that, the search follows
 * the line: when moves are added or the line changes, the new moves are judged
 * too, and positions already in the cache are skipped. Judgements are derived
 * from the cache on every render, so they can never belong to another line.
 * A failed search is reported for the line it happened on and clears itself
 * when the line changes.
 */
export function useGameAnalysis({ contexts, store }: Options): GameAnalysisState {
  const { cache, getLatest, put, claim } = store;
  const engineRef = useRef<StockfishEngine | null>(null);
  // Bumped by `start`; the search runs while it is above zero.
  const [runId, setRunId] = useState(0);
  // The error and the line it belongs to; only shown for that same line.
  const [failure, setFailure] = useState<{
    contexts: readonly (MoveContext | null)[];
    message: string;
  } | null>(null);

  const analyses = useMemo(
    () =>
      contexts.map((context) => {
        if (!context) return null;
        const details = classificationDetails(cache, context, CLASSIFICATION_LIMIT);
        if (details.before === null || details.after === null) return undefined;
        return analyzeMove(details.before, details.after, context.mover, {
          secondBest: details.secondBest,
          sacrificed: details.sacrificed,
        });
      }),
    [cache, contexts],
  );

  const total = contexts.length;
  const done = analyses.reduce(
    (count, analysis) => (analysis === undefined ? count : count + 1),
    0,
  );
  const active = runId > 0;
  const running = active && done < total;

  // Release the worker when the component goes away.
  useEffect(() => {
    return () => {
      engineRef.current?.terminate();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;

    // Deferred a tick, like the single-move hook, so an immediately superseded
    // run never reaches the engine.
    const timer = setTimeout(() => {
      void (async () => {
        for (const context of contexts) {
          if (cancelled) return;
          if (!context) continue;
          try {
            await ensureEvaluations({
              context,
              limit: CLASSIFICATION_LIMIT,
              store: { getLatest, put, claim },
              isCancelled: () => cancelled,
              getEngine: () => {
                let engine = engineRef.current;
                if (
                  !engine ||
                  ["error", "terminated"].includes(engine.getStatus())
                ) {
                  engine?.terminate();
                  engine = new StockfishEngine();
                  engineRef.current = engine;
                }
                return engine;
              },
            });
          } catch (error: unknown) {
            if (cancelled || error instanceof EngineCancelledError) return;
            setFailure({
              contexts,
              message:
                error instanceof Error ? error.message : "Engine error",
            });
            return;
          }
        }
      })();
    }, 0);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      engineRef.current?.cancel();
    };
  }, [active, contexts, getLatest, put, claim]);

  const start = useCallback(() => {
    setFailure(null);
    setRunId((id) => id + 1);
  }, []);

  return {
    analyses,
    done,
    total,
    running,
    failure: failure !== null && failure.contexts === contexts
      ? failure.message
      : null,
    start,
  };
}
