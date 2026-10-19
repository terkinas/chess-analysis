import assert from "node:assert/strict";
import { test } from "node:test";
import { HANDOFF_KEY, saveHandoff, takeHandoff } from "./analysis-handoff.ts";

function fakeStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  };
}

test("a saved game is taken once and then gone", () => {
  const storage = fakeStorage();
  assert.equal(saveHandoff("1. e4 e5 *", storage), true);
  assert.equal(takeHandoff(storage), "1. e4 e5 *");
  assert.equal(storage.data.has(HANDOFF_KEY), false);
  assert.equal(takeHandoff(storage), null);
});

test("nothing waiting gives null", () => {
  assert.equal(takeHandoff(fakeStorage()), null);
});

test("a blank value counts as nothing and is cleared", () => {
  const storage = fakeStorage({ [HANDOFF_KEY]: "   " });
  assert.equal(takeHandoff(storage), null);
  assert.equal(storage.data.has(HANDOFF_KEY), false);
});

test("missing or failing storage never throws", () => {
  assert.equal(saveHandoff("1. e4 *", null), false);
  assert.equal(takeHandoff(null), null);
  const broken = {
    getItem: () => {
      throw new Error("blocked");
    },
    setItem: () => {
      throw new Error("quota");
    },
    removeItem: () => {},
  };
  assert.equal(saveHandoff("1. e4 *", broken), false);
  assert.equal(takeHandoff(broken), null);
});
