import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  describeWhiteScore,
  formatWhiteScore,
  parseInfoLine,
  toWhiteScore,
  turnFromFen,
} from "./uci-info.ts";

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const BLACK_TO_MOVE =
  "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1";

describe("parseInfoLine", () => {
  it("reads depth, a centipawn score and the principal variation", () => {
    const line =
      "info depth 14 seldepth 18 multipv 1 score cp 34 nodes 120000 nps 900000 time 133 pv e2e4 e7e5 g1f3";
    assert.deepEqual(parseInfoLine(line), {
      depth: 14,
      score: { kind: "cp", value: 34 },
      pv: ["e2e4", "e7e5", "g1f3"],
    });
  });

  it("reads negative centipawn scores", () => {
    const info = parseInfoLine("info depth 3 score cp -125 pv d7d5");
    assert.deepEqual(info?.score, { kind: "cp", value: -125 });
  });

  it("reads mate scores, positive and negative", () => {
    assert.deepEqual(parseInfoLine("info depth 9 score mate 3 pv d1h5")?.score, {
      kind: "mate",
      moves: 3,
    });
    assert.deepEqual(parseInfoLine("info depth 9 score mate -2 pv a2a3")?.score, {
      kind: "mate",
      moves: -2,
    });
  });

  it("accepts a line with no principal variation", () => {
    assert.deepEqual(parseInfoLine("info depth 1 score cp 0")?.pv, []);
  });

  it("ignores lines that are not info lines or carry no score", () => {
    assert.equal(parseInfoLine("bestmove e2e4"), null);
    assert.equal(parseInfoLine("uciok"), null);
    assert.equal(parseInfoLine(""), null);
    assert.equal(parseInfoLine("info depth 5 currmove e2e4 currmovenumber 1"), null);
    assert.equal(parseInfoLine("info string NNUE evaluation using nn.nnue"), null);
    // Free text must not be mistaken for a score.
    assert.equal(parseInfoLine("info string score cp 100 depth 5"), null);
  });

  it("ignores bounds, which are not exact scores", () => {
    assert.equal(parseInfoLine("info depth 10 score cp 50 lowerbound pv e2e4"), null);
    assert.equal(parseInfoLine("info depth 10 score cp 50 upperbound pv e2e4"), null);
  });

  it("ignores secondary lines (multipv 2 and up)", () => {
    assert.equal(parseInfoLine("info depth 10 multipv 2 score cp 10 pv d2d4"), null);
    assert.ok(parseInfoLine("info depth 10 multipv 1 score cp 10 pv d2d4"));
  });

  it("rejects malformed scores and depths instead of guessing", () => {
    assert.equal(parseInfoLine("info depth 5 score cp"), null);
    assert.equal(parseInfoLine("info depth 5 score cp abc"), null);
    assert.equal(parseInfoLine("info depth 5 score cp 1.5"), null);
    assert.equal(parseInfoLine("info depth 5 score wdl 1 2 3"), null);
    assert.equal(parseInfoLine("info depth 5 score mate"), null);
    assert.equal(parseInfoLine("info score cp 10 pv e2e4"), null);
    assert.equal(parseInfoLine("info depth x score cp 10"), null);
    assert.equal(parseInfoLine("info depth 5 score cp 99999999999999999999"), null);
  });

  it("tolerates extra whitespace", () => {
    assert.ok(parseInfoLine("  info   depth 4   score  cp  7  pv  e2e4 \n"));
  });
});

describe("parseInfoLine principal variation", () => {
  it("captures the whole multipv 1 line, in order", () => {
    const info = parseInfoLine(
      "info depth 16 seldepth 22 multipv 1 score cp 28 nodes 1 pv e2e4 e7e5 g1f3 b8c6 f1b5 a7a6",
    );
    assert.deepEqual(info?.pv, [
      "e2e4",
      "e7e5",
      "g1f3",
      "b8c6",
      "f1b5",
      "a7a6",
    ]);
  });

  it("keeps promotions and castling in UCI form", () => {
    const info = parseInfoLine("info depth 9 score cp 400 pv a7a8q e1g1");
    assert.deepEqual(info?.pv, ["a7a8q", "e1g1"]);
  });

  it("stops at the first token that is not a UCI move", () => {
    const info = parseInfoLine("info depth 9 score cp 1 pv e2e4 e7e5 xx g1f3");
    assert.deepEqual(info?.pv, ["e2e4", "e7e5"]);
    assert.deepEqual(parseInfoLine("info depth 9 score cp 1 pv (none)")?.pv, []);
    assert.deepEqual(parseInfoLine("info depth 9 score cp 1 pv e2e9")?.pv, []);
  });

  it("does not take a pv from a secondary or bound line", () => {
    assert.equal(
      parseInfoLine("info depth 9 multipv 2 score cp 5 pv d2d4 d7d5"),
      null,
    );
    assert.equal(
      parseInfoLine("info depth 9 score cp 5 upperbound pv d2d4 d7d5"),
      null,
    );
  });

  it("gives an empty line when the engine sent none", () => {
    assert.deepEqual(parseInfoLine("info depth 9 score mate 1")?.pv, []);
    assert.deepEqual(parseInfoLine("info depth 9 score mate 1 pv")?.pv, []);
  });
});

describe("turnFromFen", () => {
  it("reads the side to move", () => {
    assert.equal(turnFromFen(START_FEN), "w");
    assert.equal(turnFromFen(BLACK_TO_MOVE), "b");
  });

  it("returns null for a missing or invalid turn field", () => {
    assert.equal(turnFromFen(""), null);
    assert.equal(turnFromFen("8/8/8/8/8/8/8/8"), null);
    assert.equal(turnFromFen("8/8/8/8/8/8/8/8 x - - 0 1"), null);
  });
});

describe("toWhiteScore", () => {
  it("keeps centipawns as they are when White is to move", () => {
    assert.deepEqual(toWhiteScore({ kind: "cp", value: 80 }, "w"), {
      kind: "cp",
      cp: 80,
    });
    assert.deepEqual(toWhiteScore({ kind: "cp", value: -80 }, "w"), {
      kind: "cp",
      cp: -80,
    });
  });

  it("flips centipawns when Black is to move", () => {
    // +80 for Black to move is -80 for White.
    assert.deepEqual(toWhiteScore({ kind: "cp", value: 80 }, "b"), {
      kind: "cp",
      cp: -80,
    });
    assert.deepEqual(toWhiteScore({ kind: "cp", value: -250 }, "b"), {
      kind: "cp",
      cp: 250,
    });
  });

  it("never produces a negative zero", () => {
    const score = toWhiteScore({ kind: "cp", value: 0 }, "b");
    assert.ok(score.kind === "cp" && Object.is(score.cp, 0));
  });

  it("attributes a mate to the side that delivers it", () => {
    assert.deepEqual(toWhiteScore({ kind: "mate", moves: 3 }, "w"), {
      kind: "mate",
      winner: "w",
      moves: 3,
    });
    assert.deepEqual(toWhiteScore({ kind: "mate", moves: 3 }, "b"), {
      kind: "mate",
      winner: "b",
      moves: 3,
    });
    assert.deepEqual(toWhiteScore({ kind: "mate", moves: -2 }, "w"), {
      kind: "mate",
      winner: "b",
      moves: 2,
    });
    assert.deepEqual(toWhiteScore({ kind: "mate", moves: -2 }, "b"), {
      kind: "mate",
      winner: "w",
      moves: 2,
    });
  });

  it("treats `mate 0` as the side to move being checkmated", () => {
    assert.deepEqual(toWhiteScore({ kind: "mate", moves: 0 }, "w"), {
      kind: "mate",
      winner: "b",
      moves: 0,
    });
    assert.deepEqual(toWhiteScore({ kind: "mate", moves: 0 }, "b"), {
      kind: "mate",
      winner: "w",
      moves: 0,
    });
  });

  it("converts a parsed line end to end", () => {
    const info = parseInfoLine("info depth 12 score cp 120 pv e7e5");
    assert.ok(info);
    // The engine likes the position by 1.20 for Black, who is to move.
    assert.equal(
      formatWhiteScore(toWhiteScore(info.score, turnFromFen(BLACK_TO_MOVE)!)),
      "-1.20",
    );
  });
});

describe("formatWhiteScore and describeWhiteScore", () => {
  it("formats centipawns in pawns with an explicit sign", () => {
    assert.equal(formatWhiteScore({ kind: "cp", cp: 34 }), "+0.34");
    assert.equal(formatWhiteScore({ kind: "cp", cp: -120 }), "-1.20");
    assert.equal(formatWhiteScore({ kind: "cp", cp: 5 }), "+0.05");
    assert.equal(formatWhiteScore({ kind: "cp", cp: 0 }), "0.00");
  });

  it("formats mate scores from White's side", () => {
    assert.equal(formatWhiteScore({ kind: "mate", winner: "w", moves: 3 }), "+M3");
    assert.equal(formatWhiteScore({ kind: "mate", winner: "b", moves: 1 }), "-M1");
    assert.equal(formatWhiteScore({ kind: "mate", winner: "w", moves: 0 }), "1-0");
    assert.equal(formatWhiteScore({ kind: "mate", winner: "b", moves: 0 }), "0-1");
  });

  it("describes scores in words", () => {
    assert.equal(describeWhiteScore({ kind: "cp", cp: 0 }), "Equal position");
    assert.equal(
      describeWhiteScore({ kind: "cp", cp: -75 }),
      "Black is better by 0.75 pawns",
    );
    assert.equal(
      describeWhiteScore({ kind: "mate", winner: "w", moves: 1 }),
      "White mates in 1 move",
    );
    assert.equal(
      describeWhiteScore({ kind: "mate", winner: "b", moves: 4 }),
      "Black mates in 4 moves",
    );
    assert.equal(
      describeWhiteScore({ kind: "mate", winner: "b", moves: 0 }),
      "Checkmate — Black wins",
    );
  });
});
