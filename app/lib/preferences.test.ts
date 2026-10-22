import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_PREFERENCES,
  parsePreferences,
  serializePreferences,
} from "./preferences.ts";

describe("preferences", () => {
  it("defaults to premoves on", () => {
    assert.equal(DEFAULT_PREFERENCES.premove, true);
  });

  it("falls back to the defaults for missing or broken storage", () => {
    for (const raw of [null, "", "not json", "null", "5", '"x"', "[]", "{}"]) {
      assert.deepEqual(parsePreferences(raw), DEFAULT_PREFERENCES, String(raw));
    }
  });

  it("ignores a premove value that is not a boolean", () => {
    assert.equal(parsePreferences('{"premove":"no"}').premove, true);
    assert.equal(parsePreferences('{"premove":0}').premove, true);
  });

  it("round-trips an explicit choice", () => {
    for (const premove of [true, false]) {
      assert.deepEqual(
        parsePreferences(serializePreferences({ premove })),
        { premove },
      );
    }
  });
});
