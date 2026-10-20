import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  clockLabel,
  humanResult,
  levelName,
  moveCount,
  pgnFileName,
  terminationLabel,
} from "./history-format.ts";

describe("history-format", () => {
  it("words the result from the human's side", () => {
    assert.equal(humanResult("WHITE_WIN", "WHITE"), "win");
    assert.equal(humanResult("WHITE_WIN", "BLACK"), "loss");
    assert.equal(humanResult("BLACK_WIN", "BLACK"), "win");
    assert.equal(humanResult("BLACK_WIN", "WHITE"), "loss");
    assert.equal(humanResult("DRAW", "WHITE"), "draw");
  });

  it("labels clocks", () => {
    assert.equal(clockLabel(0, 0), "Untimed");
    assert.equal(clockLabel(10, 0), "10 min");
    assert.equal(clockLabel(5, 3), "5+3");
  });

  it("names levels, keeping unknown ids readable", () => {
    assert.equal(levelName("standard"), "Standard");
    assert.equal(levelName("retired-level"), "retired-level");
  });

  it("counts full moves and names files", () => {
    assert.equal(moveCount(4), 2);
    assert.equal(moveCount(5), 3);
    assert.equal(
      pgnFileName("2026-10-19T12:00:00.000Z", "abcdef123456"),
      "gambit-2026-10-19-abcdef.pgn",
    );
    assert.equal(terminationLabel("TIMEOUT"), "Time out");
  });
});
