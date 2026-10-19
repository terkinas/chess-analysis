// Plain-text helpers for PGN input. They only tidy and inspect the text before
// it is handed to chess.js; none of them parses moves or applies chess rules,
// so they need no dependencies.

/** Longest pasted PGN accepted; anything longer is almost certainly not one game. */
export const MAX_PGN_LENGTH = 200_000;

/** Strips a byte-order mark, unifies line endings and trims the ends. */
export function normalizePgn(text: string): string {
  return text
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .trim();
}

/** True when the text holds more than one game (more than one [Event] tag line). */
export function looksLikeMultipleGames(pgn: string): boolean {
  return (pgn.match(/^\s*\[Event\s/gm) ?? []).length > 1;
}

/**
 * True when the movetext appears to contain variations, i.e. a "(" outside the
 * header tags and outside {brace} and ;line comments. Used only to tell the
 * person that the extra lines were left out, never to decide what is loaded.
 */
export function hasVariations(pgn: string): boolean {
  const movetext = pgn
    .split("\n")
    .filter((line) => !/^\s*\[.*\]\s*$/.test(line))
    .join("\n")
    .replace(/\{[^}]*\}/g, " ")
    .replace(/;[^\n]*/g, " ");
  return movetext.includes("(");
}
