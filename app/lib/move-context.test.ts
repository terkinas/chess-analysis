import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  moveContextAt,
  moveContextsForLine,
  terminalWhiteScore,
} from "./move-context.ts";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

describe("moveContextAt", () => {
  it("is null at the start, past the end, or for a bad ply", () => {
    assert.equal(moveContextAt(["e4"], 0), null);
    assert.equal(moveContextAt(["e4"], 2), null);
    assert.equal(moveContextAt(["e4"], 0.5), null);
    assert.equal(moveContextAt([], 1), null);
  });

  it("gives the positions before and after a White move", () => {
    const ctx = moveContextAt(["e4", "e5"], 1);
    assert.ok(ctx);
    assert.equal(ctx.mover, "w");
    assert.equal(ctx.san, "e4");
    assert.equal(ctx.beforeFen, START);
    assert.equal(
      ctx.afterFen,
      "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
    );
  });

  it("attributes a Black move to Black", () => {
    const ctx = moveContextAt(["e4", "e5"], 2);
    assert.ok(ctx);
    assert.equal(ctx.mover, "b");
    assert.equal(ctx.beforeFen, moveContextAt(["e4"], 1)?.afterFen);
  });

  it("gives different keys for different moves, and equal keys for the same move", () => {
    const a = moveContextAt(["e4", "e5"], 2);
    const b = moveContextAt(["e4", "c5"], 2);
    const c = moveContextAt(["e4", "e5", "Nf3"], 2);
    assert.notEqual(a?.key, b?.key);
    assert.equal(a?.key, c?.key);
  });

  it("is null when the line holds an illegal move", () => {
    assert.equal(moveContextAt(["e4", "e4"], 2), null);
  });
});

describe("terminalWhiteScore", () => {
  it("scores checkmate as a mate for the side that delivered it", () => {
    const whiteMated = "rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3";
    assert.deepEqual(terminalWhiteScore(whiteMated), { kind: "mate", winner: "b", moves: 0 });
    const ctx = moveContextAt(["e4", "e5", "Qh5", "Nc6", "Bc4", "Nf6", "Qxf7#"], 7);
    assert.ok(ctx);
    assert.deepEqual(terminalWhiteScore(ctx.afterFen), { kind: "mate", winner: "w", moves: 0 });
  });

  it("scores stalemate as 0", () => {
    assert.deepEqual(terminalWhiteScore("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1"), { kind: "cp", cp: 0 });
  });

  it("is null for a live position or a bad FEN", () => {
    assert.equal(terminalWhiteScore(START), null);
    assert.equal(terminalWhiteScore("nonsense"), null);
  });
});

describe("moveContextsForLine", () => {
  const SCHOLARS = ["e4", "e5", "Qh5", "Nc6", "Bc4", "Nf6", "Qxf7"];

  it("has one entry per move, matching moveContextAt for each ply", () => {
    const contexts = moveContextsForLine(SCHOLARS);
    assert.equal(contexts.length, SCHOLARS.length);
    SCHOLARS.forEach((_, index) => {
      assert.deepEqual(contexts[index], moveContextAt(SCHOLARS, index + 1));
    });
  });

  it("gives each move the right mover and ply", () => {
    const contexts = moveContextsForLine(SCHOLARS);
    assert.equal(contexts[0]?.mover, "w");
    assert.equal(contexts[1]?.mover, "b");
    assert.equal(contexts[6]?.san, "Qxf7");
    assert.equal(contexts[6]?.ply, 7);
  });

  it("stops at the first illegal move, leaving null from there on", () => {
    const contexts = moveContextsForLine(["e4", "e4", "d4"]);
    assert.equal(contexts.length, 3);
    assert.notEqual(contexts[0], null);
    assert.equal(contexts[1], null);
    assert.equal(contexts[2], null);
  });

  it("is empty for an empty line", () => {
    assert.deepEqual(moveContextsForLine([]), []);
  });
});
