"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { resolveUciMove } from "./chess-game";
import { evaluationCacheKey, lookupEvaluation } from "./evaluation-cache";
import { choosePv, type PvLine } from "./pv-format";
import { buildPvLine } from "./pv-line";
import {
  EngineCancelledError,
  StockfishEngine,
  type SearchLimit,
} from "./stockfish-engine";
import { toWhiteScore, turnFromFen, type WhiteScore } from "./uci-info";
import type { EvaluationStore } from "./use-evaluation-cache";

/** A modest fixed limit: about a second and a half per evaluation. */
export const ANALYSIS_LIMIT: SearchLimit = { moveTimeMs: 1500 };

/** Shallow, fast search for automatic evaluation as the user moves around. */
export const AUTO_ANALYSIS_LIMIT: SearchLimit = { depth: 8 };

/** Wait this long after the position settles before an automatic search starts. */
const AUTO_DEBOUNCE_MS = 150;

export type PositionEvaluation = {
  /** From White's point of view, whoever is to move. */
  score: WhiteScore;
  /** Search depth the score was reached at. */
  depth: number;
  /**
   * The score of the second-best move, from White's point of view, when the
   * search looked at two lines. Null when the position has only one legal
   * move, or when the search did not ask for two lines.
   */
  secondScore?: WhiteScore | null;
  /** The engine's suggested move, validated by chess.js. Never played automatically. */
  bestMoveSan: string;
  bestMoveUci: string;
  /**
   * The engine's principal variation from the analysed position, replayed in
   * SAN. Always starts with the best move above.
   */
  pv: PvLine;
};

export type EvaluationStatus =
  | { phase: "idle" } // nothing requested for this position
  | { phase: "loading" } // the worker is starting up
  | { phase: "thinking" }
  | { phase: "done"; evaluation: PositionEvaluation }
  | { phase: "error"; message: string };

// The id of the implicit request that auto-evaluation makes for the position
// on the board. Manual requests count up from 1, so they never collide.
const AUTO_ID = 0;

type Request = {
  id: number;
  /** The position (and epoch) the request was made for. */
  key: string;
};

type Report = Request &
  (
    | { phase: "loading" | "thinking" }
    | { phase: "done"; evaluation: PositionEvaluation }
    | { phase: "error"; message: string }
  );

type Options = {
  /** The position currently on the analysis board. */
  fen: string;
  /**
   * Bump whenever the board is reset or a PGN is imported, even if the new
   * position happens to equal the old one: it invalidates any request or
   * result from before.
   */
  epoch: number;
  /** True when there is nothing to evaluate (checkmate or stalemate). */
  disabled?: boolean;
  /**
   * Evaluate the current position automatically (shallow, see
   * AUTO_ANALYSIS_LIMIT). A manual request for the same position still runs
   * at the full ANALYSIS_LIMIT.
   */
  auto?: boolean;
  /**
   * Where completed evaluations are kept. Shared with other hooks (see
   * `useEvaluationCache`), so a position evaluated by any of them is never
   * searched again by another.
   */
  store: EvaluationStore;
};

/**
 * One-shot engine evaluation of the analysis board's current position.
 *
 * It owns its own `StockfishEngine` (its own worker), created lazily on the
 * first request, so it shares nothing with the live game's opponent engine. A
 * request is tied to the position it was made for. As soon as the position,
 * the epoch or `disabled` changes, the request and any result are discarded
 * during render (so a result for another position is never shown, not even for
 * one frame) and the effect's cleanup stops the search and drops its reply.
 * Unmounting terminates the worker.
 */
export function usePositionAnalysis({
  fen,
  epoch,
  disabled = false,
  auto = false,
  store,
}: Options) {
  const engineRef = useRef<StockfishEngine | null>(null);
  const nextId = useRef(0);
  const [request, setRequest] = useState<Request | null>(null);
  const [report, setReport] = useState<Report | null>(null);

  const key = `${epoch}|${fen}`;

  // Reset during render when the position changes: the supported pattern for
  // state that must not outlive the value it was derived from.
  const [trackedKey, setTrackedKey] = useState(key);
  if (trackedKey !== key) {
    setTrackedKey(key);
    setRequest(null);
    setReport(null);
  }

  // Completed evaluations by position and search settings, so revisiting a
  // position (or asking again) costs nothing.
  const { cache, put, claim: claimSearch, getLatest } = store;

  // What is being evaluated now: the manual request for this position if there
  // is one (full depth), otherwise the automatic one (shallow), otherwise nothing.
  const manualId =
    !disabled && request && request.key === key ? request.id : null;
  const activeId = manualId ?? (auto && !disabled ? AUTO_ID : null);
  const limit = manualId !== null ? ANALYSIS_LIMIT : AUTO_ANALYSIS_LIMIT;
  const cacheKey = evaluationCacheKey(fen, limit);
  const cached = cache.get(cacheKey) ?? null;
  const hasCached = cached !== null;

  // Release the worker when the component goes away.
  useEffect(() => {
    return () => {
      engineRef.current?.terminate();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (activeId === null || hasCached) return;
    let cancelled = false;

    // Deferred a tick so a request that is immediately superseded (or
    // StrictMode's mount → cleanup → mount in dev) is never sent to the engine.
    const run = async () => {
      let engine = engineRef.current;
      if (!engine || ["error", "terminated"].includes(engine.getStatus())) {
        engine?.terminate();
        engine = new StockfishEngine();
        engineRef.current = engine;
      }

      const fail = (message: string) =>
        setReport({ id: activeId, key, phase: "error", message });

      try {
        if (engine.getStatus() !== "ready") {
          setReport({ id: activeId, key, phase: "loading" });
          await engine.init();
          if (cancelled) return;
        }
        setReport({ id: activeId, key, phase: "thinking" });
        const { best, info } = await engine.analyze(fen, limit);
        if (cancelled) return;

        const turn = turnFromFen(fen);
        const legal = resolveUciMove(fen, best.move);
        if (!turn || !legal) {
          fail(`Stockfish returned an illegal move (${best.move.uci})`);
          return;
        }
        if (!info) {
          fail("Stockfish did not report a score");
          return;
        }
        const evaluation: PositionEvaluation = {
          score: toWhiteScore(info.score, turn),
          depth: info.depth,
          bestMoveSan: legal.san,
          bestMoveUci: best.move.uci,
          pv: buildPvLine(fen, choosePv(best.move.uci, info.pv)),
        };
        put(cacheKey, evaluation);
        setReport({ id: activeId, key, phase: "done", evaluation });
      } catch (error) {
        if (cancelled || error instanceof EngineCancelledError) return;
        fail(error instanceof Error ? error.message : "Engine error");
      }
    };

    // One search per position and limit at a time, across every hook sharing
    // the store: if another is already searching this exact position, wait for
    // it and use its result; if it left none (it was cancelled), search it here.
    const timer = setTimeout(async () => {
      let claim = claimSearch(cacheKey);
      while (!claim.owned) {
        await claim.wait;
        if (cancelled || getLatest().has(cacheKey)) return;
        claim = claimSearch(cacheKey);
      }
      try {
        await run();
      } finally {
        claim.release();
      }
    }, activeId === AUTO_ID ? AUTO_DEBOUNCE_MS : 0);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      engineRef.current?.cancel();
    };
  }, [activeId, fen, key, limit, cacheKey, hasCached, put, claimSearch, getLatest]);

  const evaluate = useCallback(() => {
    if (disabled) return;
    nextId.current += 1;
    setRequest({ id: nextId.current, key });
  }, [disabled, key]);

  let status: EvaluationStatus;
  if (activeId === null) status = { phase: "idle" };
  else if (cached) status = { phase: "done", evaluation: cached };
  else if (report?.id !== activeId || report.key !== key) {
    status = { phase: "thinking" };
  } else if (report.phase === "done") {
    status = { phase: "done", evaluation: report.evaluation };
  } else if (report.phase === "error") {
    status = { phase: "error", message: report.message };
  } else status = { phase: report.phase };

  // The score of the position on the board for the evaluation bar: the status's
  // own when it is done, otherwise any completed evaluation of this exact
  // position (the full-length one first), even when none is being requested.
  // It is always this position's score, never a neighbour's.
  let barScore: WhiteScore | null = null;
  if (status.phase === "done") {
    barScore = status.evaluation.score;
  } else if (!disabled) {
    barScore =
      lookupEvaluation(cache, fen, [ANALYSIS_LIMIT, AUTO_ANALYSIS_LIMIT])
        ?.score ?? null;
  }

  return { status, evaluate, barScore };
}
