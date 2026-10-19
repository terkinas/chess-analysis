import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  BOARD_PRESETS,
  DEFAULT_APPEARANCE,
  DEFAULT_BOARD_PRESET,
  PIECE_SETS,
  boardCssVariables,
  boardReadabilityIssues,
  normalizeHex,
  parseAppearance,
  pieceImageUrl,
  serializeAppearance,
} from "./appearance.ts";

describe("parseAppearance", () => {
  it("falls back to the defaults for missing or junk input", () => {
    for (const raw of [null, undefined, "", "{nope", "42", "[]", 7, []]) {
      assert.deepEqual(parseAppearance(raw), DEFAULT_APPEARANCE);
    }
  });

  it("round-trips a saved value", () => {
    const saved = { pieceSet: "heritage3d", board: { light: "#f0d9b5", dark: "#b58863" } } as const;
    assert.deepEqual(parseAppearance(serializeAppearance(saved)), saved);
  });

  it("repairs each field on its own", () => {
    const parsed = parseAppearance({
      pieceSet: "removed-set",
      board: { light: "#ABCDEF", dark: "red" },
    });
    assert.equal(parsed.pieceSet, "classic");
    // A set that was removed from the catalogue (e.g. an older "marble") resets.
    assert.equal(parseAppearance({ pieceSet: "marble" }).pieceSet, "classic");
    assert.deepEqual(parsed.board, DEFAULT_APPEARANCE.board);
    assert.equal(
      parseAppearance({ pieceSet: "heritage3d" }).pieceSet,
      "heritage3d",
    );
    // Sets removed from the catalogue reset to the default.
    for (const removed of ["flat", "staunton", "heritage"]) {
      assert.equal(parseAppearance({ pieceSet: removed }).pieceSet, "classic");
    }
  });

  it("only keeps colours that are a preset", () => {
    // A custom pair, and a preset that was removed (Lagoon), reset to default.
    for (const board of [
      { light: "#123456", dark: "#654321" },
      { light: "#e0efe9", dark: "#5c9a95" },
    ]) {
      assert.deepEqual(parseAppearance({ board }).board, DEFAULT_APPEARANCE.board);
    }
    assert.deepEqual(
      parseAppearance({ board: { light: "#DEE3E6", dark: "#8CA2AD" } }).board,
      { light: "#dee3e6", dark: "#8ca2ad" },
    );  });

  it("normalises hex colours", () => {
    assert.equal(normalizeHex("#ABC"), "#aabbcc");
    assert.equal(normalizeHex(" #A1B2C3 "), "#a1b2c3");
    assert.equal(normalizeHex("a1b2c3"), null);
    assert.equal(normalizeHex(12), null);
  });
});

describe("catalogue", () => {
  it("ships every piece for both colours in every set", () => {
    for (const set of PIECE_SETS) {
      for (const color of "wb") {
        for (const type of "KQRBNP") {
          const file = `public${pieceImageUrl(set.id, `${color}${type}`)}`;
          assert.ok(existsSync(file), `${set.id}: missing ${file}`);
        }
      }
    }
  });

  it("offers exactly the four piece sets and three board colours", () => {
    assert.deepEqual(PIECE_SETS.map((set) => set.id), [
      "classic",
      "heritage3d",
      "burnett",
      "burnett3d",
    ]);
    assert.deepEqual(BOARD_PRESETS.map((preset) => preset.id), [
      "gambit",
      "walnut",
      "slate",
    ]);
  });

  it("keeps every board preset readable", () => {
    for (const preset of BOARD_PRESETS) {
      assert.deepEqual(boardReadabilityIssues(preset), [], preset.id);
    }
  });

  it("flags unreadable custom colours", () => {
    assert.ok(boardReadabilityIssues({ light: "#777777", dark: "#777777" }).length > 0);
    assert.ok(boardReadabilityIssues({ light: "#202020", dark: "#f0f0f0" }).length > 0);
  });

  it("matches the default colours declared in globals.css", () => {
    const css = readFileSync("app/globals.css", "utf8");
    const vars = boardCssVariables(DEFAULT_APPEARANCE.board);
    for (const [name, value] of Object.entries(vars)) {
      assert.ok(css.includes(`${name}: ${value};`), `${name} should default to ${value}`);
    }
    assert.equal(DEFAULT_BOARD_PRESET.id, "gambit");
  });
});
