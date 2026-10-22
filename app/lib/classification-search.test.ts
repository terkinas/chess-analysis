import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Chess } from "chess.js";
import {
  CLASSIFICATION_DEPTH,
  CLASSIFICATION_LIMIT,
  classificationDetails,
  classificationScore,
  classificationScores,
  ensureEvaluations,
  type SearchEngine,
  type SearchStore,
} from "./classification-search.ts";
import {
  evaluationCacheKey,
  withEvaluation,
  type EvaluationCache,
} from "./evaluation-cache.ts";
import { InFlightRegistry } from "./in-flight.ts";
import { moveContextAt } from "./move-context.ts";
import { classifyMove } from "./move-classification.ts";
import { EngineCancelledError, parseUciMove } from "./stockfish-engine.ts";
import type { PositionEvaluation } from "./use-position-analysis.ts";

const LIMIT = { depth: 8 };
const FULL = { moveTimeMs: 1500 };

const evaluation = (cp: number): PositionEvaluation => ({
  score: { kind: "cp", cp },
  depth: 8,
  bestMoveSan: "x",
  bestMoveUci: "a1a2",
  pv: { startFen: "", moves: [], stoppedEarly: false },
});

/** A store over a plain map, sharing one in-flight registry like the real one. */
function makeStore(registry = new InFlightRegistry()) {
  let cache: EvaluationCache = new Map();
  const store: SearchStore = {
    getLatest: () => cache,
    put: (key, ev) => {
      cache = withEvaluation(cache, key, ev);
    },
    claim: (key) => registry.claim(key),
  };
  return { store, registry, cache: () => cache };
}

/** An engine whose every search reports `value` (side to move's view) for a legal move. */
function fakeEngine(
  value = 30,
  log: string[] = [],
  options: { delay?: Promise<void>; fail?: Error } = {},
): SearchEngine {
  return {
    getStatus: () => "ready",
    init: async () => {},
    analyze: async (fen) => {
      log.push(fen);
      await options.delay;
      if (options.fail) throw options.fail;
      const game = new Chess(fen);
      const move = game.moves({ verbose: true })[0];
      const uci = `${move.from}${move.to}${move.promotion ?? ""}`;
      const parsed = parseUciMove(uci)!;
      return {
        best: { move: parsed },
        info: { depth: 8, score: { kind: "cp", value }, pv: [uci] },
        second: null,
      };
    },
  };
}

const context = moveContextAt(["e4", "e5"], 2)!;

describe("CLASSIFICATION_LIMIT", () => {
  it("judges moves at depth 12 with the two best lines", () => {
    assert.equal(CLASSIFICATION_DEPTH, 12);
    assert.deepEqual(CLASSIFICATION_LIMIT, { depth: 12, multiPv: 2 });
  });

  it("never shares a cache key with the quick automatic depth-8 analysis", () => {
    assert.notEqual(
      evaluationCacheKey("F", CLASSIFICATION_LIMIT),
      evaluationCacheKey("F", { depth: 8 }),
    );
    assert.notEqual(
      evaluationCacheKey("F", CLASSIFICATION_LIMIT),
      evaluationCacheKey("F", { depth: 8, multiPv: 2 }),
    );
  });
});

describe("classificationScore", () => {
  it("only accepts an evaluation made at exactly the classification limit", () => {
    const cache = withEvaluation(
      new Map(),
      evaluationCacheKey("F", FULL),
      evaluation(500),
    );
    assert.equal(classificationScore(cache, "F", LIMIT), null);
    const both = withEvaluation(cache, evaluationCacheKey("F", LIMIT), evaluation(7));
    assert.deepEqual(classificationScore(both, "F", LIMIT), { kind: "cp", cp: 7 });
  });

  it("scores a finished game without any evaluation", () => {
    const mated = moveContextAt(["f3", "e5", "g4", "Qh4#"], 4)!;
    const scores = classificationScores(new Map(), mated, LIMIT);
    assert.equal(scores.before, null);
    assert.deepEqual(scores.after, { kind: "mate", winner: "b", moves: 0 });
  });
});

describe("ensureEvaluations", () => {
  it("searches the position before the move, then the one after, at the limit", async () => {
    const { store, cache } = makeStore();
    const log: string[] = [];
    await ensureEvaluations({
      context,
      limit: LIMIT,
      store,
      getEngine: () => fakeEngine(30, log),
      isCancelled: () => false,
    });
    assert.deepEqual(log, [context.beforeFen, context.afterFen]);
    assert.ok(cache().has(evaluationCacheKey(context.beforeFen, LIMIT)));
    assert.ok(cache().has(evaluationCacheKey(context.afterFen, LIMIT)));
  });

  it("skips positions already cached at the limit", async () => {
    const { store } = makeStore();
    store.put(evaluationCacheKey(context.beforeFen, LIMIT), evaluation(10));
    const log: string[] = [];
    await ensureEvaluations({
      context,
      limit: LIMIT,
      store,
      getEngine: () => fakeEngine(30, log),
      isCancelled: () => false,
    });
    assert.deepEqual(log, [context.afterFen]);
  });

  it("does not reuse an evaluation made at a different limit", async () => {
    const { store } = makeStore();
    store.put(evaluationCacheKey(context.beforeFen, FULL), evaluation(10));
    store.put(evaluationCacheKey(context.afterFen, FULL), evaluation(10));
    const log: string[] = [];
    await ensureEvaluations({
      context,
      limit: LIMIT,
      store,
      getEngine: () => fakeEngine(30, log),
      isCancelled: () => false,
    });
    assert.equal(log.length, 2);
  });

  it("does not search a position that is checkmate", async () => {
    const mated = moveContextAt(["f3", "e5", "g4", "Qh4#"], 4)!;
    const { store } = makeStore();
    const log: string[] = [];
    await ensureEvaluations({
      context: mated,
      limit: LIMIT,
      store,
      getEngine: () => fakeEngine(30, log),
      isCancelled: () => false,
    });
    assert.deepEqual(log, [mated.beforeFen]);
  });

  it("shares one search between two callers wanting the same positions", async () => {
    const { store } = makeStore();
    const log: string[] = [];
    const run = () =>
      ensureEvaluations({
        context,
        limit: LIMIT,
        store,
        getEngine: () => fakeEngine(30, log),
        isCancelled: () => false,
      });
    await Promise.all([run(), run()]);
    assert.equal(log.length, 2);
  });

  it("waits for a search someone else is running and uses its result", async () => {
    const { store, registry } = makeStore();
    const key = evaluationCacheKey(context.beforeFen, LIMIT);
    const foreign = registry.claim(key);
    assert.ok(foreign.owned);
    const log: string[] = [];
    const run = ensureEvaluations({
      context,
      limit: LIMIT,
      store,
      getEngine: () => fakeEngine(30, log),
      isCancelled: () => false,
    });
    await new Promise((r) => setTimeout(r, 5));
    assert.deepEqual(log, []);
    store.put(key, evaluation(12));
    if (foreign.owned) foreign.release();
    await run;
    // Only the position after the move was searched here.
    assert.deepEqual(log, [context.afterFen]);
  });

  it("searches itself when the other search ended without a result", async () => {
    const { store, registry } = makeStore();
    const foreign = registry.claim(evaluationCacheKey(context.beforeFen, LIMIT));
    assert.ok(foreign.owned);
    const log: string[] = [];
    const run = ensureEvaluations({
      context,
      limit: LIMIT,
      store,
      getEngine: () => fakeEngine(30, log),
      isCancelled: () => false,
    });
    await new Promise((r) => setTimeout(r, 5));
    if (foreign.owned) foreign.release(); // cancelled, nothing stored
    await run;
    assert.deepEqual(log, [context.beforeFen, context.afterFen]);
  });

  it("stores nothing and frees the key once cancelled", async () => {
    const { store, registry, cache } = makeStore();
    let cancelled = false;
    let release!: () => void;
    const delay = new Promise<void>((r) => (release = r));
    const run = ensureEvaluations({
      context,
      limit: LIMIT,
      store,
      getEngine: () => fakeEngine(30, [], { delay }),
      isCancelled: () => cancelled,
    });
    await Promise.resolve();
    cancelled = true;
    release();
    await run;
    assert.equal(cache().size, 0);
    assert.equal(
      registry.isPending(evaluationCacheKey(context.beforeFen, LIMIT)),
      false,
    );
  });

  it("rejects and frees the key when the engine fails", async () => {
    const { store, registry } = makeStore();
    await assert.rejects(
      ensureEvaluations({
        context,
        limit: LIMIT,
        store,
        getEngine: () => fakeEngine(30, [], { fail: new EngineCancelledError() }),
        isCancelled: () => false,
      }),
      EngineCancelledError,
    );
    assert.equal(
      registry.isPending(evaluationCacheKey(context.beforeFen, LIMIT)),
      false,
    );
  });

  it("feeds the classifier: Black's move is judged from Black's side", async () => {
    // The fake engine reports +30 for whoever is to move. Black is to move
    // before 1...e5, so White's view is -30; White is to move after it, +30.
    // Black went from +30 to -30 in its own terms: 60 cp lost.
    const { store, cache } = makeStore();
    await ensureEvaluations({
      context,
      limit: LIMIT,
      store,
      getEngine: () => fakeEngine(30),
      isCancelled: () => false,
    });
    const { before, after } = classificationScores(cache(), context, LIMIT);
    assert.deepEqual(before, { kind: "cp", cp: -30 });
    assert.deepEqual(after, { kind: "cp", cp: 30 });
    const result = classifyMove({ before, after, mover: context.mover });
    assert.equal(result.status === "classified" && result.centipawnLoss, 60);
    assert.equal(result.status === "classified" && result.quality, "inaccuracy");
  });
});

describe("classificationDetails: the engine's best move", () => {
  // Black plays e5 here; the position before it was searched at LIMIT.
  const withBefore = (best: string, beforeCp: number, afterCp: number) => {
    let cache: EvaluationCache = new Map();
    cache = withEvaluation(cache, evaluationCacheKey(context.beforeFen, LIMIT), {
      ...evaluation(beforeCp),
      bestMoveSan: best,
    });
    cache = withEvaluation(
      cache,
      evaluationCacheKey(context.afterFen, LIMIT),
      evaluation(afterCp),
    );
    return cache;
  };

  it("scores the best move by the score of the position before it, not a drifting second search", () => {
    // The after-search (White's view, side to move White) drifted 70 cp against Black.
    const cache = withBefore(context.san, -30, 40);
    const details = classificationDetails(cache, context, LIMIT);
    assert.deepEqual(details.after, details.before);
    const result = classifyMove({
      before: details.before,
      after: details.after,
      mover: context.mover,
    });
    assert.equal(result.status, "classified");
    if (result.status === "classified") {
      assert.equal(result.centipawnLoss, 0);
      assert.equal(result.quality, "best");
    }
  });

  it("still compares a move that is not the engine's best with the search after it", () => {
    const cache = withBefore("Nf6", -30, 40);
    const details = classificationDetails(cache, context, LIMIT);
    assert.deepEqual(details.after, { kind: "cp", cp: 40 });
  });
});
