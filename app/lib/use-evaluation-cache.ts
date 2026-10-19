"use client";

import { useCallback, useRef, useState } from "react";
import { InFlightRegistry, type Claim } from "./in-flight";
import {
  withEvaluation,
  type EvaluationCache,
} from "./evaluation-cache";
import type { PositionEvaluation } from "./use-position-analysis";

export type EvaluationStore = {
  /** The completed evaluations; a new map after every `put`, so it can drive renders. */
  cache: EvaluationCache;
  /** The latest map, readable from inside async code without waiting for a render. */
  getLatest: () => EvaluationCache;
  put: (key: string, evaluation: PositionEvaluation) => void;
  /**
   * Claims the search for a cache key, so hooks never search the same position
   * at the same limit twice at once (see `InFlightRegistry`).
   */
  claim: (key: string) => Claim;
};

/**
 * One evaluation cache to share between hooks that evaluate positions. A
 * cached evaluation belongs to its FEN alone (not to an epoch or a line), so it
 * stays valid across resets and imports.
 */
export function useEvaluationCache(): EvaluationStore {
  const [cache, setCache] = useState<EvaluationCache>(() => new Map());
  const latest = useRef<EvaluationCache>(cache);

  const put = useCallback((key: string, evaluation: PositionEvaluation) => {
    // Computed from the latest map rather than from render state, so two
    // results landing in the same tick both survive.
    const next = withEvaluation(latest.current, key, evaluation);
    latest.current = next;
    setCache(next);
  }, []);
  const getLatest = useCallback(() => latest.current, []);

  const [registry] = useState(() => new InFlightRegistry());
  const claim = useCallback((key: string) => registry.claim(key), [registry]);

  return { cache, getLatest, put, claim };
}
