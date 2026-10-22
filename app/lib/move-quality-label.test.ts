import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { MoveClassification } from "./move-classification.ts";
import {
  moveQualityLabel,
  type MoveClassificationStatus,
} from "./move-quality-label.ts";

const done = (
  contextKey: string,
  classification: MoveClassification,
): MoveClassificationStatus => ({ phase: "done", contextKey, classification });

const loss = (quality: "best" | "excellent" | "good" | "inaccuracy" | "mistake" | "blunder", cp: number): MoveClassification => ({
  status: "classified",
  quality,
  centipawnLoss: cp,
  winLoss: cp / 20,
  reason: "centipawn-loss",
});

describe("moveQualityLabel", () => {
  it("shows nothing without a selected move or while idle", () => {
    assert.equal(moveQualityLabel({ phase: "idle" }, "A"), null);
    assert.equal(moveQualityLabel({ phase: "thinking" }, null), null);
  });

  it("names each category", () => {
    const expected = [
      ["best", "Best", "best"],
      ["excellent", "Excellent", "best"],
      ["good", "Good", "good"],
      ["inaccuracy", "Inaccuracy", "inaccuracy"],
      ["mistake", "Mistake", "mistake"],
      ["blunder", "Blunder", "blunder"],
    ] as const;
    for (const [quality, text, tone] of expected) {
      const label = moveQualityLabel(done("A", loss(quality, 40)), "A");
      assert.equal(label?.text, text);
      assert.equal(label?.tone, tone);
      assert.equal(label?.pending, false);
    }
  });

  it("describes the loss in pawns", () => {
    assert.match(moveQualityLabel(done("A", loss("good", 73)), "A")!.description, /0\.73 pawns lost/);
    assert.match(moveQualityLabel(done("A", loss("good", 80)), "A")!.description, /0\.80 pawns lost \(4\.0% win chance\)/);
    assert.match(moveQualityLabel(done("A", loss("best", 0)), "A")!.description, /no evaluation lost/);
  });

  it("explains mate-based results without a centipawn figure", () => {
    const label = moveQualityLabel(
      done("A", { status: "classified", quality: "blunder", centipawnLoss: null, winLoss: null, reason: "mate-lost" }),
      "A",
    );
    assert.equal(label?.text, "Blunder");
    assert.match(label!.description, /forced mate/);
  });

  it("shows a loading label while evaluations are fetched", () => {
    const label = moveQualityLabel({ phase: "thinking" }, "A");
    assert.equal(label?.pending, true);
    assert.equal(label?.tone, "pending");
  });

  it("never shows another move's result: it stays pending", () => {
    const stale = done("A", loss("blunder", 500));
    const label = moveQualityLabel(stale, "B");
    assert.equal(label?.pending, true);
    assert.notEqual(label?.text, "Blunder");
    const staleError: MoveClassificationStatus = { phase: "error", contextKey: "A", message: "x" };
    assert.equal(moveQualityLabel(staleError, "B")?.pending, true);
  });

  it("reports unavailable results and engine errors clearly", () => {
    const unavailable = moveQualityLabel(
      done("A", { status: "unavailable", reason: "missing-evaluation" }),
      "A",
    );
    assert.equal(unavailable?.text, "Unavailable");
    assert.equal(unavailable?.pending, false);
    const error = moveQualityLabel({ phase: "error", contextKey: "A", message: "Engine did not respond" }, "A");
    assert.equal(error?.text, "Unavailable");
    assert.match(error!.description, /Engine did not respond/);
  });
});
