import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CLASSIFICATION_THRESHOLDS,
  classifyMove,
  classifyWinLoss,
  scoreForPlayer,
  type MoveClassification,
  type MoveQuality,
} from "./move-classification.ts";
import type { WhiteScore } from "./uci-info.ts";
import { winPercent } from "./win-percent.ts";

const cp = (value: number): WhiteScore => ({ kind: "cp", cp: value });
const mate = (winner: "w" | "b", moves: number): WhiteScore => ({
  kind: "mate",
  winner,
  moves,
});

function quality(result: MoveClassification): MoveQuality {
  assert.equal(result.status, "classified");
  return result.status === "classified" ? result.quality : "best";
}

describe("scoreForPlayer", () => {
  it("keeps centipawns for White and flips them for Black", () => {
    assert.deepEqual(scoreForPlayer(cp(120), "w"), { kind: "cp", cp: 120 });
    assert.deepEqual(scoreForPlayer(cp(120), "b"), { kind: "cp", cp: -120 });
    assert.deepEqual(scoreForPlayer(cp(-80), "b"), { kind: "cp", cp: 80 });
  });

  it("never returns a negative zero", () => {
    assert.ok(Object.is(scoreForPlayer(cp(0), "b").kind === "cp" && (scoreForPlayer(cp(0), "b") as { cp: number }).cp, 0));
  });

  it("marks a mate as winning only for the side that delivers it", () => {
    assert.deepEqual(scoreForPlayer(mate("w", 3), "w"), { kind: "mate", winning: true, moves: 3 });
    assert.deepEqual(scoreForPlayer(mate("w", 3), "b"), { kind: "mate", winning: false, moves: 3 });
    assert.deepEqual(scoreForPlayer(mate("b", 2), "b"), { kind: "mate", winning: true, moves: 2 });
  });
});

describe("classifyWinLoss thresholds (win-chance points lost)", () => {
  const cases: [number, MoveQuality][] = [
    [0, "best"], [1, "best"],
    [1.01, "excellent"], [2.5, "excellent"],
    [2.51, "good"], [5, "good"],
    [5.01, "inaccuracy"], [10, "inaccuracy"],
    [10.01, "mistake"], [20, "mistake"],
    [20.01, "blunder"], [100, "blunder"],
  ];
  for (const [loss, expected] of cases) {
    it(`${loss} points lost is ${expected}`, () => {
      assert.equal(classifyWinLoss(loss), expected);
    });
  }

  it("uses the shared bands, and accepts others", () => {
    assert.equal(CLASSIFICATION_THRESHOLDS.length, 5);
    assert.equal(
      classifyWinLoss(3, [{ quality: "best", maxLoss: 4 }]),
      "best",
    );
    assert.equal(
      classifyWinLoss(4.5, [{ quality: "best", maxLoss: 4 }]),
      "blunder",
    );
  });
});

describe("classifyMove: win-chance bands", () => {
  const qualityOfLoss = (lost: number, from = 0) =>
    quality(classifyMove({ before: cp(from), after: cp(from - lost), mover: "w" }));

  it("matches roughly 11 / 27 / 55 / 110 / 230 centipawns in an equal position", () => {
    const cases: [number, MoveQuality][] = [
      [10, "best"], [12, "excellent"],
      [26, "excellent"], [28, "good"],
      [54, "good"], [57, "inaccuracy"],
      [108, "inaccuracy"], [113, "mistake"],
      [228, "mistake"], [234, "blunder"],
    ];
    for (const [lost, expected] of cases) {
      assert.equal(qualityOfLoss(lost), expected, `${lost} cp lost`);
    }
  });

  it("forgives a big centipawn drop inside a decided position", () => {
    // +12.3 -> +8.4: win chance 99% -> 96%. Not a blunder.
    const winning = classifyMove({ before: cp(1230), after: cp(840), mover: "w" });
    assert.equal(quality(winning), "good");
    // -7.5 -> -8.6 for White: 6% -> 4%. Not a mistake.
    const lost = classifyMove({ before: cp(-750), after: cp(-860), mover: "w" });
    assert.equal(quality(lost), "excellent");
    // The same 390 cp costs far more from an equal position.
    assert.equal(qualityOfLoss(390), "blunder");
  });

  it("is symmetric for Black", () => {
    assert.equal(
      quality(classifyMove({ before: cp(-1230), after: cp(-840), mover: "b" })),
      "good",
    );
  });

  it("reports the win-chance loss and the centipawn loss", () => {
    const result = classifyMove({ before: cp(50), after: cp(10), mover: "w" });
    assert.deepEqual(result, {
      status: "classified",
      quality: "good",
      centipawnLoss: 40,
      winLoss: winPercent(50) - winPercent(10),
      reason: "centipawn-loss",
    });
  });
});

describe("classifyMove: White moves", () => {
  it("measures the loss from White's scores", () => {
    const result = classifyMove({ before: cp(50), after: cp(10), mover: "w" });
    assert.equal(result.status === "classified" && result.quality, "good");
    assert.equal(result.status === "classified" && result.centipawnLoss, 40);
  });

  it("calls a score that rises a best move with no loss", () => {
    const result = classifyMove({ before: cp(0), after: cp(80), mover: "w" });
    assert.equal(quality(result), "best");
    assert.equal(result.status === "classified" && result.centipawnLoss, 0);
    assert.equal(result.status === "classified" && result.winLoss, 0);
  });

  it("calls a big drop a blunder", () => {
    assert.equal(quality(classifyMove({ before: cp(150), after: cp(-100), mover: "w" })), "blunder");
  });
});

describe("classifyMove: Black moves and sign conversion", () => {
  it("treats a falling White score as an improvement for Black", () => {
    const result = classifyMove({ before: cp(0), after: cp(-150), mover: "b" });
    assert.equal(quality(result), "best");
    assert.equal(result.status === "classified" && result.centipawnLoss, 0);
  });

  it("treats a rising White score as a loss for Black", () => {
    const result = classifyMove({ before: cp(-20), after: cp(130), mover: "b" });
    assert.equal(result.status === "classified" && result.centipawnLoss, 150);
    assert.equal(quality(result), "mistake");
  });

  it("judges the same score change oppositely for each side", () => {
    const input = { before: cp(0), after: cp(300) };
    assert.equal(quality(classifyMove({ ...input, mover: "w" })), "best");
    assert.equal(quality(classifyMove({ ...input, mover: "b" })), "blunder");
  });

  it("matches the mirrored White case exactly", () => {
    const white = classifyMove({ before: cp(70), after: cp(15), mover: "w" });
    const black = classifyMove({ before: cp(-70), after: cp(-15), mover: "b" });
    assert.deepEqual(white, black);
  });
});

describe("classifyMove: mate scores", () => {
  it("treats delivering checkmate as best, for either colour", () => {
    assert.equal(quality(classifyMove({ before: mate("w", 1), after: mate("w", 0), mover: "w" })), "best");
    assert.equal(quality(classifyMove({ before: mate("b", 1), after: mate("b", 0), mover: "b" })), "best");
  });

  it("does not penalize keeping a forced mate, even a slower one", () => {
    const result = classifyMove({ before: mate("w", 2), after: mate("w", 5), mover: "w" });
    assert.deepEqual(result, {
      status: "classified",
      quality: "best",
      centipawnLoss: null,
      winLoss: null,
      reason: "mate-delivered",
    });
  });

  it("treats finding a mate from a centipawn position as best", () => {
    assert.equal(quality(classifyMove({ before: cp(300), after: mate("b", 3), mover: "b" })), "best");
  });

  it("treats losing a forced mate as a blunder", () => {
    const toCp = classifyMove({ before: mate("w", 2), after: cp(900), mover: "w" });
    assert.equal(quality(toCp), "blunder");
    assert.equal(toCp.status === "classified" && toCp.reason, "mate-lost");
    assert.equal(quality(classifyMove({ before: mate("b", 2), after: cp(-900), mover: "b" })), "blunder");
    assert.equal(quality(classifyMove({ before: mate("w", 2), after: mate("b", 4), mover: "w" })), "blunder");
  });

  it("treats allowing a mate against the mover as a blunder", () => {
    const result = classifyMove({ before: cp(0), after: mate("b", 2), mover: "w" });
    assert.equal(quality(result), "blunder");
    assert.equal(result.status === "classified" && result.reason, "mate-allowed");
  });

  it("does not turn a mate into centipawns", () => {
    const result = classifyMove({ before: mate("w", 2), after: mate("w", 1), mover: "w" });
    assert.equal(result.status === "classified" && result.centipawnLoss, null);
    assert.equal(result.status === "classified" && result.winLoss, null);
  });

  it("handles a position that was already lost to mate", () => {
    const same = classifyMove({ before: mate("b", 3), after: mate("b", 3), mover: "w" });
    assert.equal(quality(same), "best");
    const hastened = classifyMove({ before: mate("b", 3), after: mate("b", 1), mover: "w" });
    assert.equal(quality(hastened), "inaccuracy");
    assert.equal(quality(classifyMove({ before: mate("b", 3), after: cp(-500), mover: "w" })), "best");
  });

  it("rejects mate scores that cannot happen around a move", () => {
    // The position before a move cannot already be checkmate.
    assert.equal(classifyMove({ before: mate("w", 0), after: cp(0), mover: "w" }).status, "unavailable");
    // A move cannot checkmate its own side.
    assert.equal(classifyMove({ before: cp(0), after: mate("b", 0), mover: "w" }).status, "unavailable");
  });
});

describe("classifyMove: missing and invalid evaluations", () => {
  it("is unavailable, never zero, when a score is missing", () => {
    for (const [before, after] of [[null, cp(0)], [cp(0), null], [undefined, undefined], [null, null]] as const) {
      assert.deepEqual(classifyMove({ before, after, mover: "w" }), {
        status: "unavailable",
        reason: "missing-evaluation",
      });
    }
  });

  it("is unavailable for malformed scores", () => {
    const invalid: WhiteScore[] = [
      { kind: "cp", cp: NaN },
      { kind: "cp", cp: Infinity },
      { kind: "mate", winner: "w", moves: -1 },
      { kind: "mate", winner: "w", moves: 1.5 },
      { kind: "mate", winner: "x" as "w", moves: 2 },
      { kind: "other" } as unknown as WhiteScore,
    ];
    for (const bad of invalid) {
      assert.deepEqual(classifyMove({ before: bad, after: cp(0), mover: "w" }), {
        status: "unavailable",
        reason: "invalid-evaluation",
      });
      assert.equal(classifyMove({ before: cp(0), after: bad, mover: "b" }).status, "unavailable");
    }
  });

  it("is unavailable for an invalid mover", () => {
    assert.equal(
      classifyMove({ before: cp(0), after: cp(0), mover: "x" as "w" }).status,
      "unavailable",
    );
  });
});

describe("great and brilliant moves", () => {
  it("is great when the best move is far ahead of the second-best", () => {
    // White keeps +1.00; the alternative only reaches -1.50: a 23-point win-chance gap.
    const result = classifyMove({
      before: cp(100),
      after: cp(100),
      mover: "w",
      secondBest: cp(-150),
    });
    assert.equal(quality(result), "great");
  });

  it("is only best when the alternative is close", () => {
    const result = classifyMove({
      before: cp(100),
      after: cp(100),
      mover: "w",
      secondBest: cp(0),
    });
    assert.equal(quality(result), "best");
  });

  it("needs a gap of about 15 win-chance points, not a fixed centipawn gap", () => {
    // 200 cp apart in an equal position is 18 points: great.
    const equal = classifyMove({ before: cp(50), after: cp(50), mover: "w", secondBest: cp(-150) });
    assert.equal(quality(equal), "great");
    // 380 cp apart (+11.5 against +7.7) is under 3 points: just best.
    const decided = classifyMove({ before: cp(1150), after: cp(1150), mover: "w", secondBest: cp(770) });
    assert.equal(quality(decided), "best");
    // 200 cp apart at +8.0 is under 5 points: just best.
    const ahead = classifyMove({ before: cp(800), after: cp(800), mover: "w", secondBest: cp(600) });
    assert.equal(quality(ahead), "best");
  });

  it("counts an alternative that allows mate as a large gap", () => {
    const result = classifyMove({ before: cp(0), after: cp(0), mover: "w", secondBest: mate("b", 3) });
    assert.equal(quality(result), "great");
  });

  it("measures the gap for Black from Black's side", () => {
    // Black is at +1.00; the alternative leaves White ahead by 1.50.
    const result = classifyMove({
      before: cp(-100),
      after: cp(-100),
      mover: "b",
      secondBest: cp(150),
    });
    assert.equal(quality(result), "great");
  });

  it("is brilliant for a sacrifice that stays good for the mover", () => {
    const result = classifyMove({
      before: cp(100),
      after: cp(90),
      mover: "w",
      sacrificed: true,
    });
    assert.equal(quality(result), "brilliant");
  });

  it("is not brilliant when the mover was already clearly winning", () => {
    // +4.0 is about an 81% win chance: sacrificing from there is not brave.
    const result = classifyMove({
      before: cp(400),
      after: cp(390),
      mover: "w",
      sacrificed: true,
    });
    assert.equal(quality(result), "best");
    // Just under the limit (+2.9) still counts.
    const fine = classifyMove({
      before: cp(290),
      after: cp(280),
      mover: "w",
      sacrificed: true,
    });
    assert.equal(quality(fine), "brilliant");
  });

  it("judges the 'already winning' limit from Black's side too", () => {
    const winning = classifyMove({ before: cp(-400), after: cp(-390), mover: "b", sacrificed: true });
    assert.equal(quality(winning), "best");
    const fine = classifyMove({ before: cp(-100), after: cp(-90), mover: "b", sacrificed: true });
    assert.equal(quality(fine), "brilliant");
  });

  it("is not brilliant when the mover is no longer better after the sacrifice", () => {
    const result = classifyMove({
      before: cp(-50),
      after: cp(-55),
      mover: "w",
      sacrificed: true,
    });
    assert.equal(quality(result), "best");
  });

  it("never changes a move that is not the best", () => {
    const result = classifyMove({
      before: cp(100),
      after: cp(50),
      mover: "w",
      sacrificed: true,
      secondBest: cp(-500),
    });
    assert.equal(quality(result), "good");
  });
});
