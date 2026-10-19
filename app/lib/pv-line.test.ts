import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Chess } from "chess.js";
import { buildPvLine, replayPvOnto } from "./pv-line.ts";

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const AFTER_E4 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1";
const AFTER_F3 = "rnbqkbnr/pppppppp/8/8/8/5P2/PPPPP1PP/RNBQKBNR b KQkq - 0 1";

const sans = (pv: ReturnType<typeof buildPvLine>) => pv.moves.map((m) => m.san);

describe("buildPvLine", () => {
  it("converts UCI to SAN from the starting position", () => {
    const pv = buildPvLine(START_FEN, ["e2e4", "e7e5", "g1f3", "b8c6"]);
    assert.deepEqual(sans(pv), ["e4", "e5", "Nf3", "Nc6"]);
    assert.equal(pv.stoppedEarly, false);
    assert.equal(pv.startFen, START_FEN);
  });

  it("works when Black is to move", () => {
    const pv = buildPvLine(AFTER_E4, ["e7e5", "g1f3", "b8c6"]);
    assert.deepEqual(sans(pv), ["e5", "Nf3", "Nc6"]);
    assert.equal(pv.stoppedEarly, false);
  });

  it("records the position after every move", () => {
    const pv = buildPvLine(START_FEN, ["e2e4", "e7e5"]);
    // Compare with chess.js itself: whether its FEN prints an en passant square
    // after 1. e4 (no pawn can capture) is its decision, not this module's.
    const expected = new Chess(START_FEN);
    expected.move("e4");
    assert.equal(pv.moves[0].fen, expected.fen());
    assert.equal(pv.moves[0].uci, "e2e4");
    assert.equal(pv.moves[1].fen.split(" ")[1], "w");
  });

  it("handles castling and promotion", () => {
    const castle = buildPvLine("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1", [
      "e1g1",
      "e8c8",
    ]);
    assert.deepEqual(sans(castle), ["O-O", "O-O-O"]);
    const promo = buildPvLine("8/P6k/8/8/8/8/8/K7 w - - 0 1", ["a7a8q"]);
    assert.deepEqual(sans(promo), ["a8=Q"]);
  });

  it("stops at an illegal move and keeps the moves before it", () => {
    const pv = buildPvLine(START_FEN, ["e2e4", "e7e5", "e2e4", "b8c6"]);
    assert.deepEqual(sans(pv), ["e4", "e5"]);
    assert.equal(pv.stoppedEarly, true);
  });

  it("stops at a malformed move", () => {
    const pv = buildPvLine(START_FEN, ["e2e4", "zzzz", "e7e5"]);
    assert.deepEqual(sans(pv), ["e4"]);
    assert.equal(pv.stoppedEarly, true);
  });

  it("stops when the first move is already invalid for the side to move", () => {
    const pv = buildPvLine(START_FEN, ["e7e5"]);
    assert.deepEqual(pv.moves, []);
    assert.equal(pv.stoppedEarly, true);
  });

  it("stops after checkmate instead of replaying further moves", () => {
    const pv = buildPvLine(AFTER_F3, ["e7e5", "g2g4", "d8h4", "a2a3"]);
    assert.deepEqual(sans(pv), ["e5", "g4", "Qh4#"]);
    assert.equal(pv.stoppedEarly, true);
  });

  it("gives an empty line for an empty PV or an unusable FEN", () => {
    assert.deepEqual(buildPvLine(START_FEN, []), {
      startFen: START_FEN,
      moves: [],
      stoppedEarly: false,
    });
    const bad = buildPvLine("not a fen", ["e2e4"]);
    assert.deepEqual(bad.moves, []);
    assert.equal(bad.stoppedEarly, true);
  });

  it("does not mutate or depend on anything but its arguments", () => {
    const first = buildPvLine(START_FEN, ["e2e4"]);
    const second = buildPvLine(START_FEN, ["e2e4"]);
    assert.deepEqual(first, second);
  });
});

describe("replayPvOnto", () => {
  const pv = buildPvLine(START_FEN, ["e2e4", "e7e5", "g1f3", "b8c6"]);

  it("replays the first moves of a current PV on the game position", () => {
    assert.deepEqual(replayPvOnto(START_FEN, pv, 1), {
      sans: ["e4"],
      complete: true,
    });
    assert.deepEqual(replayPvOnto(START_FEN, pv, 3), {
      sans: ["e4", "e5", "Nf3"],
      complete: true,
    });
    assert.deepEqual(replayPvOnto(START_FEN, pv, 4)?.sans, [
      "e4",
      "e5",
      "Nf3",
      "Nc6",
    ]);
  });

  it("refuses a stale PV: the game is no longer in its source position", () => {
    assert.equal(replayPvOnto(AFTER_E4, pv, 1), null);
    assert.equal(replayPvOnto("not a fen", pv, 1), null);
  });

  it("refuses a bad move count", () => {
    assert.equal(replayPvOnto(START_FEN, pv, 0), null);
    assert.equal(replayPvOnto(START_FEN, pv, 5), null);
    assert.equal(replayPvOnto(START_FEN, pv, 1.5), null);
  });

  it("stops at an invalid move and reports the line as incomplete", () => {
    const forged = {
      startFen: START_FEN,
      stoppedEarly: false,
      moves: [
        { uci: "e2e4", san: "e4", fen: "x" },
        { uci: "e2e4", san: "e4", fen: "x" },
      ],
    };
    assert.deepEqual(replayPvOnto(START_FEN, forged, 2), {
      sans: ["e4"],
      complete: false,
    });
  });

  it("stops after checkmate", () => {
    const mating = {
      startFen: AFTER_F3,
      stoppedEarly: false,
      moves: [
        { uci: "e7e5", san: "e5", fen: "x" },
        { uci: "g2g4", san: "g4", fen: "x" },
        { uci: "d8h4", san: "Qh4#", fen: "x" },
        { uci: "a2a3", san: "a3", fen: "x" },
      ],
    };
    const result = replayPvOnto(AFTER_F3, mating, 4);
    assert.deepEqual(result?.sans, ["e5", "g4", "Qh4#"]);
    assert.equal(result?.complete, false);
  });

  it("works for a Black-to-move source position", () => {
    const blackPv = buildPvLine(AFTER_E4, ["e7e5", "g1f3"]);
    assert.deepEqual(replayPvOnto(AFTER_E4, blackPv, 2)?.sans, ["e5", "Nf3"]);
  });
});
