import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  evaluationCacheKey,
  lookupEvaluation,
  withEvaluation,
} from "./evaluation-cache.ts";
import type { PositionEvaluation } from "./use-position-analysis.ts";

const fake = (cp: number): PositionEvaluation => ({
  score: { kind: "cp", cp },
  depth: 8,
  bestMoveSan: "e4",
  bestMoveUci: "e2e4",
  pv: { startFen: "", moves: [], stoppedEarly: false },
});
const FULL = { moveTimeMs: 1500 };
const SHALLOW = { depth: 8 };

describe("evaluation cache", () => {
  it("finds an evaluation of exactly this position, preferring earlier limits", () => {
    let cache = withEvaluation(new Map(), evaluationCacheKey("A", SHALLOW), fake(1));
    assert.equal(lookupEvaluation(cache, "A", [FULL, SHALLOW])?.score.kind, "cp");
    assert.equal(lookupEvaluation(cache, "B", [FULL, SHALLOW]), null);
    cache = withEvaluation(cache, evaluationCacheKey("A", FULL), fake(2));
    const hit = lookupEvaluation(cache, "A", [FULL, SHALLOW]);
    assert.equal(hit?.score.kind === "cp" && hit.score.cp, 2);
  });

  it("does not mutate the map it was given and drops the oldest beyond the limit", () => {
    const base = new Map<string, PositionEvaluation>();
    const one = withEvaluation(base, "a", fake(1), 2);
    const two = withEvaluation(one, "b", fake(2), 2);
    const three = withEvaluation(two, "c", fake(3), 2);
    assert.equal(base.size, 0);
    assert.deepEqual([...three.keys()], ["b", "c"]);
  });

  it("re-adding a key makes it the newest", () => {
    let cache = withEvaluation(new Map(), "a", fake(1), 2);
    cache = withEvaluation(cache, "b", fake(2), 2);
    cache = withEvaluation(cache, "a", fake(3), 2);
    cache = withEvaluation(cache, "c", fake(4), 2);
    assert.deepEqual([...cache.keys()], ["a", "c"]);
  });
});
