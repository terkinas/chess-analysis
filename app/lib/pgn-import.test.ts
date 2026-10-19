import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parsePgn } from "./pgn-import.ts";

const GAME = `[Event "Casual game"]
[White "Smith (GM)"]
[Black "Jones"]
[Result "1-0"]

1. e4 {King's pawn} e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 1-0
`;

describe("parsePgn", () => {
  it("loads the main line and reads the headers", () => {
    const result = parsePgn(GAME);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(result.moves, [
      "e4", "e5", "Nf3", "Nc6", "Bb5", "a6", "Ba4", "Nf6",
    ]);
    assert.equal(result.white, "Smith (GM)");
    assert.equal(result.black, "Jones");
    assert.equal(result.result, "1-0");
    assert.equal(result.variationsIgnored, false);
  });

  it("accepts movetext without headers and Windows line endings", () => {
    const result = parsePgn("1. d4 d5\r\n2. c4 *\r\n");
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.deepEqual(result.moves, ["d4", "d5", "c4"]);
      assert.equal(result.white, null);
      assert.equal(result.result, null);
    }
  });

  it("keeps only the main line and says variations were ignored", () => {
    const result = parsePgn("1. e4 e5 (1... c5 2. Nf3) 2. Nf3 Nc6 *");
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.deepEqual(result.moves, ["e4", "e5", "Nf3", "Nc6"]);
      assert.equal(result.variationsIgnored, true);
    }
  });

  it("rejects empty input", () => {
    const result = parsePgn("  \n ");
    assert.deepEqual(result, { ok: false, error: "Paste a PGN to import." });
  });

  it("rejects an illegal move with a clear error", () => {
    const result = parsePgn("1. e4 e5 2. Ke4 *");
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, /Couldn't read this PGN/);
  });

  it("rejects text that is not a PGN", () => {
    assert.equal(parsePgn("hello world").ok, false);
  });

  it("rejects a PGN with headers but no moves", () => {
    const result = parsePgn('[Event "Empty"]\n\n*');
    assert.equal(result.ok, false);
  });

  it("rejects more than one game", () => {
    const two = '[Event "A"]\n\n1. e4 e5 1-0\n\n[Event "B"]\n\n1. d4 d5 0-1';
    const result = parsePgn(two);
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, /more than one game/);
  });

  it("rejects a game that starts from a custom position", () => {
    const result = parsePgn(
      '[SetUp "1"]\n[FEN "8/8/8/4k3/8/8/4K3/7R w - - 0 1"]\n\n1. Rh8 *',
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, /standard position/);
  });
});
