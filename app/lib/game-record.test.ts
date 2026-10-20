import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseSaveRequest, type SaveGameRequest } from "./game-record.ts";

const NOW = new Date(2026, 9, 19, 12, 0, 0);
const FOOLS_MATE = ["f3", "e5", "g4", "Qh4#"];

function request(overrides: Partial<SaveGameRequest> = {}): SaveGameRequest {
  return {
    id: "game-0001-abcdef",
    moves: FOOLS_MATE,
    humanColor: "w",
    levelId: "standard",
    clockMinutes: 10,
    clockIncrementSeconds: 5,
    timedOut: null,
    resigned: null,
    ...overrides,
  };
}

describe("parseSaveRequest", () => {
  it("stores a checkmate with the result worked out from the moves", () => {
    const parsed = parseSaveRequest(request(), NOW);
    assert.ok(parsed.ok);
    assert.equal(parsed.record.result, "BLACK_WIN");
    assert.equal(parsed.record.termination, "CHECKMATE");
    assert.equal(parsed.record.plies, 4);
    assert.equal(parsed.record.humanColor, "WHITE");
    assert.equal(parsed.record.engineLevel, "standard");
    assert.match(parsed.record.pgn, /\[Result "0-1"\]/);
    assert.match(parsed.record.pgn, /\[White "You"\]/);
    assert.match(parsed.record.pgn, /\[Black "Stockfish"\]/);
  });

  it("names the players from the human's colour", () => {
    const parsed = parseSaveRequest(request({ humanColor: "b" }), NOW);
    assert.ok(parsed.ok);
    assert.equal(parsed.record.humanColor, "BLACK");
    assert.match(parsed.record.pgn, /\[White "Stockfish"\]/);
    assert.match(parsed.record.pgn, /\[Black "You"\]/);
  });

  it("stores a resignation as a loss for the resigning side", () => {
    const parsed = parseSaveRequest(
      request({ moves: ["e4"], resigned: "w" }),
      NOW,
    );
    assert.ok(parsed.ok);
    assert.equal(parsed.record.result, "BLACK_WIN");
    assert.equal(parsed.record.termination, "RESIGNATION");
  });

  it("stores a flag fall as a loss for the side that ran out of time", () => {
    const parsed = parseSaveRequest(
      request({ moves: ["e4", "e5"], timedOut: "b" }),
      NOW,
    );
    assert.ok(parsed.ok);
    assert.equal(parsed.record.result, "WHITE_WIN");
    assert.equal(parsed.record.termination, "TIMEOUT");
  });

  it("stores a draw", () => {
    const parsed = parseSaveRequest(
      request({
        moves: ["Nf3", "Nf6", "Ng1", "Ng8", "Nf3", "Nf6", "Ng1", "Ng8"],
      }),
      NOW,
    );
    assert.ok(parsed.ok);
    assert.equal(parsed.record.result, "DRAW");
    assert.equal(parsed.record.termination, "DRAW");
  });

  it("drops the increment of an untimed game", () => {
    const parsed = parseSaveRequest(
      request({ clockMinutes: 0, clockIncrementSeconds: 5 }),
      NOW,
    );
    assert.ok(parsed.ok);
    assert.equal(parsed.record.clockMinutes, 0);
    assert.equal(parsed.record.clockIncrementSeconds, 0);
  });

  it("rejects a game that is not finished", () => {
    assert.equal(parseSaveRequest(request({ moves: ["e4", "e5"] }), NOW).ok, false);
  });

  it("rejects illegal or empty move lists", () => {
    assert.equal(parseSaveRequest(request({ moves: ["e5"] }), NOW).ok, false);
    assert.equal(parseSaveRequest(request({ moves: [] }), NOW).ok, false);
    assert.equal(parseSaveRequest(request({ moves: [1 as never] }), NOW).ok, false);
  });

  it("rejects a resignation by the engine's side", () => {
    const parsed = parseSaveRequest(
      request({ moves: ["e4"], resigned: "b" }),
      NOW,
    );
    assert.equal(parsed.ok, false);
  });

  it("rejects bad ids, levels and clocks", () => {
    assert.equal(parseSaveRequest(request({ id: "a/b" }), NOW).ok, false);
    assert.equal(parseSaveRequest(request({ levelId: "godlike" }), NOW).ok, false);
    assert.equal(parseSaveRequest(request({ clockMinutes: 7 }), NOW).ok, false);
    assert.equal(
      parseSaveRequest(request({ clockIncrementSeconds: 4 }), NOW).ok,
      false,
    );
  });

  it("rejects bodies that are not objects", () => {
    assert.equal(parseSaveRequest(null, NOW).ok, false);
    assert.equal(parseSaveRequest("x", NOW).ok, false);
  });
});
