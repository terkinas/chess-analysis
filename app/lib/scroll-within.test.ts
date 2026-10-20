import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { scrollDeltaToReveal } from "./scroll-within.ts";

describe("scrollDeltaToReveal", () => {
  it("does nothing when the child is already visible", () => {
    assert.equal(scrollDeltaToReveal(100, 300, 150, 170), 0);
    assert.equal(scrollDeltaToReveal(100, 300, 100, 300), 0);
  });

  it("scrolls down just far enough for a child below the edge", () => {
    assert.equal(scrollDeltaToReveal(100, 300, 290, 320), 20);
  });

  it("scrolls up just far enough for a child above the edge", () => {
    assert.equal(scrollDeltaToReveal(100, 300, 80, 100), -20);
  });

  it("handles a list that is itself below the fold of the page", () => {
    // Container at y 900..1100 on a short screen: only relative position counts.
    assert.equal(scrollDeltaToReveal(900, 1100, 1090, 1120), 20);
  });
});
