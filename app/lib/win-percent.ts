// Win probability from an engine score. Pure, shared by move classification
// (which bands a move by the win chance it gave up) and by the accuracy score,
// so a move's label and its accuracy are always judged on the same scale.
//
// The curve is the one Lichess publishes. It is applied to the depth-limited
// scores this app stores, so the numbers are a guide, not a reproduction of
// Lichess's figures for the same game.

/**
 * Stands in for a forced mate when it is turned into a number. It is far
 * beyond any centipawn score, so the win percentage saturates at 0 or 100.
 */
export const MATE_AS_CENTIPAWNS = 10000;

/** Win probability (0–100) for the side with `cp` centipawns. */
export function winPercent(cp: number): number {
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
}
