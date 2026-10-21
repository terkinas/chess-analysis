import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { materialBalanceChange, materialFor } from "./material.ts";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

describe("materialFor", () => {
  it("counts the starting material of each side as 39 pawns", () => {
    assert.equal(materialFor(START, "w"), 39);
    assert.equal(materialFor(START, "b"), 39);
  });

  it("ignores kings and returns null for an unreadable board", () => {
    assert.equal(materialFor("8/8/8/8/8/8/8/K6k w - - 0 1", "w"), 0);
    assert.equal(materialFor("not a fen", "w"), null);
  });
});

describe("materialBalanceChange", () => {
  it("is zero for a quiet move", () => {
    const after = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1";
    assert.equal(materialBalanceChange(START, after, "w"), 0);
  });

  it("is positive when the mover wins a pawn", () => {
    const before = "4k3/8/8/3p4/4P3/8/8/4K3 w - - 0 1";
    const after = "4k3/8/8/3P4/8/8/8/4K3 b - - 0 1";
    assert.equal(materialBalanceChange(before, after, "w"), 1);
  });

  it("is negative for the side that loses a piece for nothing", () => {
    // White's pawn takes Black's bishop on d5.
    const before = "4k3/8/8/3b4/4P3/8/8/4K3 w - - 0 1";
    const after = "4k3/8/8/3P4/8/8/8/4K3 b - - 0 1";
    assert.equal(materialBalanceChange(before, after, "b"), -3);
  });
});
