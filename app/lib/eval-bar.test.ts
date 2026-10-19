import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { barFillShare, whiteBarShare } from "./eval-bar.ts";

describe("whiteBarShare", () => {
  it("is balanced without an evaluation or at 0.00", () => {
    assert.equal(whiteBarShare(null), 0.5);
    assert.equal(whiteBarShare({ kind: "cp", cp: 0 }), 0.5);
  });

  it("shows a tiny Black edge for -0.09", () => {
    const share = whiteBarShare({ kind: "cp", cp: -9 });
    assert.ok(share < 0.5 && share > 0.49);
  });

  it("favours the right side and grows monotonically", () => {
    const a = whiteBarShare({ kind: "cp", cp: 100 });
    const b = whiteBarShare({ kind: "cp", cp: 300 });
    assert.ok(0.5 < a && a < b);
    assert.ok(whiteBarShare({ kind: "cp", cp: -300 }) < 0.5);
  });

  it("clamps extreme scores and mates", () => {
    assert.equal(whiteBarShare({ kind: "cp", cp: 100000 }), 0.98);
    assert.equal(whiteBarShare({ kind: "cp", cp: -100000 }), 0.02);
    assert.equal(whiteBarShare({ kind: "mate", winner: "w", moves: 3 }), 0.98);
    assert.equal(whiteBarShare({ kind: "mate", winner: "b", moves: 0 }), 0.02);
  });
});

describe("barFillShare", () => {
  const ahead = { kind: "cp", cp: 300 } as const;
  const behind = { kind: "cp", cp: -300 } as const;

  it("uses the position's own score when it has one", () => {
    assert.equal(barFillShare(ahead, behind), whiteBarShare(ahead));
  });

  it("keeps the previous fill while the position has no score yet", () => {
    assert.equal(barFillShare(null, ahead), whiteBarShare(ahead));
    assert.equal(barFillShare(null, behind), whiteBarShare(behind));
  });

  it("is balanced only when there has never been a score", () => {
    assert.equal(barFillShare(null, null), 0.5);
  });
});
