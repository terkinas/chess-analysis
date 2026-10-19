import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { InFlightRegistry } from "./in-flight.ts";

describe("InFlightRegistry", () => {
  it("gives the first claim to the caller and makes later ones wait", () => {
    const registry = new InFlightRegistry();
    const first = registry.claim("k");
    assert.equal(first.owned, true);
    assert.equal(registry.isPending("k"), true);
    assert.equal(registry.claim("k").owned, false);
    assert.equal(registry.claim("other").owned, true);
  });

  it("wakes a waiter on release and frees the key", async () => {
    const registry = new InFlightRegistry();
    const first = registry.claim("k");
    const second = registry.claim("k");
    assert.ok(first.owned && !second.owned);
    let woke = false;
    const waiting = (second as { wait: Promise<void> }).wait.then(() => {
      woke = true;
    });
    await Promise.resolve();
    assert.equal(woke, false);
    first.release();
    await waiting;
    assert.equal(woke, true);
    assert.equal(registry.isPending("k"), false);
    assert.equal(registry.claim("k").owned, true);
  });

  it("releasing twice does not free a newer claim", () => {
    const registry = new InFlightRegistry();
    const first = registry.claim("k");
    assert.ok(first.owned);
    first.release();
    const second = registry.claim("k");
    first.release();
    assert.equal(registry.isPending("k"), true);
    assert.ok(second.owned);
  });
});
