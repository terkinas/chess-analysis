import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Chess } from "chess.js";
import {
  findLegalMoves,
  getAnalysisStatus,
  describeHistoryPosition,
  findCastlingDrop,
  getLastMove,
  getOutcome,
  getStatus,
  getStepSlides,
  replay,
  toPgn,
} from "./chess-game.ts";

const FOOLS_MATE = ["f3", "e5", "g4", "Qh4#"];
const STALEMATE = [
  "e3", "a5", "Qh5", "Ra6", "Qxa5", "h5", "h4", "Rah6", "Qxc7", "f6",
  "Qxd7+", "Kf7", "Qxb7", "Qd3", "Qxb8", "Qh7", "Qxc8", "Kg6", "Qe6",
];
const REPETITION = ["Nf3", "Nf6", "Ng1", "Ng8", "Nf3", "Nf6", "Ng1", "Ng8"];

describe("getOutcome", () => {
  it("is null for a game in progress", () => {
    assert.equal(getOutcome(replay(["e4", "e5"])), null);
    assert.equal(getStatus(replay(["e4"])).isOver, false);
  });

  it("reports checkmate with the winner", () => {
    const outcome = getOutcome(replay(FOOLS_MATE));
    assert.deepEqual(outcome, {
      kind: "checkmate",
      winner: "b",
      text: "Checkmate — Black wins",
    });
  });

  it("reports stalemate as a draw", () => {
    const outcome = getOutcome(replay(STALEMATE));
    assert.equal(outcome?.kind, "stalemate");
    assert.equal(outcome?.winner, null);
    assert.equal(outcome?.text, "Draw by stalemate");
  });

  it("reports threefold repetition as a draw", () => {
    const outcome = getOutcome(replay(REPETITION));
    assert.equal(outcome?.kind, "draw");
    assert.equal(outcome?.text, "Draw by repetition");
  });

  it("reports a flag as a loss for the side that ran out of time", () => {
    const game = replay(["e4", "e5"]);
    const outcome = getOutcome(game, "b");
    assert.deepEqual(outcome, {
      kind: "timeout",
      winner: "w",
      text: "Time out — White wins",
    });
    const status = getStatus(game, "b");
    assert.equal(status.isOver, true);
    assert.equal(status.text, "Time out — White wins");
  });

  it("a position already decided on the board wins over a late flag", () => {
    assert.equal(getOutcome(replay(FOOLS_MATE), "b")?.kind, "checkmate");
  });
});

describe("toPgn with a timeout", () => {
  const players = { white: "You", black: "Stockfish" };
  const date = new Date(2026, 9, 18);

  it("records the result and termination for a flag", () => {
    const pgn = toPgn(["e4", "e5"], date, players, "b");
    assert.match(pgn, /\[Result "1-0"\]/);
    assert.match(pgn, /\[Termination "time forfeit"\]/);
    assert.match(pgn, /1-0\s*$/);
  });

  it("leaves ordinary games unchanged", () => {
    const pgn = toPgn(FOOLS_MATE, date, players);
    assert.match(pgn, /\[Result "0-1"\]/);
    assert.doesNotMatch(pgn, /Termination/);
    const live = toPgn(["e4"], date, players);
    assert.match(live, /\[Result "\*"\]/);
  });
});

describe("getAnalysisStatus", () => {
  it("is a plain turn status for an ordinary position", () => {
    assert.deepEqual(getAnalysisStatus(replay([])), {
      turn: "w",
      isOver: false,
      text: "White to move",
      note: undefined,
    });
    assert.equal(
      getAnalysisStatus(replay(["e4", "e5", "Bc4", "Nc6", "Qh5", "Nf6"])).text,
      "White to move",
    );
    assert.equal(
      getAnalysisStatus(replay(["e4", "f5", "Qh5+"])).text,
      "Black to move — in check",
    );
  });

  it("still stops at checkmate and stalemate", () => {
    const mate = getAnalysisStatus(replay(FOOLS_MATE));
    assert.equal(mate.isOver, true);
    assert.equal(mate.text, "Checkmate — Black wins");
    const stalemate = getAnalysisStatus(replay(STALEMATE));
    assert.equal(stalemate.isOver, true);
    assert.equal(stalemate.text, "Draw by stalemate");
  });

  it("keeps going after a draw by repetition", () => {
    const game = replay(REPETITION);
    assert.equal(getStatus(game).isOver, true); // the live game would stop
    const status = getAnalysisStatus(game);
    assert.equal(status.isOver, false);
    assert.equal(status.text, "White to move");
    assert.match(status.note ?? "", /repetition/);
    // chess.js still offers legal moves, and they can be played.
    const legal = findLegalMoves(game, "e2", "e4");
    assert.equal(legal.length, 1);
    const next = replay([...REPETITION, legal[0].san]);
    assert.equal(getAnalysisStatus(next).turn, "b");
  });

  it("keeps going after the fifty-move rule", () => {
    const game = new Chess("8/8/8/4k3/8/8/4K3/7R w - - 100 80");
    assert.equal(getStatus(game).isOver, true);
    const status = getAnalysisStatus(game);
    assert.equal(status.isOver, false);
    assert.match(status.note ?? "", /fifty-move/);
    assert.ok(findLegalMoves(game, "h1", "h8").length > 0);
  });
});

describe("getLastMove", () => {
  it("is null before any move", () => {
    assert.equal(getLastMove(replay([])), null);
  });

  it("reports the from and to squares, for either side and for captures", () => {
    assert.deepEqual(getLastMove(replay(["e4"])), { from: "e2", to: "e4" });
    assert.deepEqual(getLastMove(replay(["e4", "d5"])), { from: "d7", to: "d5" });
    assert.deepEqual(getLastMove(replay(["e4", "d5", "exd5"])), {
      from: "e4",
      to: "d5",
    });
  });

  it("reports the king's squares for castling", () => {
    const castled = ["e4", "e5", "Nf3", "Nc6", "Bc4", "Bc5", "O-O"];
    assert.deepEqual(getLastMove(replay(castled)), { from: "e1", to: "g1" });
  });

  it("reports the pawn's squares for en passant", () => {
    const ep = ["e4", "a6", "e5", "d5", "exd6"];
    assert.deepEqual(getLastMove(replay(ep)), { from: "e5", to: "d6" });
  });

  it("reports the pawn's squares for a promotion", () => {
    const game = new Chess("8/P6k/8/8/8/8/8/K7 w - - 0 1");
    game.move("a8=Q");
    assert.deepEqual(getLastMove(game), { from: "a7", to: "a8" });
  });

  it("follows the position shown when browsing history", () => {
    const moves = ["e4", "e5", "Nf3"];
    assert.deepEqual(getLastMove(replay(moves.slice(0, 2))), {
      from: "e7",
      to: "e5",
    });
    assert.equal(getLastMove(replay(moves.slice(0, 0))), null);
  });
});

describe("resignation", () => {
  const players = { white: "You", black: "Stockfish" };
  const date = new Date(2026, 9, 19);

  it("makes the opponent the winner", () => {
    assert.deepEqual(getOutcome(replay(["e4", "e5"]), null, "w"), {
      kind: "resignation",
      winner: "b",
      text: "Resignation — Black wins",
    });
    assert.equal(getOutcome(replay(["e4"]), null, "b")?.winner, "w");
    const status = getStatus(replay(["e4", "e5"]), null, "w");
    assert.equal(status.isOver, true);
    assert.equal(status.text, "Resignation — Black wins");
  });

  it("does not override a result already decided on the board", () => {
    assert.equal(getOutcome(replay(FOOLS_MATE), null, "b")?.kind, "checkmate");
  });

  it("is not a result while nobody has resigned", () => {
    assert.equal(getOutcome(replay(["e4", "e5"]), null, null), null);
  });

  it("is recorded in the PGN result", () => {
    const white = toPgn(["e4", "e5"], date, players, null, "w");
    assert.match(white, /\[Result "0-1"\]/);
    assert.match(white, /0-1\s*$/);
    const black = toPgn(["e4", "e5"], date, players, null, "b");
    assert.match(black, /\[Result "1-0"\]/);
    assert.match(black, /1-0\s*$/);
    assert.doesNotMatch(white, /Termination/);
  });
});

describe("getStepSlides", () => {
  it("glides the mover from its old square forward, and back again in reverse", () => {
    const moves = ["e4", "e5", "Nf3"];
    assert.deepEqual(getStepSlides(moves, 2, 3), [{ from: "g1", to: "f3" }]);
    assert.deepEqual(getStepSlides(moves, 3, 2), [{ from: "f3", to: "g1" }]);
    assert.deepEqual(getStepSlides(moves, 0, 1), [{ from: "e2", to: "e4" }]);
    assert.deepEqual(getStepSlides(moves, 1, 0), [{ from: "e4", to: "e2" }]);
  });

  it("moves the rook as well when castling, in both directions", () => {
    const moves = ["e4", "e5", "Nf3", "Nc6", "Bc4", "Bc5", "O-O"];
    assert.deepEqual(getStepSlides(moves, 6, 7), [
      { from: "e1", to: "g1" },
      { from: "h1", to: "f1" },
    ]);
    assert.deepEqual(getStepSlides(moves, 7, 6), [
      { from: "g1", to: "e1" },
      { from: "f1", to: "h1" },
    ]);
  });

  it("glides only the capturing pawn for captures and en passant", () => {
    const capture = ["e4", "d5", "exd5"];
    assert.deepEqual(getStepSlides(capture, 2, 3), [{ from: "e4", to: "d5" }]);
    assert.deepEqual(getStepSlides(capture, 3, 2), [{ from: "d5", to: "e4" }]);
    const enPassant = ["e4", "a6", "e5", "d5", "exd6"];
    assert.deepEqual(getStepSlides(enPassant, 4, 5), [{ from: "e5", to: "d6" }]);
    assert.deepEqual(getStepSlides(enPassant, 5, 4), [{ from: "d6", to: "e5" }]);
  });

  it("handles promotion by the pawn's own squares", () => {
    const moves = ["a4", "b5", "axb5", "a6", "bxa6", "Nf6", "a7", "Ng4", "axb8=Q"];
    assert.deepEqual(getStepSlides(moves, 8, 9), [{ from: "a7", to: "b8" }]);
    assert.deepEqual(getStepSlides(moves, 9, 8), [{ from: "b8", to: "a7" }]);
  });

  it("does not animate jumps, no-ops or out-of-range steps", () => {
    const moves = ["e4", "e5", "Nf3"];
    assert.deepEqual(getStepSlides(moves, 0, 3), []);
    assert.deepEqual(getStepSlides(moves, 3, 0), []);
    assert.deepEqual(getStepSlides(moves, 2, 2), []);
    assert.deepEqual(getStepSlides(moves, 3, 4), []);
    assert.deepEqual(getStepSlides(moves, -1, 0), []);
    assert.deepEqual(getStepSlides([], 0, 1), []);
  });
});

describe("describeHistoryPosition", () => {
  it("names the starting position and counts full moves", () => {
    assert.equal(describeHistoryPosition(0, 24), "Viewing the starting position");
    assert.equal(describeHistoryPosition(1, 24), "Viewing move 1 of 12");
    assert.equal(describeHistoryPosition(13, 24), "Viewing move 7 of 12");
    assert.equal(describeHistoryPosition(23, 25), "Viewing move 12 of 13");
  });
});

describe("findCastlingDrop", () => {
  const sans = (fen: string, from: string, to: string) =>
    findCastlingDrop(new Chess(fen), from as never, to as never).map((m) => m.san);
  // Both sides may castle either way.
  const OPEN_W = "r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1";
  const OPEN_B = "r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R b KQkq - 0 1";

  it("reads a drop on the own corner rook as castling, for both colours", () => {
    assert.deepEqual(sans(OPEN_W, "e1", "h1"), ["O-O"]);
    assert.deepEqual(sans(OPEN_W, "e1", "a1"), ["O-O-O"]);
    assert.deepEqual(sans(OPEN_B, "e8", "h8"), ["O-O"]);
    assert.deepEqual(sans(OPEN_B, "e8", "a8"), ["O-O-O"]);
  });

  it("reads a drop more than two squares along the rank as castling", () => {
    // Only queenside has a third square (b) that is not the rook's own.
    assert.deepEqual(sans(OPEN_W, "e1", "b1"), ["O-O-O"]);
    assert.deepEqual(sans(OPEN_B, "e8", "b8"), ["O-O-O"]);
  });

  it("leaves a two-square drop to the ordinary legal-move path", () => {
    assert.deepEqual(sans(OPEN_W, "e1", "g1"), []);
    assert.deepEqual(sans(OPEN_W, "e1", "c1"), []);
  });

  it("returns nothing when castling is not legal", () => {
    // Start position: pieces in the way.
    const start = new Chess().fen();
    assert.deepEqual(sans(start, "e1", "h1"), []);
    assert.deepEqual(sans(start, "e1", "a1"), []);
    // Rights gone (king has moved and come back).
    assert.deepEqual(sans("r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w kq - 0 1", "e1", "h1"), []);
    assert.deepEqual(sans("r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w Kk - 0 1", "e1", "a1"), []);
    // King in check (rook on e-file).
    assert.deepEqual(sans("4r1k1/8/8/8/8/8/8/R3K2R w KQ - 0 1", "e1", "h1"), []);
    // King would pass through an attacked square (f1 attacked by the rook on f8).
    assert.deepEqual(sans("5rk1/8/8/8/8/8/8/R3K2R w KQ - 0 1", "e1", "h1"), []);
    // Queenside: d1 attacked, so castling that way is illegal; kingside still is.
    assert.deepEqual(sans("3r2k1/8/8/8/8/8/8/R3K2R w KQ - 0 1", "e1", "a1"), []);
    assert.deepEqual(sans("3r2k1/8/8/8/8/8/8/R3K2R w KQ - 0 1", "e1", "h1"), ["O-O"]);
    // Only b1 attacked: queenside castling is still legal (the rook may pass it).
    assert.deepEqual(sans("1r4k1/8/8/8/8/8/8/R3K2R w KQ - 0 1", "e1", "a1"), ["O-O-O"]);
  });

  it("ignores everything that is not the side to move's king on its rank", () => {
    assert.deepEqual(sans(OPEN_W, "a1", "d1"), []); // a rook
    assert.deepEqual(sans(OPEN_W, "e1", "e4"), []); // vertical
    assert.deepEqual(sans(OPEN_W, "e1", "e1"), []);
    assert.deepEqual(sans(OPEN_B, "e1", "h1"), []); // White's king, Black to move
    assert.deepEqual(sans(OPEN_W, "e1", "h8"), []); // other rank, enemy rook
  });

  it("does not take an own non-corner rook or an enemy piece for a castling target", () => {
    assert.deepEqual(sans("4k3/8/8/8/8/8/8/R3KR2 w Q - 0 1", "e1", "f1"), []);
    assert.deepEqual(sans("4k3/8/8/8/8/8/8/R3K1r1 w Q - 0 1", "e1", "g1"), []);
  });

  it("is the same move the board's own castling produces", () => {
    const game = new Chess(OPEN_W);
    const [move] = findCastlingDrop(game, "e1", "h1");
    game.move(move.san);
    assert.equal(game.get("g1")?.type, "k");
    assert.equal(game.get("f1")?.type, "r");
  });
});
