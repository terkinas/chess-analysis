// Tracks which cache keys are being searched right now, so two hooks that need
// the same position at the same search limit share one search instead of
// running two. Plain data, no React.

export type Claim =
  /** The caller now owns the search for the key and must `release` it when done. */
  | { owned: true; release: () => void }
  /** Someone else is searching the key; `wait` settles when they finish (or give up). */
  | { owned: false; wait: Promise<void> };

export class InFlightRegistry {
  private readonly pending = new Map<string, Promise<void>>();

  /**
   * Claims `key`. Whoever gets an owned claim runs the search and releases it in
   * a `finally`, after storing the result, so a waiter that wakes up finds the
   * result (or finds the key free and may search it itself, if the owner was
   * cancelled or failed). Releasing twice is harmless.
   */
  claim(key: string): Claim {
    const existing = this.pending.get(key);
    if (existing) return { owned: false, wait: existing };

    let resolve!: () => void;
    const promise = new Promise<void>((done) => {
      resolve = done;
    });
    this.pending.set(key, promise);
    return {
      owned: true,
      release: () => {
        // Only free the key if it is still this claim's.
        if (this.pending.get(key) === promise) this.pending.delete(key);
        resolve();
      },
    };
  }

  isPending(key: string): boolean {
    return this.pending.has(key);
  }
}
