"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Move } from "chess.js";
import { resolveUciMove } from "./chess-game";
import { EngineCancelledError, StockfishEngine } from "./stockfish-engine";

type Report = {
  /** The request this report belongs to; anything else is stale. */
  key: string;
  phase: "loading" | "thinking" | "error";
  message?: string;
};

export type EngineOpponentStatus =
  | { phase: "idle" } // not the engine's turn
  | { phase: "loading" } // the worker is starting up
  | { phase: "thinking" }
  | { phase: "error"; message: string };

type Options = {
  /** Position the engine should move in (live game only). */
  fen: string;
  /** True only while it is the engine's turn and the game is not over. */
  active: boolean;
  /** Search limit (depth or time). Primitives, so changing them re-runs the search. */
  depth?: number;
  moveTimeMs?: number;
  /** Bump to force a fresh request even when the position is unchanged (new game). */
  epoch: number;
  /** Called with a chess.js-validated move and the FEN it was computed for. */
  onMove: (move: Move, fen: string) => void;
  /**
   * Called with true when a search actually starts (after the worker has
   * loaded) and with false when it fails, so a clock can run only while the
   * engine is really thinking. A completed search is reported through `onMove`.
   */
  onThinkingChange?: (thinking: boolean) => void;
};

/**
 * Drives the engine's side of the game. While `active`, it asks Stockfish for a
 * move in `fen` and hands the validated result to `onMove`. The effect's
 * cleanup cancels the search, so any change that matters — a new position,
 * different limits, the turn passing back to the human, game over, unmount —
 * both stops the old search and drops its reply. One engine (worker) is created
 * lazily, reused, and terminated on unmount.
 */
export function useEngineOpponent({
  fen,
  active,
  depth,
  moveTimeMs,
  epoch,
  onMove,
  onThinkingChange,
}: Options) {
  const engineRef = useRef<StockfishEngine | null>(null);
  const onMoveRef = useRef(onMove);
  const onThinkingChangeRef = useRef(onThinkingChange);
  const [retryToken, setRetryToken] = useState(0);
  const [report, setReport] = useState<Report | null>(null);

  const key = `${epoch}|${fen}|${depth ?? ""}|${moveTimeMs ?? ""}|${retryToken}`;

  useEffect(() => {
    onMoveRef.current = onMove;
    onThinkingChangeRef.current = onThinkingChange;
  });

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

    // Deferred a tick so a request that is immediately superseded (rapid state
    // changes, or StrictMode's mount → cleanup → mount in dev) is never sent.
    const timer = setTimeout(async () => {
      let engine = engineRef.current;
      if (!engine || ["error", "terminated"].includes(engine.getStatus())) {
        engine?.terminate();
        engine = new StockfishEngine();
        engineRef.current = engine;
      }

      try {
        if (engine.getStatus() !== "ready") {
          setReport({ key, phase: "loading" });
          await engine.init();
          if (cancelled) return;
        }
        setReport({ key, phase: "thinking" });
        onThinkingChangeRef.current?.(true);
        const best = await engine.getBestMove(fen, { depth, moveTimeMs });
        if (cancelled) return;

        const legal = resolveUciMove(fen, best.move);
        if (!legal) {
          onThinkingChangeRef.current?.(false);
          setReport({
            key,
            phase: "error",
            message: `Stockfish returned an illegal move (${best.move.uci})`,
          });
          return;
        }
        onMoveRef.current(legal, fen);
      } catch (error) {
        if (cancelled || error instanceof EngineCancelledError) return;
        onThinkingChangeRef.current?.(false);
        setReport({
          key,
          phase: "error",
          message: error instanceof Error ? error.message : "Engine error",
        });
      }
    }, 0);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      engineRef.current?.cancel();
    };
  }, [active, fen, depth, moveTimeMs, retryToken, key]);

  const retry = useCallback(() => setRetryToken((token) => token + 1), []);

  let status: EngineOpponentStatus;
  if (!active) status = { phase: "idle" };
  else if (report?.key !== key) status = { phase: "thinking" };
  else if (report.phase === "error") {
    status = { phase: "error", message: report.message ?? "Engine error" };
  } else status = { phase: report.phase };

  return { status, retry };
}
