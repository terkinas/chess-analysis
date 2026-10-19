import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  EngineCancelledError,
  EngineError,
  StockfishEngine,
  type WorkerLike,
} from "./stockfish-engine.ts";

const FEN_A = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const FEN_B = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1";

/** A scripted stand-in for the Stockfish worker; completes the UCI handshake itself. */
class FakeWorker implements WorkerLike {
  sent: string[] = [];
  terminated = false;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: ((event: { message?: string }) => void) | null = null;

  postMessage(message: string): void {
    this.sent.push(message);
    if (message === "uci") queueMicrotask(() => this.emit("uciok"));
    if (message === "isready") queueMicrotask(() => this.emit("readyok"));
  }
  terminate(): void {
    this.terminated = true;
  }
  emit(line: string): void {
    this.onmessage?.({ data: line });
  }
  get goCount(): number {
    return this.sent.filter((m) => m.startsWith("go ")).length;
  }
}

function setup() {
  const worker = new FakeWorker();
  const engine = new StockfishEngine({ createWorker: () => worker });
  return { worker, engine };
}

// Lets the engine finish awaiting init() and post its `go` command.
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

describe("StockfishEngine.analyze", () => {
  it("returns the best move and the last exact score of the search", async () => {
    const { worker, engine } = setup();
    const result = engine.analyze(FEN_A, { moveTimeMs: 100 });
    await tick();

    assert.ok(worker.sent.includes(`position fen ${FEN_A}`));
    worker.emit("info depth 6 score cp 10 pv e2e4");
    worker.emit("info depth 7 score cp 25 lowerbound pv d2d4"); // a bound: ignored
    worker.emit("info string not a score");
    worker.emit("info depth 8 score cp 31 pv e2e4 e7e5");
    worker.emit("bestmove e2e4 ponder e7e5");

    const { best, info } = await result;
    assert.equal(best.move.uci, "e2e4");
    assert.equal(info?.depth, 8);
    assert.deepEqual(info?.score, { kind: "cp", value: 31 });
    engine.terminate();
  });

  it("returns a null info when the engine sent no usable score", async () => {
    const { worker, engine } = setup();
    const result = engine.analyze(FEN_A, { moveTimeMs: 100 });
    await tick();
    worker.emit("bestmove e2e4");
    assert.equal((await result).info, null);
    engine.terminate();
  });

  it("rejects when the engine reports no legal move", async () => {
    const { worker, engine } = setup();
    const result = engine.analyze(FEN_A, { moveTimeMs: 100 });
    await tick();
    worker.emit("bestmove (none)");
    await assert.rejects(result, EngineError);
    engine.terminate();
  });

  it("rejects a FEN that could smuggle in a second command", async () => {
    const { engine } = setup();
    await assert.rejects(engine.analyze(`${FEN_A}\nquit`), EngineError);
    engine.terminate();
  });

  it("rejects with EngineError when the worker crashes mid-search", async () => {
    const { worker, engine } = setup();
    const result = engine.analyze(FEN_A, { moveTimeMs: 100 });
    await tick();
    worker.onerror?.({ message: "boom" });
    await assert.rejects(result, EngineError);
    assert.equal(engine.getStatus(), "error");
    assert.ok(worker.terminated);
  });
});

describe("cancelled and superseded searches", () => {
  it("cancel() rejects the pending search and sends stop", async () => {
    const { worker, engine } = setup();
    const result = engine.analyze(FEN_A, { moveTimeMs: 100 });
    await tick();
    engine.cancel();
    await assert.rejects(result, EngineCancelledError);
    assert.ok(worker.sent.includes("stop"));
    engine.terminate();
  });

  it("never delivers a cancelled search's late output to the next search", async () => {
    const { worker, engine } = setup();

    const first = engine.analyze(FEN_A, { moveTimeMs: 100 });
    const firstOutcome = first.then(
      () => "resolved",
      (error: unknown) => error,
    );
    await tick();

    // A second request supersedes the first.
    const second = engine.analyze(FEN_B, { moveTimeMs: 100 });
    await tick();
    assert.ok((await firstOutcome) instanceof EngineCancelledError);
    assert.equal(worker.goCount, 2);

    // The first search winds down after `stop`: its output arrives while the
    // second is already running. None of it may leak into the second result.
    worker.emit("info depth 20 score cp 999 pv d2d4");
    worker.emit("bestmove d2d4");
    // Now the second search's own output.
    worker.emit("info depth 9 score cp -40 pv e7e5");
    worker.emit("bestmove e7e5");

    const { best, info } = await second;
    assert.equal(best.move.uci, "e7e5");
    assert.equal(info?.depth, 9);
    assert.deepEqual(info?.score, { kind: "cp", value: -40 });
    engine.terminate();
  });

  it("ignores info and bestmove that arrive after cancel() with nothing pending", async () => {
    const { worker, engine } = setup();
    const result = engine.analyze(FEN_A, { moveTimeMs: 100 });
    await tick();
    engine.cancel();
    await assert.rejects(result, EngineCancelledError);

    worker.emit("info depth 12 score cp 50 pv e2e4");
    worker.emit("bestmove e2e4"); // drained as the cancelled search's reply

    // The engine is still usable and the next search is unaffected.
    const next = engine.analyze(FEN_B, { moveTimeMs: 100 });
    await tick();
    worker.emit("info depth 5 score cp 7 pv e7e5");
    worker.emit("bestmove e7e5");
    const { best, info } = await next;
    assert.equal(best.move.uci, "e7e5");
    assert.deepEqual(info?.score, { kind: "cp", value: 7 });
    engine.terminate();
  });

  it("terminate() rejects the pending search and releases the worker", async () => {
    const { worker, engine } = setup();
    const result = engine.analyze(FEN_A, { moveTimeMs: 100 });
    await tick();
    engine.terminate();
    await assert.rejects(result, EngineCancelledError);
    assert.ok(worker.terminated);
    assert.equal(engine.getStatus(), "terminated");
    await assert.rejects(engine.analyze(FEN_A), EngineCancelledError);
  });
});

describe("getBestMove (opponent path) is unchanged", () => {
  it("still resolves with just the move and ignores info lines", async () => {
    const { worker, engine } = setup();
    const result = engine.getBestMove(FEN_A, { moveTimeMs: 100 });
    await tick();
    worker.emit("info depth 8 score cp 31 pv e2e4");
    worker.emit("bestmove g1f3");
    const best = await result;
    assert.equal(best.move.uci, "g1f3");
    engine.terminate();
  });
});
