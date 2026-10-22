import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Chess } from "chess.js";
import {
  addPremove,
  applyPremove,
  applyPremoves,
  keepPossiblePremoves,
  premoveDestinations,
  resolvePremove,
  type Premove,
} from "./premove.ts";

const after = (...sans: string[]) => {
  const game = new Chess();
  for (const san of sans) game.move(san);
  return game;
};

describe("premoveDestinations", () => {
  it("lists the squares a piece could reach on the opponent's turn", () => {
    // White has just played 1.e4: it is Black's turn, but White may premove.
    const game = after("e4");
    const to = [...premoveDestinations(game, "g1", "w").keys()].sort();
    assert.deepEqual(to, ["e2", "f3", "h3"]);
    assert.ok(premoveDestinations(game, "d2", "w").has("d4"));
  });

  it("is empty for an empty square or the other side's piece", () => {
    const game = after("e4");
    assert.equal(premoveDestinations(game, "e5", "w").size, 0);
    assert.equal(premoveDestinations(game, "e7", "w").size, 0);
  });

  it("does not change the live game", () => {
    const game = after("e4");
    const fen = game.fen();
    premoveDestinations(game, "g1", "w");
    assert.equal(game.fen(), fen);
  });

  it("never offers the opponent's king as a destination", () => {
    // White pawn on f7 attacks the king on e8 (the board a queue of premoves
    // leads to): capturing the king is not a move.
    const virtual = applyPremoves(
      new Chess(),
      [
        { from: "e2", to: "e4" },
        { from: "e4", to: "e5" },
        { from: "e5", to: "e6" },
        { from: "e6", to: "f7" },
      ],
      "w",
    );
    assert.equal(virtual.premoves.length, 4);
    const to = [...premoveDestinations(virtual.game, "f7", "w").keys()];
    assert.ok(to.includes("g8"));
    assert.ok(!to.includes("e8"));
  });
});

describe("applyPremove", () => {
  it("plays the move on a copy, leaving the opponent to move", () => {
    const game = after("e4");
    const fen = game.fen();
    const next = applyPremove(game, { from: "g1", to: "f3" }, "w");
    assert.ok(next);
    assert.equal(next.get("f3")?.type, "n");
    assert.equal(next.get("g1"), undefined);
    assert.equal(next.turn(), "b");
    assert.equal(game.fen(), fen);
  });

  it("is null for an empty square, the other side's piece, or a blocked move", () => {
    const game = after("e4");
    assert.equal(applyPremove(game, { from: "g3", to: "g4" }, "w"), null);
    assert.equal(applyPremove(game, { from: "e7", to: "e5" }, "w"), null);
    assert.equal(applyPremove(game, { from: "g1", to: "e2" }, "w"), null);
  });
});

describe("applyPremoves", () => {
  it("is the game itself for an empty queue", () => {
    const game = after("e4");
    const virtual = applyPremoves(game, [], "w");
    assert.equal(virtual.game, game);
    assert.deepEqual(virtual.premoves, []);
  });

  it("chains premoves, each on the board the earlier ones lead to", () => {
    const game = after("e4");
    const queue: Premove[] = [
      { from: "g1", to: "f3" },
      { from: "f3", to: "e5" },
    ];
    const virtual = applyPremoves(game, queue, "w");
    assert.deepEqual(virtual.premoves, [...queue]);
    assert.equal(virtual.game.get("e5")?.type, "n");
    assert.equal(virtual.game.get("e5")?.color, "w");
    assert.equal(virtual.game.get("f3"), undefined);
    assert.equal(virtual.game.get("g1"), undefined);
  });

  it("stops at the first premove that is not possible", () => {
    const game = after("e4");
    const virtual = applyPremoves(
      game,
      [
        { from: "g1", to: "f3" },
        { from: "f3", to: "e4" }, // its own pawn stands there
        { from: "b1", to: "c3" },
      ],
      "w",
    );
    assert.deepEqual(virtual.premoves, [{ from: "g1", to: "f3" }]);
  });

  it("promotes a pawn to a queen and keeps moving it", () => {
    const game = new Chess("8/P6k/8/8/8/8/8/K7 w - - 0 1");
    const virtual = applyPremoves(
      game,
      [
        { from: "a7", to: "a8" },
        { from: "a8", to: "c8" },
      ],
      "w",
    );
    assert.equal(virtual.premoves.length, 2);
    assert.equal(virtual.game.get("c8")?.type, "q");
  });

  it("allows castling and then moving the rook it brought out", () => {
    const game = new Chess("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1");
    const virtual = applyPremoves(
      game,
      [
        { from: "e1", to: "g1" },
        { from: "f1", to: "f5" },
      ],
      "w",
    );
    assert.equal(virtual.premoves.length, 2);
    assert.equal(virtual.game.get("g1")?.type, "k");
    assert.equal(virtual.game.get("f5")?.type, "r");
  });

  it("does not change the live game", () => {
    const game = after("e4");
    const fen = game.fen();
    applyPremoves(game, [{ from: "g1", to: "f3" }], "w");
    assert.equal(game.fen(), fen);
  });
});

describe("addPremove", () => {
  it("appends a premove that is possible on the board the queue leads to", () => {
    const game = after("e4");
    const queue: Premove[] = [{ from: "g1", to: "f3" }];
    const next = addPremove(game, queue, { from: "f3", to: "g5" }, "w");
    assert.deepEqual(next, [...queue, { from: "f3", to: "g5" }]);
    assert.equal(queue.length, 1);
  });

  it("rejects a premove that is only possible on the real board", () => {
    const game = after("e4");
    const queue: Premove[] = [{ from: "g1", to: "f3" }];
    // The knight has left g1 on the virtual board.
    assert.equal(addPremove(game, queue, { from: "g1", to: "h3" }, "w"), null);
    // A knight on f3 cannot reach f5.
    assert.equal(addPremove(game, queue, { from: "f3", to: "f5" }, "w"), null);
  });

  it("rejects capturing a king", () => {
    const game = new Chess();
    const queue: Premove[] = [
      { from: "e2", to: "e4" },
      { from: "e4", to: "e5" },
      { from: "e5", to: "e6" },
      { from: "e6", to: "f7" },
    ];
    assert.equal(addPremove(game, queue, { from: "f7", to: "e8" }, "w"), null);
  });
});

describe("keepPossiblePremoves", () => {
  it("keeps the whole queue when it still works after the opponent's reply", () => {
    // Black's pawn on e5 can be taken by the knight once it reaches f3.
    const game = after("e4", "e5");
    const queue: Premove[] = [
      { from: "g1", to: "f3" },
      { from: "f3", to: "e5" },
    ];
    assert.deepEqual(keepPossiblePremoves(game, queue, "w"), queue);
  });

  it("cuts the queue at the first premove the reply made impossible", () => {
    const game = after("e4", "e5");
    const queue: Premove[] = [
      { from: "g1", to: "f3" },
      { from: "e4", to: "e5" }, // blocked by the reply
      { from: "b1", to: "c3" },
    ];
    assert.deepEqual(keepPossiblePremoves(game, queue, "w"), [queue[0]]);
  });
});

describe("resolvePremove", () => {
  it("returns the SAN of a premove that is legal once it is the player's turn", () => {
    const game = after("e4", "e5");
    assert.equal(resolvePremove(game, { from: "g1", to: "f3" }), "Nf3");
  });

  it("returns null when the opponent's reply made it illegal", () => {
    // A premoved e4-e5 is blocked now that Black's pawn stands on e5.
    const game = after("e4", "e5");
    assert.equal(resolvePremove(game, { from: "e4", to: "e5" }), null);
  });

  it("promotes to a queen", () => {
    const game = new Chess("8/P6k/8/8/8/8/8/K7 w - - 0 1");
    assert.equal(resolvePremove(game, { from: "a7", to: "a8" }), "a8=Q");
  });
});
