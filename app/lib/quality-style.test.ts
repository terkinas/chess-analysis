import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  NOTABLE_ORDER,
  QUALITY_MARK,
  isNotable,
  markFor,
} from "./quality-style.ts";

describe("quality style", () => {
  it("marks only the noteworthy qualities", () => {
    assert.equal(markFor("best"), null);
    assert.equal(markFor("excellent"), null);
    assert.equal(markFor("good"), null);
    assert.equal(markFor(null), null);
    assert.equal(markFor(undefined), null);
    assert.equal(markFor("blunder")?.glyph, "??");
    assert.equal(markFor("brilliant")?.glyph, "!!");
  });

  it("gives every noteworthy quality its own glyph and colour", () => {
    const glyphs = NOTABLE_ORDER.map((q) => QUALITY_MARK[q].glyph);
    const fills = NOTABLE_ORDER.map((q) => QUALITY_MARK[q].fill);
    assert.equal(new Set(glyphs).size, NOTABLE_ORDER.length);
    assert.equal(new Set(fills).size, NOTABLE_ORDER.length);
  });

  it("draws arrows only for the bad moves", () => {
    assert.deepEqual(
      NOTABLE_ORDER.filter((q) => QUALITY_MARK[q].arrow),
      ["inaccuracy", "mistake", "blunder"],
    );
  });

  it("narrows with isNotable", () => {
    assert.equal(isNotable("mistake"), true);
    assert.equal(isNotable("good"), false);
  });
});
