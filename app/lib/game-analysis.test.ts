import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  analyzeMove,
  moveAccuracy,
  summarizeGame,
  winPercent,
  type AnalyzedMove,
} from "./game-analysis.ts";
import type { WhiteScore } from "./uci-info.ts";

const cp = (value: number): WhiteScore => ({ kind: "cp", cp: value });
const mate = (winner: "w" | "b", moves: number): WhiteScore => ({
  kind: "mate",
  winner,
  moves,
});

describe("winPercent", () => {
  it("is 50 at equal material and rises with the advantage", () => {
    assert.equal(winPercent(0), 50);
    assert.ok(winPercent(100) > 50);
    assert.ok(winPercent(-100) < 50);
    assert.ok(winPercent(1000) < 100 && winPercent(1000) > 95);
  });

  it("is symmetric around 50", () => {
    assert.ok(Math.abs(winPercent(250) + winPercent(-250) - 100) < 1e-9);
  });
});

describe("moveAccuracy", () => {
  it("is 100 for a move that keeps the win chance", () => {
    assert.ok(Math.abs(moveAccuracy(60, 60) - 100) < 0.001);
  });

  it("is never above 100 or below 0", () => {
    assert.ok(moveAccuracy(50, 50) <= 100);
    assert.ok(moveAccuracy(10, 90) > 99.99); // gaining chances is not punished
    assert.equal(moveAccuracy(100, 0), 0);
  });

  it("falls as the win chance drops, faster for bigger drops", () => {
    const small = moveAccuracy(60, 55);
    const large = moveAccuracy(60, 30);
    assert.ok(small > large);
    assert.ok(small < 100);
  });
});

describe("analyzeMove", () => {
  it("returns null when a score is missing or unusable", () => {
    assert.equal(analyzeMove(null, cp(0), "w"), null);
    assert.equal(analyzeMove(cp(0), undefined, "w"), null);
    assert.equal(
      analyzeMove({ kind: "cp", cp: Number.NaN }, cp(0), "w"),
      null,
    );
  });

  it("judges Black's moves from Black's side", () => {
    // White's advantage going from +3.0 to +0.2 is a gain for Black: fine.
    const gain = analyzeMove(cp(300), cp(20), "b");
    assert.ok(gain);
    assert.equal(gain.quality, "best");
    assert.ok(gain.accuracy > 99.99);

    // The same swing the other way is a blunder by Black.
    const blunder = analyzeMove(cp(20), cp(300), "b");
    assert.ok(blunder);
    assert.equal(blunder.quality, "blunder");
  });

  it("flags a blunder by the mover", () => {
    const blunder = analyzeMove(cp(50), cp(-400), "w");
    assert.ok(blunder);
    assert.equal(blunder.quality, "blunder");
    assert.ok(blunder.accuracy < 50);
  });

  it("gives a mate allowed against the mover a low accuracy", () => {
    const allowed = analyzeMove(cp(0), mate("b", 2), "w");
    assert.ok(allowed);
    assert.equal(allowed.quality, "blunder");
    assert.ok(allowed.accuracy < 15);
  });
});

describe("whiteWin", () => {
  it("is White's win chance whoever moved", () => {
    // After White's move the position is +3.00 for White.
    const byWhite = analyzeMove(cp(100), cp(300), "w");
    assert.ok(byWhite && byWhite.whiteWin > 50);
    // The same score after Black's move is still good for White.
    const byBlack = analyzeMove(cp(400), cp(300), "b");
    assert.ok(byBlack && Math.abs(byBlack.whiteWin - byWhite.whiteWin) < 1e-9);
    // A score in Black's favour is below 50 for White.
    const losing = analyzeMove(cp(-100), cp(-300), "w");
    assert.ok(losing && losing.whiteWin < 50);
  });
});

describe("summarizeGame", () => {
  const move = (
    mover: "w" | "b",
    quality: AnalyzedMove["quality"],
    accuracy: number,
  ): AnalyzedMove => ({ mover, quality, accuracy, whiteWin: 50 });

  it("averages accuracy per player and counts flagged moves", () => {
    const summary = summarizeGame([
      move("w", "best", 100),
      move("b", "inaccuracy", 80),
      move("w", "blunder", 40),
      move("b", "mistake", 60),
      move("b", "good", 90),
    ]);
    assert.equal(summary.white.accuracy, 70);
    assert.equal(summary.white.analysedMoves, 2);
    assert.deepEqual(summary.white.counts, {
      brilliant: 0,
      great: 0,
      inaccuracy: 0,
      mistake: 0,
      blunder: 1,
    });
    assert.equal(summary.black.accuracy, 76.7);
    assert.equal(summary.black.analysedMoves, 3);
    assert.deepEqual(summary.black.counts, {
      brilliant: 0,
      great: 0,
      inaccuracy: 1,
      mistake: 1,
      blunder: 0,
    });
  });

  it("counts brilliant and great moves too", () => {
    const summary = summarizeGame([
      move("w", "brilliant", 100),
      move("w", "great", 100),
      move("w", "great", 100),
      move("b", "best", 100),
    ]);
    assert.equal(summary.white.counts.brilliant, 1);
    assert.equal(summary.white.counts.great, 2);
    assert.equal(summary.black.counts.great, 0);
  });

  it("skips moves that are pending or unjudged", () => {
    const summary = summarizeGame([
      undefined,
      null,
      move("w", "best", 90),
      undefined,
    ]);
    assert.equal(summary.white.accuracy, 90);
    assert.equal(summary.white.analysedMoves, 1);
    assert.equal(summary.black.accuracy, null);
    assert.equal(summary.black.analysedMoves, 0);
  });

  it("reports no accuracy for an empty game", () => {
    const summary = summarizeGame([]);
    assert.equal(summary.white.accuracy, null);
    assert.equal(summary.black.accuracy, null);
  });
});
