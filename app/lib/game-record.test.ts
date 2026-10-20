import assert from "node:assert/strict";
import { test } from "node:test";
import { buildGameRecord, MAX_PLIES, verdictFor } from "./game-record.ts";

const ID = "3f2b8c1e-9d4a-4e6b-8a7c-1b2c3d4e5f60";
const NOW = new Date("2026-10-20T12:00:00Z");
const base = {
  id: ID,
  moves: ["e4", "e5", "Nf3"],
  humanColor: "w",
  levelId: "standard",
  clockMinutes: 10,
  clockIncrementSeconds: 0,
  timedOut: null,
  resigned: null,
};
const FOOLS_MATE = ["f3", "e5", "g4", "Qh4#"];

function ok(input: unknown) {
  const result = buildGameRecord(input, NOW);
  assert.equal(result.ok, true);
  return result.ok ? result.record : (undefined as never);
}

test("an unfinished game is stored as * with no termination", () => {
  const record = ok(base);
  assert.equal(record.result, "*");
  assert.equal(record.termination, null);
  assert.equal(record.plies, 3);
  assert.equal(record.white, "You");
  assert.equal(record.black, "Stockfish");
  assert.match(record.pgn, /1\. e4 e5 2\. Nf3/);
});

test("the result is worked out from the board, not trusted from the client", () => {
  const record = ok({ ...base, moves: FOOLS_MATE, humanColor: "b" });
  assert.equal(record.result, "0-1");
  assert.equal(record.termination, "checkmate");
  assert.equal(record.white, "Stockfish");
  assert.equal(record.black, "You");
});

test("resignation and timeout decide an undecided game", () => {
  const resigned = ok({ ...base, resigned: "w" });
  assert.equal(resigned.result, "0-1");
  assert.equal(resigned.termination, "resignation");
  const flagged = ok({ ...base, timedOut: "b" });
  assert.equal(flagged.result, "1-0");
  assert.equal(flagged.termination, "timeout");
});

test("a resignation cannot overturn a finished position", () => {
  const record = ok({ ...base, moves: FOOLS_MATE, resigned: "b" });
  assert.equal(record.result, "0-1");
  assert.equal(record.termination, "checkmate");
});

test("illegal or malformed input is rejected", () => {
  const bad = (patch: Record<string, unknown>) =>
    assert.equal(buildGameRecord({ ...base, ...patch }, NOW).ok, false);
  bad({ moves: ["e4", "e4"] });
  bad({ moves: [] });
  bad({ moves: Array(MAX_PLIES + 1).fill("Nf3") });
  bad({ moves: ["e4", 5] });
  bad({ id: "not-a-uuid" });
  bad({ humanColor: "x" });
  bad({ levelId: "godlike" });
  bad({ clockMinutes: 7 });
  bad({ resigned: "red" });
  assert.equal(buildGameRecord(null, NOW).ok, false);
  assert.equal(buildGameRecord("hi", NOW).ok, false);
});

test("verdictFor reads the result from the human's side", () => {
  assert.equal(verdictFor("1-0", "w"), "win");
  assert.equal(verdictFor("1-0", "b"), "loss");
  assert.equal(verdictFor("0-1", "b"), "win");
  assert.equal(verdictFor("1/2-1/2", "w"), "draw");
  assert.equal(verdictFor("*", "w"), "unfinished");
});
