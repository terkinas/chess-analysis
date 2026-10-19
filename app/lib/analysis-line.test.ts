import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  START_LINE,
  canStepBack,
  canStepForward,
  goToPly,
  lineFromMoves,
  playMove,
  playMoves,
  type AnalysisLine,
} from "./analysis-line.ts";

const LINE: AnalysisLine = { moves: ["e4", "e5", "Nf3", "Nc6"], ply: 4 };

describe("playMove", () => {
  it("appends at the end of the line and moves the cursor onto it", () => {
    assert.deepEqual(playMove(START_LINE, "e4"), { moves: ["e4"], ply: 1 });
    assert.deepEqual(playMove(LINE, "Bb5"), {
      moves: ["e4", "e5", "Nf3", "Nc6", "Bb5"],
      ply: 5,
    });
  });

  it("truncates later moves when played from an earlier position", () => {
    const back = goToPly(LINE, 2);
    assert.deepEqual(playMove(back, "Nc3"), {
      moves: ["e4", "e5", "Nc3"],
      ply: 3,
    });
    assert.deepEqual(playMove(goToPly(LINE, 0), "d4"), {
      moves: ["d4"],
      ply: 1,
    });
  });

  it("does not modify the line it was given", () => {
    const before = { moves: [...LINE.moves], ply: LINE.ply };
    playMove(goToPly(LINE, 1), "c5");
    assert.deepEqual(LINE, before);
  });
});

describe("goToPly", () => {
  it("moves the cursor but keeps every move on the line", () => {
    const line = goToPly(LINE, 1);
    assert.equal(line.ply, 1);
    assert.deepEqual(line.moves, LINE.moves);
  });

  it("clamps to the start and the end of the line", () => {
    assert.equal(goToPly(LINE, -3).ply, 0);
    assert.equal(goToPly(LINE, 99).ply, 4);
    assert.equal(goToPly(goToPly(LINE, 0), 99).ply, 4);
  });

  it("ignores values that are not numbers", () => {
    assert.equal(goToPly(LINE, Number.NaN), LINE);
  });

  it("returns the same object when nothing changes", () => {
    assert.equal(goToPly(LINE, 4), LINE);
  });
});

describe("step availability", () => {
  it("tracks the cursor", () => {
    assert.equal(canStepBack(START_LINE), false);
    assert.equal(canStepForward(START_LINE), false);
    assert.equal(canStepBack(LINE), true);
    assert.equal(canStepForward(LINE), false);
    const middle = goToPly(LINE, 2);
    assert.equal(canStepBack(middle), true);
    assert.equal(canStepForward(middle), true);
    assert.equal(canStepBack(goToPly(LINE, 0)), false);
    assert.equal(canStepForward(goToPly(LINE, 0)), true);
  });
});

describe("lineFromMoves", () => {
  it("shows the final position and keeps every move", () => {
    const line = lineFromMoves(["d4", "d5", "c4"]);
    assert.deepEqual(line, { moves: ["d4", "d5", "c4"], ply: 3 });
    assert.equal(canStepForward(line), false);
    assert.equal(canStepBack(line), true);
  });

  it("copies the moves it is given", () => {
    const source = ["e4"];
    const line = lineFromMoves(source);
    source.push("e5");
    assert.deepEqual(line.moves, ["e4"]);
  });

  it("works with the existing navigation and truncation", () => {
    const line = lineFromMoves(["e4", "e5", "Nf3"]);
    assert.deepEqual(playMove(goToPly(line, 1), "c5"), {
      moves: ["e4", "c5"],
      ply: 2,
    });
    assert.equal(goToPly(line, 0).ply, 0);
  });
});

describe("playMoves", () => {
  it("appends several moves and puts the cursor on the last", () => {
    assert.deepEqual(playMoves(LINE, ["Bb5", "a6"]), {
      moves: ["e4", "e5", "Nf3", "Nc6", "Bb5", "a6"],
      ply: 6,
    });
  });

  it("drops moves after the cursor first, as playMove does", () => {
    assert.deepEqual(playMoves(goToPly(LINE, 2), ["Nc3", "Nf6"]), {
      moves: ["e4", "e5", "Nc3", "Nf6"],
      ply: 4,
    });
    assert.deepEqual(playMoves(goToPly(LINE, 2), ["Nc3"]), playMove(goToPly(LINE, 2), "Nc3"));
  });

  it("leaves the line alone for an empty list and never mutates its input", () => {
    assert.equal(playMoves(LINE, []), LINE);
    const before = { moves: [...LINE.moves], ply: LINE.ply };
    playMoves(goToPly(LINE, 1), ["c5"]);
    assert.deepEqual(LINE, before);
  });
});
