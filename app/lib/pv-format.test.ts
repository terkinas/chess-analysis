import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { START_LINE, goToPly, playMove } from "./analysis-line.ts";
import {
  MAX_PV_PLIES,
  activePvView,
  choosePv,
  formatPvText,
  labelPvMoves,
  pvFenAt,
  pvMatchesPosition,
  pvStartFromFen,
  stepPvIndex,
  type PvLine,
} from "./pv-format.ts";

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const BLACK_FEN = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1";
const LATE_BLACK_FEN =
  "r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 4 12";

function pvOf(startFen: string, steps: string[]): PvLine {
  return {
    startFen,
    moves: steps.map((san, i) => ({
      uci: `m${i}`,
      san,
      fen: `${startFen}#${i + 1}`,
    })),
    stoppedEarly: false,
  };
}

describe("pvStartFromFen", () => {
  it("reads the side to move and the move number", () => {
    assert.deepEqual(pvStartFromFen(START_FEN), { turn: "w", fullmove: 1 });
    assert.deepEqual(pvStartFromFen(LATE_BLACK_FEN), { turn: "b", fullmove: 12 });
  });

  it("falls back to move 1 for a missing or bad move number", () => {
    assert.deepEqual(pvStartFromFen("8/8/8/8/8/8/8/8 w - -"), {
      turn: "w",
      fullmove: 1,
    });
    assert.deepEqual(pvStartFromFen("8/8/8/8/8/8/8/8 b - - 0 0"), {
      turn: "b",
      fullmove: 1,
    });
  });

  it("returns null for an invalid turn", () => {
    assert.equal(pvStartFromFen(""), null);
    assert.equal(pvStartFromFen("8/8/8/8/8/8/8/8 x - - 0 1"), null);
  });
});

describe("labelPvMoves move numbering", () => {
  it("numbers every White move when White starts", () => {
    const entries = labelPvMoves({ turn: "w", fullmove: 1 }, [
      "e4",
      "e5",
      "Nf3",
      "Nc6",
    ]);
    assert.deepEqual(
      entries.map((e) => e.label),
      ["1.", null, "2.", null],
    );
    assert.equal(formatPvText(entries), "1. e4 e5 2. Nf3 Nc6");
  });

  it("opens with an ellipsis when Black moves first", () => {
    const entries = labelPvMoves({ turn: "b", fullmove: 1 }, [
      "e5",
      "Nf3",
      "Nc6",
      "Bb5",
    ]);
    assert.deepEqual(
      entries.map((e) => e.label),
      ["1…", "2.", null, "3."],
    );
    assert.equal(formatPvText(entries), "1… e5 2. Nf3 Nc6 3. Bb5");
  });

  it("continues from a late move number, Black first", () => {
    const entries = labelPvMoves({ turn: "b", fullmove: 12 }, [
      "Bc5",
      "c3",
      "d6",
    ]);
    assert.equal(formatPvText(entries), "12… Bc5 13. c3 d6");
    assert.deepEqual(
      entries.map((e) => [e.color, e.number]),
      [
        ["b", 12],
        ["w", 13],
        ["b", 13],
      ],
    );
  });

  it("handles a single move and an empty line", () => {
    assert.equal(
      formatPvText(labelPvMoves({ turn: "b", fullmove: 7 }, ["Qxd4"])),
      "7… Qxd4",
    );
    assert.deepEqual(labelPvMoves({ turn: "w", fullmove: 1 }, []), []);
  });
});

describe("choosePv", () => {
  it("uses the engine line when it starts with the best move", () => {
    assert.deepEqual(choosePv("e2e4", ["e2e4", "e7e5"]), ["e2e4", "e7e5"]);
  });

  it("falls back to the best move alone if the line disagrees or is empty", () => {
    assert.deepEqual(choosePv("e2e4", ["d2d4", "d7d5"]), ["e2e4"]);
    assert.deepEqual(choosePv("e2e4", []), ["e2e4"]);
  });

  it("caps the line length", () => {
    const long = Array.from({ length: 30 }, () => "e2e4");
    assert.equal(choosePv("e2e4", long).length, MAX_PV_PLIES);
  });
});

describe("stepPvIndex and pvFenAt", () => {
  it("enters the line at its first move and never steps back out of nothing", () => {
    assert.equal(stepPvIndex(null, 1, 5), 1);
    assert.equal(stepPvIndex(null, -1, 5), null);
  });

  it("clamps to the ends of the line", () => {
    assert.equal(stepPvIndex(1, -1, 5), 0);
    assert.equal(stepPvIndex(0, -1, 5), 0);
    assert.equal(stepPvIndex(5, 1, 5), 5);
    assert.equal(stepPvIndex(2, 1, 5), 3);
  });

  it("does nothing for an empty line", () => {
    assert.equal(stepPvIndex(null, 1, 0), null);
    assert.equal(stepPvIndex(0, 1, 0), null);
  });

  it("maps an index to the position after that many moves", () => {
    const pv = pvOf(BLACK_FEN, ["e5", "Nf3", "Nc6"]);
    assert.equal(pvFenAt(pv, 0), BLACK_FEN);
    assert.equal(pvFenAt(pv, 1), `${BLACK_FEN}#1`);
    assert.equal(pvFenAt(pv, 3), `${BLACK_FEN}#3`);
    assert.equal(pvFenAt(pv, 99), `${BLACK_FEN}#3`);
    assert.equal(pvFenAt(pv, -2), BLACK_FEN);
    assert.equal(pvFenAt(pv, Number.NaN), BLACK_FEN);
  });
});

describe("returning from PV navigation", () => {
  it("leaves the main line and its cursor untouched", () => {
    let line = START_LINE;
    for (const san of ["e4", "e5", "Nf3", "Nc6"]) line = playMove(line, san);
    line = goToPly(line, 2);
    const before = { moves: [...line.moves], ply: line.ply };
    const mainFen = "main-position";

    const pv = pvOf(mainFen, ["Nf3", "Nc6", "Bb5"]);
    // Browse to the end of the PV, then back out.
    let index = stepPvIndex(null, 1, pv.moves.length);
    index = stepPvIndex(index, 1, pv.moves.length);
    index = stepPvIndex(index, 1, pv.moves.length);
    assert.equal(pvFenAt(pv, index ?? 0), `${mainFen}#3`);

    // Leaving the view is just dropping it: the game shows again as it was.
    const view = activePvView({ pv, index: index ?? 0 }, pv);
    assert.ok(view);
    const afterExit = activePvView(null, pv);
    assert.equal(afterExit, null);
    assert.deepEqual(line, before);
    assert.equal(line.ply, 2);
  });

  it("only counts a view while it belongs to the PV on show", () => {
    const pv = pvOf(START_FEN, ["e4", "e5"]);
    const view = { pv, index: 1 };
    assert.equal(activePvView(view, pv), view);
    // A new evaluation (new PV object), a discarded one, or none: view is dead.
    assert.equal(activePvView(view, pvOf(START_FEN, ["e4", "e5"])), null);
    assert.equal(activePvView(view, null), null);
    assert.equal(activePvView(null, pv), null);
  });
});

describe("pvMatchesPosition", () => {
  it("is true only for the exact position the PV was computed for", () => {
    const pv = pvOf(START_FEN, ["e4", "e5"]);
    assert.equal(pvMatchesPosition(pv, START_FEN), true);
    assert.equal(pvMatchesPosition(pv, BLACK_FEN), false);
    assert.equal(pvMatchesPosition(pv, ""), false);
  });

  it("treats a PV as stale once the game has moved on", () => {
    // The game was at START_FEN when the PV was made, then a move was played.
    const pv = pvOf(START_FEN, ["e4", "e5"]);
    const current = BLACK_FEN;
    assert.equal(pvMatchesPosition(pv, current), false);
    // And a view of it is no longer active when the PV on show is gone.
    assert.equal(activePvView({ pv, index: 1 }, null), null);
  });
});
