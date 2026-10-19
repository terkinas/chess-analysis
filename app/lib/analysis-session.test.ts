import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  EMPTY_SESSION,
  MAIN_ID,
  activeLine,
  branchPointText,
  goToPlyInSession,
  importedSession,
  lineName,
  lineOptions,
  lineView,
  newSession,
  playMoveInSession,
  playMovesInSession,
  selectLine,
  type AnalysisSession,
} from "./analysis-session.ts";

const GAME = ["e4", "e5", "Nf3", "Nc6"];
const mainMoves = (s: AnalysisSession) => s.lines[0].moves;

describe("free play (main line not locked)", () => {
  it("records moves on the main line", () => {
    let s = EMPTY_SESSION;
    for (const san of ["e4", "e5", "Nf3"]) s = playMoveInSession(s, san);
    assert.deepEqual(mainMoves(s), ["e4", "e5", "Nf3"]);
    assert.equal(s.lines.length, 1);
    assert.deepEqual(lineView(s), { moves: ["e4", "e5", "Nf3"], ply: 3 });
  });

  it("does not truncate the main line when a different move is played earlier", () => {
    let s = newSession(GAME);
    s = goToPlyInSession(s, 2);
    s = playMoveInSession(s, "Nc3");
    assert.deepEqual(mainMoves(s), GAME);
    assert.equal(s.lines.length, 2);
    assert.deepEqual(s.lines[1], {
      id: 1,
      moves: ["e4", "e5", "Nc3"],
      branchPly: 2,
      parentId: MAIN_ID,
    });
    assert.equal(s.activeId, 1);
    assert.equal(s.ply, 3);
  });
});

describe("imported main line", () => {
  it("is locked: a move after its end starts a continuation variation", () => {
    let s = goToPlyInSession(importedSession(GAME), GAME.length);
    s = playMoveInSession(s, "Bb5");
    assert.deepEqual(mainMoves(s), GAME);
    assert.equal(s.lines.length, 2);
    assert.equal(s.lines[1].branchPly, 4);
    assert.deepEqual(lineView(s), { moves: [...GAME, "Bb5"], ply: 5 });
  });

  it("keeps the main line and starts the cursor at the first position", () => {
    const s = importedSession(GAME);
    assert.equal(s.ply, 0);
    assert.deepEqual(mainMoves(s), GAME);
    assert.equal(s.mainLocked, true);
  });

  it("branches from the very first move", () => {
    let s = goToPlyInSession(importedSession(GAME), 0);
    s = playMoveInSession(s, "d4");
    assert.equal(s.lines[1].branchPly, 0);
    assert.deepEqual(lineView(s), { moves: ["d4"], ply: 1 });
    assert.deepEqual(mainMoves(s), GAME);
  });
});

describe("playing the move a line already makes", () => {
  it("steps forward along the active line without creating anything", () => {
    let s = goToPlyInSession(importedSession(GAME), 2);
    s = playMoveInSession(s, "Nf3");
    assert.equal(s.lines.length, 1);
    assert.equal(s.ply, 3);
    assert.deepEqual(mainMoves(s), GAME);
  });

  it("switches to an existing variation instead of duplicating it", () => {
    let s = goToPlyInSession(importedSession(GAME), 2);
    s = playMoveInSession(s, "Nc3"); // Variation 1
    s = selectLine(s, MAIN_ID);
    s = goToPlyInSession(s, 2);
    s = playMoveInSession(s, "Nc3");
    assert.equal(s.lines.length, 2);
    assert.equal(s.activeId, 1);
    assert.equal(s.ply, 3);
  });

  it("returns to the main line when its move is replayed from a variation", () => {
    let s = goToPlyInSession(importedSession(GAME), 2);
    s = playMoveInSession(s, "Nc3");
    s = goToPlyInSession(s, 2);
    s = playMoveInSession(s, "Nf3");
    assert.equal(s.activeId, MAIN_ID);
    assert.equal(s.ply, 3);
    assert.equal(s.lines.length, 2);
  });
});

describe("extending and nesting variations", () => {
  it("extends the active variation at its end", () => {
    let s = goToPlyInSession(importedSession(GAME), 2);
    s = playMoveInSession(s, "Nc3");
    s = playMoveInSession(s, "Nf6");
    assert.equal(s.lines.length, 2);
    assert.deepEqual(s.lines[1].moves, ["e4", "e5", "Nc3", "Nf6"]);
    assert.deepEqual(mainMoves(s), GAME);
  });

  it("branches again from inside a variation", () => {
    let s = goToPlyInSession(importedSession(GAME), 2);
    s = playMoveInSession(s, "Nc3");
    s = playMoveInSession(s, "Nf6"); // Var 1: e4 e5 Nc3 Nf6
    s = goToPlyInSession(s, 3);
    s = playMoveInSession(s, "Bc5"); // sibling of Nf6
    assert.equal(s.lines.length, 3);
    assert.deepEqual(s.lines[1].moves, ["e4", "e5", "Nc3", "Nf6"]);
    assert.deepEqual(s.lines[2], {
      id: 2,
      moves: ["e4", "e5", "Nc3", "Bc5"],
      branchPly: 3,
      parentId: 1,
    });
  });

  it("plays several moves as one variation (engine line)", () => {
    let s = goToPlyInSession(importedSession(GAME), 2);
    s = playMovesInSession(s, ["Bc4", "Nf6", "d3"]);
    assert.equal(s.lines.length, 2);
    assert.deepEqual(s.lines[1].moves, ["e4", "e5", "Bc4", "Nf6", "d3"]);
    assert.equal(s.ply, 5);
    assert.deepEqual(mainMoves(s), GAME);
  });

  it("an engine line that matches the game just follows it", () => {
    let s = goToPlyInSession(importedSession(GAME), 2);
    s = playMovesInSession(s, ["Nf3", "Nc6"]);
    assert.equal(s.lines.length, 1);
    assert.equal(s.ply, 4);
  });

  it("an engine line that diverges part-way branches there", () => {
    let s = goToPlyInSession(importedSession(GAME), 2);
    s = playMovesInSession(s, ["Nf3", "Nf6", "Nxe5"]);
    assert.equal(s.lines.length, 2);
    assert.equal(s.lines[1].branchPly, 3);
    assert.deepEqual(s.lines[1].moves, ["e4", "e5", "Nf3", "Nf6", "Nxe5"]);
  });

  it("changes nothing for an empty list", () => {
    const s = importedSession(GAME);
    assert.equal(playMovesInSession(s, []), s);
  });
});

describe("selectLine", () => {
  const build = () => {
    let s = goToPlyInSession(importedSession(GAME), 2);
    s = playMovesInSession(s, ["Nc3", "Nf6", "d3"]); // Var 1, ply 5
    return s;
  };

  it("goes back to the main line at the first move where it differs", () => {
    const s = selectLine(build(), MAIN_ID);
    assert.equal(s.activeId, MAIN_ID);
    assert.equal(s.ply, 3); // main's own move after the shared e4 e5
    assert.deepEqual(mainMoves(s), GAME);
  });

  it("keeps the cursor on a position both lines share", () => {
    let s = goToPlyInSession(build(), 1);
    s = selectLine(s, MAIN_ID);
    assert.equal(s.ply, 1);
    s = selectLine(s, 1);
    assert.equal(s.ply, 1);
    assert.equal(s.activeId, 1);
  });

  it("lands on the variation's first own move when shown from the main line", () => {
    let s = selectLine(build(), MAIN_ID);
    s = goToPlyInSession(s, 4);
    s = selectLine(s, 1);
    assert.equal(s.ply, 3);
  });

  it("ignores an unknown or the current line", () => {
    const s = build();
    assert.equal(selectLine(s, 99), s);
    assert.equal(selectLine(s, s.activeId), s);
  });

  it("clamps the cursor to the new line's length", () => {
    let s = goToPlyInSession(importedSession(GAME), 1);
    s = playMoveInSession(s, "c5"); // Var 1 = e4 c5
    s = selectLine(s, MAIN_ID);
    s = goToPlyInSession(s, 4);
    s = selectLine(s, 1);
    assert.equal(s.ply, 2);
  });
});

describe("navigation", () => {
  it("moves the cursor along the active line only, clamped", () => {
    let s = goToPlyInSession(importedSession(GAME), 2);
    s = playMovesInSession(s, ["Nc3", "Nf6"]);
    assert.equal(goToPlyInSession(s, 99).ply, 4);
    assert.equal(goToPlyInSession(s, -3).ply, 0);
    assert.equal(goToPlyInSession(s, 4), s);
  });

  it("never mutates the session it was given", () => {
    const s = goToPlyInSession(importedSession(GAME), 2);
    const snapshot = JSON.stringify(s);
    playMoveInSession(s, "Nc3");
    playMovesInSession(s, ["Nc3", "Nf6"]);
    selectLine(s, MAIN_ID);
    assert.equal(JSON.stringify(s), snapshot);
  });
});

describe("naming", () => {
  it("names lines and describes where a variation branches", () => {
    let s = goToPlyInSession(importedSession(GAME), 3);
    s = playMoveInSession(s, "Bc5");
    assert.equal(lineName(s, MAIN_ID), "Main line");
    assert.equal(lineName(s, 1), "Variation 1");
    assert.equal(branchPointText(activeLine(s)), "after 2. Nf3");
    assert.equal(branchPointText(s.lines[0]), null);
  });

  it("describes branches after Black's move and from the start", () => {
    let s = goToPlyInSession(importedSession(GAME), 2);
    s = playMoveInSession(s, "Nc3");
    assert.equal(branchPointText(s.lines[1]), "after 1… e5");
    let t = goToPlyInSession(importedSession(GAME), 0);
    t = playMoveInSession(t, "d4");
    assert.equal(branchPointText(t.lines[1]), "from the start");
  });

  it("lists one option per line", () => {
    let s = goToPlyInSession(importedSession(GAME), 2);
    s = playMoveInSession(s, "Nc3");
    assert.deepEqual(lineOptions(s), [
      { id: 0, short: "Main", name: "Main line", branch: null },
      { id: 1, short: "Var 1", name: "Variation 1", branch: "after 1… e5" },
    ]);
  });
});
