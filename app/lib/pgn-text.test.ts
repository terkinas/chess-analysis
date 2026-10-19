import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  hasVariations,
  looksLikeMultipleGames,
  normalizePgn,
} from "./pgn-text.ts";

describe("normalizePgn", () => {
  it("trims, drops a BOM and unifies line endings", () => {
    assert.equal(
      normalizePgn('\uFEFF  [Event "x"]\r\n\r\n1. e4 e5 *\r\n\n'),
      '[Event "x"]\n\n1. e4 e5 *',
    );
    assert.equal(normalizePgn("1. e4\re5"), "1. e4\ne5");
    assert.equal(normalizePgn("   \n  "), "");
  });
});

describe("looksLikeMultipleGames", () => {
  it("is false for a single game, with or without headers", () => {
    assert.equal(looksLikeMultipleGames('[Event "A"]\n\n1. e4 *'), false);
    assert.equal(looksLikeMultipleGames("1. e4 e5 *"), false);
  });

  it("is true when a second [Event] tag starts another game", () => {
    const two = '[Event "A"]\n\n1. e4 1-0\n\n[Event "B"]\n\n1. d4 0-1';
    assert.equal(looksLikeMultipleGames(two), true);
  });
});

describe("hasVariations", () => {
  it("detects a variation in the movetext", () => {
    assert.equal(hasVariations("1. e4 e5 (1... c5 2. Nf3) 2. Nf3 *"), true);
    assert.equal(hasVariations("1. e4 (1. d4 d5) 1... e5 *"), true);
  });

  it("ignores parentheses in headers and comments", () => {
    assert.equal(
      hasVariations('[White "Smith (GM)"]\n[Event "A; B"]\n\n1. e4 e5 *'),
      false,
    );
    assert.equal(hasVariations("1. e4 {a (note)} e5 ; also (this)\n2. Nf3 *"), false);
  });

  it("is false for a plain game", () => {
    assert.equal(hasVariations("1. e4 e5 2. Nf3 Nc6 1-0"), false);
  });
});
