// Carries a finished game from the play page to the analysis page. The game is
// only a list of moves, so it travels as PGN text in sessionStorage: it is
// private to this tab, needs no server or database, and is removed as soon as
// the analysis page has read it, so a reload never re-imports it.

export const HANDOFF_KEY = "gambit:analysis-handoff";

type HandoffStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function defaultStorage(): HandoffStorage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    // Storage can be blocked (private modes, strict cookie settings).
    return null;
  }
}

/** Stores the PGN for the analysis page. False when storage is unavailable. */
export function saveHandoff(
  pgn: string,
  storage: HandoffStorage | null = defaultStorage(),
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(HANDOFF_KEY, pgn);
    return true;
  } catch {
    return false;
  }
}

/** Returns the waiting PGN and removes it, or null when there is none. */
export function takeHandoff(
  storage: HandoffStorage | null = defaultStorage(),
): string | null {
  if (!storage) return null;
  try {
    const pgn = storage.getItem(HANDOFF_KEY);
    if (pgn === null) return null;
    storage.removeItem(HANDOFF_KEY);
    return pgn.trim() === "" ? null : pgn;
  } catch {
    return null;
  }
}
