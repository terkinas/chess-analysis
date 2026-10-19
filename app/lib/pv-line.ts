import { Chess } from "chess.js";
import type { PvLine, PvMove } from "./pv-format.ts";

// Turns the engine's UCI principal variation into SAN by replaying it on its
// own chess.js instance, started from the analysed FEN. The instance is local
// to this call, so the analysis board's game is never touched. chess.js decides
// legality; the replay stops at the first move it does not accept.

const UCI_MOVE = /^([a-h][1-8])([a-h][1-8])([qrbn])?$/;

export function buildPvLine(
  startFen: string,
  uciMoves: readonly string[],
): PvLine {
  let game: Chess;
  try {
    game = new Chess(startFen);
  } catch {
    return { startFen, moves: [], stoppedEarly: uciMoves.length > 0 };
  }

  const moves: PvMove[] = [];
  for (const uci of uciMoves) {
    const match = UCI_MOVE.exec(uci);
    // A line cannot continue past checkmate or stalemate. Other draws (such as
    // repetition) do not end a line here, matching the analysis board.
    if (!match || game.isCheckmate() || game.isStalemate()) {
      return { startFen, moves, stoppedEarly: true };
    }
    try {
      const move = game.move({
        from: match[1],
        to: match[2],
        promotion: match[3],
      });
      moves.push({ uci, san: move.san, fen: game.fen() });
    } catch {
      return { startFen, moves, stoppedEarly: true };
    }
  }
  return { startFen, moves, stoppedEarly: false };
}

/** The SAN moves chess.js accepts when the first `count` PV moves are replayed. */
export type PvReplay = {
  sans: string[];
  /** True when all `count` moves were accepted. */
  complete: boolean;
};

/**
 * Re-validates the first `count` moves of `pv` against the position the game is
 * in now (`currentFen`), on a fresh chess.js instance, and returns their SAN.
 * Nothing is trusted from the earlier replay: the moves are taken as UCI again,
 * and the replay stops at the first invalid move or after checkmate/stalemate.
 * Returns null when `pv` was not computed for `currentFen` (it is stale) or
 * `count` is not a valid number of its moves.
 */
export function replayPvOnto(
  currentFen: string,
  pv: PvLine,
  count: number,
): PvReplay | null {
  if (
    pv.startFen !== currentFen ||
    !Number.isInteger(count) ||
    count < 1 ||
    count > pv.moves.length
  ) {
    return null;
  }
  const replayed = buildPvLine(
    currentFen,
    pv.moves.slice(0, count).map((move) => move.uci),
  );
  return {
    sans: replayed.moves.map((move) => move.san),
    complete: !replayed.stoppedEarly && replayed.moves.length === count,
  };
}
