// Material counting straight from a FEN string. Pure, with no chess.js, so it is
// cheap to call on every principal-variation position and easy to test.

type Color = "w" | "b";

/** Conventional piece values in pawns. Kings are not counted. */
const VALUE: Record<string, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
};

/**
 * The material of `side` in `fen`: the sum of its pieces' values, kings
 * excluded. Null when the FEN has no readable board, so a bad FEN is never
 * counted as zero material.
 */
export function materialFor(fen: string, side: Color): number | null {
  const board = fen.split(" ")[0];
  if (!board || board.split("/").length !== 8) return null;
  let total = 0;
  for (const char of board) {
    if (char >= "1" && char <= "8") continue;
    if (char === "/") continue;
    const piece = char.toLowerCase();
    if (!(piece in VALUE)) {
      if (piece === "k") continue;
      return null;
    }
    const isWhite = char === char.toUpperCase();
    if ((side === "w") === isWhite) total += VALUE[piece];
  }
  return total;
}

/**
 * How much `side`'s material changed going from `beforeFen` to `afterFen`,
 * compared with the opponent's: positive when `side` gained on balance, negative
 * when it gave material away. Null if either FEN is unreadable.
 */
export function materialBalanceChange(
  beforeFen: string,
  afterFen: string,
  side: Color,
): number | null {
  const other: Color = side === "w" ? "b" : "w";
  const own = materialFor(beforeFen, side);
  const foe = materialFor(beforeFen, other);
  const ownAfter = materialFor(afterFen, side);
  const foeAfter = materialFor(afterFen, other);
  if (own === null || foe === null || ownAfter === null || foeAfter === null) {
    return null;
  }
  return ownAfter - foeAfter - (own - foe);
}
