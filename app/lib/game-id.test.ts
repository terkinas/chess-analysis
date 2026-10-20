import assert from "node:assert/strict";
import { test } from "node:test";
import { newGameId } from "./game-id.ts";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

test("uses randomUUID when available", () => {
  const id = newGameId({
    randomUUID: () => "11111111-1111-4111-8111-111111111111",
    getRandomValues: ((a: Uint8Array) => a) as Crypto["getRandomValues"],
  });
  assert.equal(id, "11111111-1111-4111-8111-111111111111");
});

test("falls back to a valid v4 UUID without randomUUID", () => {
  const source = {
    getRandomValues: ((array: Uint8Array) => {
      array.fill(0xff);
      return array;
    }) as Crypto["getRandomValues"],
  };
  assert.match(newGameId(source), UUID_V4);
  assert.match(newGameId(globalThis.crypto), UUID_V4);
});
