// A small, framework-free wrapper around the Stockfish.js Web Worker. All
// engine computation happens inside the worker, off the UI thread; this file
// only speaks UCI over postMessage. It knows nothing about React or chess
// rules: callers validate the returned move against chess.js themselves.

import { parseScoredInfo, type UciInfo } from "./uci-info.ts";

/** Vendored Stockfish 19 (lite, single-threaded); see public/stockfish/README.md. */
export const ENGINE_URL = "/stockfish/stockfish-19-lite-single.js";

export type EngineStatus =
  | "idle" // not started yet
  | "loading" // worker spawned, waiting for the UCI handshake
  | "ready"
  | "error"
  | "terminated";

/** How long or how deep to search. `depth` wins if both are given. */
export type SearchLimit = {
  /** Think for this long. Defaults to DEFAULT_MOVE_TIME_MS. */
  moveTimeMs?: number;
  /** Search to this many plies (1–MAX_DEPTH) instead of for a fixed time. */
  depth?: number;
  /**
   * How many lines to search. 2 also reports the second-best line (see
   * `AnalysisResult.second`). Defaults to 1, the best line only.
   */
  multiPv?: 1 | 2;
};

export const MAX_DEPTH = 40;

export const DEFAULT_MOVE_TIME_MS = 1000;

const INIT_TIMEOUT_MS = 20_000;
/** Extra time beyond `movetime` before a silent engine is declared hung. */
const SEARCH_GRACE_MS = 10_000;
/** Watchdog for depth-limited searches, which have no fixed duration. */
const DEPTH_SEARCH_TIMEOUT_MS = 60_000;

/** A move in UCI long algebraic notation, split into parts. */
export type UciMove = {
  uci: string;
  from: string;
  to: string;
  /** Lower-case piece letter (q, r, b, n) for promotions. */
  promotion?: string;
};

export type BestMove = {
  move: UciMove;
  ponder?: string;
};

/** The search was superseded, cancelled, or the engine was terminated. */
export class EngineCancelledError extends Error {
  constructor(message = "Engine request cancelled") {
    super(message);
    this.name = "EngineCancelledError";
  }
}

/** The worker failed to load or crashed, the engine timed out, or it sent nonsense. */
export class EngineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EngineError";
  }
}

/** The subset of `Worker` the wrapper uses; lets tests inject a fake. */
export interface WorkerLike {
  postMessage(message: string): void;
  terminate(): void;
  onmessage: ((event: { data: unknown }) => void) | null;
  onerror: ((event: { message?: string }) => void) | null;
}

export type StockfishEngineOptions = {
  workerUrl?: string;
  createWorker?: () => WorkerLike;
  onStatusChange?: (status: EngineStatus) => void;
};

const UCI_MOVE = /^([a-h][1-8])([a-h][1-8])([qrbn])?$/;

/** Parses a UCI move such as "e2e4" or "e7e8q"; null if it is malformed. */
export function parseUciMove(text: string): UciMove | null {
  const match = UCI_MOVE.exec(text);
  if (!match) return null;
  return {
    uci: text,
    from: match[1],
    to: match[2],
    promotion: match[3],
  };
}

/**
 * Parses a `bestmove` line. Returns the best move, `null` when the engine says
 * `bestmove (none)` (no legal moves), or `undefined` if the line is not a
 * `bestmove` line at all.
 */
export function parseBestMoveLine(line: string): BestMove | null | undefined {
  const match = /^bestmove\s+(\S+)(?:\s+ponder\s+(\S+))?/.exec(line.trim());
  if (!match) return undefined;
  const move = parseUciMove(match[1]);
  if (!move) return null; // "(none)", "0000", or anything unparseable
  return { move, ponder: match[2] };
}

type Waiter<T> = {
  resolve: (value: T) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

/** The final result of an analysis search. */
export type AnalysisResult = {
  best: BestMove;
  /** The last exact-score `info` line seen, or null if the engine sent none. */
  info: UciInfo | null;
  /**
   * The last exact-score line of the second-best move, when the search asked
   * for two lines (`multiPv: 2`) and the position has one. Null otherwise.
   */
  second: UciInfo | null;
};

type SearchCallbacks = {
  onInfo?: (info: UciInfo) => void;
  onSecond?: (info: UciInfo) => void;
};

export class StockfishEngine {
  private worker: WorkerLike | null = null;
  private status: EngineStatus = "idle";
  private initPromise: Promise<void> | null = null;
  private search: (Waiter<BestMove> & SearchCallbacks) | null = null;
  // Searches that were cancelled but whose `bestmove` has not arrived yet.
  // Each `go` yields exactly one `bestmove`, in order, so the next N of them
  // belong to cancelled searches and must be dropped, not delivered.
  private staleBestMoves = 0;
  private handshake: ((line: string) => void) | null = null;
  private readonly options: StockfishEngineOptions;

  constructor(options: StockfishEngineOptions = {}) {
    this.options = options;
  }

  getStatus(): EngineStatus {
    return this.status;
  }

  /** Spawns the worker and completes the UCI handshake. Safe to call repeatedly. */
  init(): Promise<void> {
    if (this.status === "terminated") {
      return Promise.reject(new EngineCancelledError("Engine was terminated"));
    }
    if (this.initPromise) return this.initPromise;

    this.setStatus("loading");
    this.initPromise = this.startWorker().then(
      () => {
        if (this.status === "terminated") throw new EngineCancelledError();
        this.setStatus("ready");
      },
      (error: unknown) => {
        if (this.status !== "terminated") this.fail();
        throw error;
      },
    );
    return this.initPromise;
  }

  /**
   * Asks the engine for its best move in `fen`. Starting a new request cancels
   * the previous one (which rejects with EngineCancelledError). The result is
   * a suggestion only: validate it against chess.js before using it.
   */
  getBestMove(fen: string, limit: SearchLimit = {}): Promise<BestMove> {
    return this.runSearch(fen, limit);
  }

  /**
   * Like `getBestMove`, but also reports the engine's score. The returned
   * `info` is the last exact-score `info` line of this search only: lines from
   * a cancelled search are dropped, never mixed in. The score is relative to
   * the side to move in `fen` (see `toWhiteScore` in uci-info.ts).
   */
  async analyze(fen: string, limit: SearchLimit = {}): Promise<AnalysisResult> {
    let info: UciInfo | null = null;
    let second: UciInfo | null = null;
    const best = await this.runSearch(fen, limit, {
      onInfo: (line) => {
        info = line;
      },
      onSecond: (line) => {
        second = line;
      },
    });
    return { best, info, second };
  }

  private async runSearch(
    fen: string,
    limit: SearchLimit,
    callbacks: SearchCallbacks = {},
  ): Promise<BestMove> {
    // A FEN is a single line; refuse anything that could smuggle in a second UCI command.
    if (/[\r\n]/.test(fen)) throw new EngineError("Invalid FEN");
    const { depth, moveTimeMs } = limit;
    if (
      limit.multiPv !== undefined &&
      limit.multiPv !== 1 &&
      limit.multiPv !== 2
    ) {
      throw new EngineError("Invalid search limit");
    }
    if (
      (depth !== undefined &&
        (!Number.isInteger(depth) || depth < 1 || depth > MAX_DEPTH)) ||
      (moveTimeMs !== undefined && !(moveTimeMs > 0 && Number.isFinite(moveTimeMs)))
    ) {
      throw new EngineError("Invalid search limit");
    }

    this.cancel();
    await this.init();
    // init() may have been awaited while another request or terminate() came in.
    if (this.status !== "ready" || !this.worker) {
      throw new EngineCancelledError();
    }
    this.cancel();

    const worker = this.worker;
    let goCommand: string;
    let watchdogMs: number;
    if (limit.depth !== undefined) {
      goCommand = `go depth ${limit.depth}`;
      watchdogMs = DEPTH_SEARCH_TIMEOUT_MS;
    } else {
      const moveTimeMs = limit.moveTimeMs ?? DEFAULT_MOVE_TIME_MS;
      goCommand = `go movetime ${moveTimeMs}`;
      watchdogMs = moveTimeMs + SEARCH_GRACE_MS;
    }

    return new Promise<BestMove>((resolve, reject) => {
      const timer = setTimeout(() => {
        // The engine stopped answering; discard it rather than wait forever.
        this.search = null;
        this.fail();
        reject(new EngineError("Engine did not respond"));
      }, watchdogMs);
      this.search = { resolve, reject, timer, ...callbacks };
      worker.postMessage(`setoption name MultiPV value ${limit.multiPv ?? 1}`);
      worker.postMessage(`position fen ${fen}`);
      worker.postMessage(goCommand);
    });
  }

  /** Abandons the in-flight search, if any. The engine stays usable. */
  cancel(): void {
    const search = this.search;
    if (!search) return;
    this.search = null;
    clearTimeout(search.timer);
    this.staleBestMoves += 1;
    this.worker?.postMessage("stop");
    search.reject(new EngineCancelledError());
  }

  /** Stops the worker and rejects anything pending. Idempotent and final. */
  terminate(): void {
    if (this.status === "terminated") return;
    const search = this.search;
    this.search = null;
    if (search) clearTimeout(search.timer);
    this.teardownWorker();
    this.setStatus("terminated");
    search?.reject(new EngineCancelledError("Engine was terminated"));
    // Unblock a pending handshake; its catch ignores terminated engines.
    this.handshake?.("");
    this.handshake = null;
  }

  private startWorker(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let worker: WorkerLike;
      try {
        worker = this.options.createWorker
          ? this.options.createWorker()
          : (new Worker(this.options.workerUrl ?? ENGINE_URL) as WorkerLike);
      } catch (error) {
        reject(new EngineError(`Could not start the engine: ${String(error)}`));
        return;
      }
      this.worker = worker;

      const timer = setTimeout(() => {
        this.handshake = null;
        reject(new EngineError("Engine took too long to load"));
      }, INIT_TIMEOUT_MS);

      let stage: "uci" | "isready" = "uci";
      this.handshake = (line) => {
        if (this.status === "terminated") {
          clearTimeout(timer);
          reject(new EngineCancelledError());
        } else if (stage === "uci" && line.trim() === "uciok") {
          stage = "isready";
          worker.postMessage("isready");
        } else if (stage === "isready" && line.trim() === "readyok") {
          clearTimeout(timer);
          this.handshake = null;
          resolve();
        }
      };

      worker.onmessage = (event) => this.handleMessage(event.data);
      worker.onerror = (event) => {
        clearTimeout(timer);
        const detail = event.message ? `: ${event.message}` : "";
        const error = new EngineError(`Engine failed${detail}`);
        const search = this.search;
        this.search = null;
        if (search) clearTimeout(search.timer);
        this.handshake = null;
        this.fail();
        reject(error); // no-op once the handshake has settled
        search?.reject(error);
      };
      worker.postMessage("uci");
    });
  }

  private handleMessage(data: unknown): void {
    if (typeof data !== "string") return;
    const line = data.trim();

    if (this.handshake) {
      this.handshake(line);
      return;
    }

    const best = parseBestMoveLine(line);
    if (best === undefined) {
      // `info` lines only matter to analysis searches. While cancelled searches
      // are still draining, any info line belongs to one of them, not to the
      // current search, so it is dropped.
      if (this.staleBestMoves === 0 && this.search) {
        const scored = parseScoredInfo(line);
        if (scored?.multipv === 1) this.search.onInfo?.(scored.info);
        else if (scored?.multipv === 2) this.search.onSecond?.(scored.info);
      }
      return;
    }

    if (this.staleBestMoves > 0) {
      this.staleBestMoves -= 1;
      return;
    }

    const search = this.search;
    if (!search) return;
    this.search = null;
    clearTimeout(search.timer);
    if (best) search.resolve(best);
    else search.reject(new EngineError("Engine found no legal move"));
  }

  /** Marks the engine unusable after an error and releases the worker. */
  private fail(): void {
    if (this.status === "terminated") return;
    const search = this.search;
    this.search = null;
    if (search) clearTimeout(search.timer);
    this.teardownWorker();
    this.setStatus("error");
    search?.reject(new EngineError("Engine stopped unexpectedly"));
  }

  private teardownWorker(): void {
    const worker = this.worker;
    this.worker = null;
    this.staleBestMoves = 0;
    if (!worker) return;
    worker.onmessage = null;
    worker.onerror = null;
    try {
      worker.postMessage("quit");
    } catch {
      // The worker is already gone.
    }
    worker.terminate();
  }

  private setStatus(status: EngineStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.options.onStatusChange?.(status);
  }
}
