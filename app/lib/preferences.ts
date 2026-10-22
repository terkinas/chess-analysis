/**
 * Gameplay preferences saved on this device: the saved shape, the defaults and
 * safe parsing of whatever storage hands back. Pure functions only, so it is
 * unit-testable; the shared store that reads and writes localStorage lives in
 * `use-preferences.ts`.
 */

export const PREFERENCES_STORAGE_KEY = "gambit:preferences";

export type Preferences = {
  /**
   * Premoves: while the opponent is thinking, move a piece anyway (and keep
   * going: several can be queued); each is played, in order, on your turn if it
   * is still legal then.
   */
  premove: boolean;
};

export const DEFAULT_PREFERENCES: Preferences = { premove: true };

/** The preferences in `raw` (a JSON string from storage), defaulting anything missing or invalid. */
export function parsePreferences(raw: string | null): Preferences {
  if (!raw) return DEFAULT_PREFERENCES;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null) return DEFAULT_PREFERENCES;
    const premove = (value as { premove?: unknown }).premove;
    return {
      premove:
        typeof premove === "boolean" ? premove : DEFAULT_PREFERENCES.premove,
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export function serializePreferences(preferences: Preferences): string {
  return JSON.stringify({ premove: preferences.premove });
}

export function samePreferences(a: Preferences, b: Preferences): boolean {
  return a.premove === b.premove;
}
