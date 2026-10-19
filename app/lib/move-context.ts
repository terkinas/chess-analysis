// The two positions a move connects, derived from the analysis line with
// chess.js. Nothing here touches the board's own game: every call builds its
// own throwaway instance.

import { Chess } from "chess.js";
import type { WhiteScore } from "./uci-info.ts";

type Color = "w" | "b";

/** One move of the line together with the exact positions on either side of it. */
export type MoveContext = {
  /** 1-based ply of the move on the line (1 = White's first move). */
  ply: number;
  san: string;
  /** The side that made the move. */
  mover: Color;
  beforeFen: string;
  afterFen: string;
  /**
   * Identifies this exact move in this exact position. Two contexts with the
   * same key are the same move, so a result is only ever applied to a context
   * whose key matches the one it was computed for.
   */
  key: string;
};

/**
 * The move that leads to the position at `ply` on the line (the one the cursor
 * is on), or null at the start position, for a ply outside the line, or when
 * chess.js rejects any move on the way.
 */
export function moveContextAt(
  moves: readonly string[],
  ply: number,
): MoveContext | null {
  if (!Number.isInteger(ply) || ply < 1 || ply > moves.length) return null;
  try {
    const game = new Chess();
    for (let i = 0; i < ply - 1; i++) game.move(moves[i]);
    const beforeFen = game.fen();
    const mover: Color = game.turn();
    const san = moves[ply - 1];
    game.move(san);
    const afterFen = game.fen();
    return {
      ply,
      san,
      mover,
      beforeFen,
      afterFen,
      key: `${ply}|${beforeFen}|${san}|${afterFen}`,
    };
  } catch {
    return null;
  }
}

/**
 * The score of a position the engine cannot search because the game is over:
 * checkmate (the side to move has lost) or stalemate (0). Null for any other
 * position, or an invalid FEN.
 */
export function terminalWhiteScore(fen: string): WhiteScore | null {
  let game: Chess;
  try {
    game = new Chess(fen);
  } catch {
    return null;
  }
  if (game.isCheckmate()) {
    return {
      kind: "mate",
      winner: game.turn() === "w" ? "b" : "w",
      moves: 0,
    };
  }
  if (game.isStalemate()) return { kind: "cp", cp: 0 };
  return null;
}
