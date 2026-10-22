import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildMoveExplanation, describeScore, describeStanding } from "./move-explanation.ts";
import type { MoveContext } from "./move-context.ts";
import type { MoveClassification } from "./move-classification.ts";
import type { PositionEvaluation } from "./use-position-analysis.ts";

const context: MoveContext = {
  ply: 3,
  san: "Qh5",
  mover: "w",
  beforeFen: "before",
  afterFen: "after",
  key: "k",
};

const pv = (startFen: string, sans: string[]) => ({
  startFen,
  moves: sans.map((san) => ({ uci: san, san, fen: `${startFen}>${san}` })),
  stoppedEarly: false,
});

const evaluation = (
  cp: number,
  best: string,
  sans: string[],
  startFen: string,
): PositionEvaluation => ({
  score: { kind: "cp", cp },
  depth: 8,
  bestMoveSan: best,
  bestMoveUci: best,
  pv: pv(startFen, sans),
});

const cls = (
  quality: "brilliant" | "great" | "best" | "good" | "inaccuracy" | "mistake" | "blunder",
  centipawnLoss: number | null,
  reason: "centipawn-loss" | "mate-allowed" = "centipawn-loss",
): MoveClassification => ({ status: "classified", quality, centipawnLoss, reason });

describe("score wording", () => {
  it("shows scores from the mover's side", () => {
    assert.equal(describeScore({ kind: "cp", cp: 40 }, "w"), "+0.4");
    assert.equal(describeScore({ kind: "cp", cp: 40 }, "b"), "-0.4");
    assert.equal(describeScore({ kind: "mate", winner: "b", moves: 3 }, "w"), "getting mated in 3");
    assert.equal(describeScore({ kind: "cp", cp: 2 }, "w"), "0.0");
  });
  it("puts the standing in words", () => {
    assert.equal(describeStanding({ kind: "cp", cp: 10 }, "w"), "about equal");
    assert.equal(describeStanding({ kind: "cp", cp: 400 }, "b"), "close to lost");
  });
});

describe("buildMoveExplanation", () => {
  it("gives nothing for an unclassified move", () => {
    assert.equal(
      buildMoveExplanation({
        context,
        classification: null,
        before: null,
        after: null,
      }),
      null,
    );
  });

  it("explains a blunder with the better move, the swing and both lines", () => {
    const before = evaluation(40, "Nf3", ["Nf3", "Nc6"], "before");
    const after = evaluation(-300, "Nxe5", ["Nxe5", "Qe7"], "after");
    const result = buildMoveExplanation({
      context,
      classification: cls("blunder", 340),
      before,
      after,
    });
    assert.ok(result);
    assert.match(result.headline, /blunder.*3\.4 pawns/);
    const text = result.points.join(" ");
    assert.match(text, /from \+0\.4 to -3\.0/);
    assert.match(text, /Nf3 was better/);
    assert.match(text, /Black's best reply is Nxe5/);
    assert.equal(result.lines.best?.pv, before.pv);
    assert.equal(result.lines.next?.pv, after.pv);
  });

  it("explains a mate that was allowed", () => {
    const result = buildMoveExplanation({
      context,
      classification: cls("blunder", null, "mate-allowed"),
      before: evaluation(40, "Nf3", ["Nf3"], "before"),
      after: { ...evaluation(0, "Qxh2", ["Qxh2"], "after"), score: { kind: "mate", winner: "b", moves: 2 } },
    });
    assert.ok(result);
    assert.match(result.points.join(" "), /allows a forced mate/);
    assert.match(result.points.join(" "), /getting mated in 2/);
  });

  it("offers only the engine's own line when the move was the engine's choice", () => {
    const before = evaluation(150, "Qh5", ["Qh5", "g6"], "before");
    const result = buildMoveExplanation({
      context,
      classification: cls("brilliant", 0),
      before,
      after: evaluation(-150, "g6", ["g6"], "after"),
    });
    assert.ok(result);
    assert.match(result.headline, /brilliant/);
    assert.match(result.points.join(" "), /\+1\.5/);
    assert.equal(result.lines.best?.label, "Show the engine's line");
    assert.equal(result.lines.next, null);
  });

  it("says what the alternatives were for a great move", () => {
    const before = {
      ...evaluation(150, "Qh5", ["Qh5"], "before"),
      secondScore: { kind: "cp", cp: -50 } as const,
    };
    const result = buildMoveExplanation({
      context,
      classification: cls("great", 0),
      before,
      after: null,
    });
    assert.ok(result);
    assert.match(result.points.join(" "), /next-best move would leave White at -0\.5/);
  });
});
