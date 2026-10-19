import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyMove,
  createClock,
  describeClock,
  flagClock,
  formatClock,
  incrementMsOf,
  initialMsOf,
  remainingAt,
  restoreClock,
  setSearching,
  stopClock,
} from "./chess-clock.ts";

const MIN = 60_000;

describe("settings", () => {
  it("converts minutes and increment to ms; 0 minutes is untimed", () => {
    assert.equal(initialMsOf({ minutes: 5, incrementSeconds: 3 }), 5 * MIN);
    assert.equal(incrementMsOf({ minutes: 5, incrementSeconds: 3 }), 3000);
    assert.equal(initialMsOf({ minutes: 0, incrementSeconds: 5 }), Infinity);
    assert.equal(incrementMsOf({ minutes: 0, incrementSeconds: 5 }), 0);
    assert.equal(describeClock({ minutes: 5, incrementSeconds: 3 }), "5 min + 3 s");
    assert.equal(describeClock({ minutes: 0, incrementSeconds: 0 }), "No clock");
  });
});

describe("running", () => {
  it("does not run before the game starts", () => {
    const clock = createClock(10 * MIN);
    assert.deepEqual(remainingAt(clock, 99_999), { w: 10 * MIN, b: 10 * MIN });
  });

  it("only the side to move loses time", () => {
    const clock = createClock(10 * MIN, true, 1000);
    assert.deepEqual(remainingAt(clock, 6000), { w: 10 * MIN - 5000, b: 10 * MIN });
  });

  it("never goes below zero", () => {
    const clock = createClock(1000, true, 0);
    assert.equal(remainingAt(clock, 5000).w, 0);
  });
});

describe("moves", () => {
  it("stops the mover, adds the increment and passes the turn", () => {
    const start = createClock(10 * MIN, true, 0);
    const next = applyMove(start, 4000, 2000, "run");
    assert.equal(next.turn, "b");
    assert.equal(next.running, true);
    assert.deepEqual(next.remaining, { w: 10 * MIN - 4000 + 2000, b: 10 * MIN });
    // Black's clock now runs, White's no longer does.
    assert.deepEqual(remainingAt(next, 7000), {
      w: 10 * MIN - 2000,
      b: 10 * MIN - 3000,
    });
  });

  it("'hold' passes the turn without starting the next clock", () => {
    const next = applyMove(createClock(MIN, true, 0), 1000, 0, "hold");
    assert.equal(next.running, false);
    assert.deepEqual(remainingAt(next, 50_000), next.remaining);
  });

  it("'end' freezes everything, and later changes are ignored", () => {
    const ended = applyMove(createClock(MIN, true, 0), 1000, 0, "end");
    assert.equal(ended.ended, true);
    assert.equal(applyMove(ended, 2000, 0, "run"), ended);
    assert.equal(setSearching(ended, 3000, ended.turn, true), ended);
  });

  it("an untimed clock stays infinite", () => {
    const next = applyMove(createClock(Infinity, true, 0), 5000, 0, "run");
    assert.equal(remainingAt(next, 9000).w, Infinity);
  });
});

describe("engine searching", () => {
  it("runs the engine's clock only while it searches", () => {
    // White (human) moved; Black (engine) is to move but holding.
    let clock = applyMove(createClock(MIN, true, 0), 1000, 0, "hold");
    clock = setSearching(clock, 2000, "b", true);
    assert.equal(remainingAt(clock, 5000).b, MIN - 3000);
    clock = setSearching(clock, 5000, "b", false);
    assert.equal(remainingAt(clock, 60_000).b, MIN - 3000);
  });

  it("ignores a request for the side that is not to move", () => {
    const clock = createClock(MIN);
    assert.equal(setSearching(clock, 1000, "b", true), clock);
  });
});

describe("game end", () => {
  it("stopClock settles and freezes", () => {
    const stopped = stopClock(createClock(MIN, true, 0), 2500);
    assert.equal(stopped.running, false);
    assert.equal(stopped.ended, true);
    assert.equal(remainingAt(stopped, 99_999).w, MIN - 2500);
  });

  it("flagClock zeroes the flagged side", () => {
    const flagged = flagClock(createClock(MIN, true, 0), MIN, "w");
    assert.equal(flagged.remaining.w, 0);
    assert.equal(flagged.remaining.b, MIN);
    assert.equal(flagged.ended, true);
  });
});

describe("undo", () => {
  it("restores the clocks and turn from that moment", () => {
    let clock = createClock(MIN, true, 0); // White to move
    clock = applyMove(clock, 4000, 1000, "hold"); // ply 1
    clock = setSearching(clock, 4000, "b", true);
    clock = applyMove(clock, 6000, 1000, "run"); // ply 2
    const restored = restoreClock(clock, 20_000, 0, "run");
    assert.deepEqual(restored.remaining, { w: MIN, b: MIN });
    assert.equal(restored.turn, "w");
    assert.equal(restored.running, true);
    assert.equal(restored.snapshots.length, 1);
    // The restored clock runs from the moment of the undo.
    assert.equal(remainingAt(restored, 23_000).w, MIN - 3000);
  });

  it("undoing to an odd ply gives Black the move", () => {
    let clock = createClock(MIN, true, 0);
    clock = applyMove(clock, 1000, 0, "hold");
    clock = setSearching(clock, 1000, "b", true);
    clock = applyMove(clock, 2000, 0, "run");
    const restored = restoreClock(clock, 5000, 1, "run");
    assert.equal(restored.turn, "b");
    assert.deepEqual(restored.remaining, { w: MIN - 1000, b: MIN });
  });

  it("clears a finished game's 'ended' state", () => {
    let clock = createClock(MIN, true, 0);
    clock = applyMove(clock, 1000, 0, "end");
    assert.equal(restoreClock(clock, 2000, 0, "run").ended, false);
  });

  it("is ignored for a moment that was never recorded", () => {
    const clock = createClock(MIN);
    assert.equal(restoreClock(clock, 0, 5, "run"), clock);
  });
});

describe("formatClock", () => {
  it("shows m:ss, then tenths under ten seconds", () => {
    assert.equal(formatClock(10 * MIN), "10:00");
    assert.equal(formatClock(61_000), "1:01");
    assert.equal(formatClock(59_100), "1:00");
    assert.equal(formatClock(10_000), "0:10");
    assert.equal(formatClock(7_300), "0:07.3");
    assert.equal(formatClock(0), "0:00.0");
    assert.equal(formatClock(-5), "0:00.0");
    assert.equal(formatClock(Infinity), "--:--");
  });
});
