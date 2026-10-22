// Premoves: moves chosen while it is the opponent's turn. They are only a
// plan: nothing is played until it is the player's turn, and then only the
// first one, and only if it is legal in the position that really arose. Several
// can be queued: each is chosen on a "virtual" board where the earlier ones have
// already happened and the opponent has not moved. Pure helpers over chess.js;
// they build throwaway instances and never touch the live game.

import { Chess, type Move, type Square } from "chess.js";
import {
  findCastlingDrop,
  findLegalMoves,
  getDestinations,
  isPromotion,
  type Destinations,
} from "./chess-game.ts";

type Color = "w" | "b";

export type Premove = { from: Square; to: Square };

const NO_DESTINATIONS: Destinations = new Map();

/**
 * `game` with `color` to move instead, so the squares that side's pieces could
 * reach if the opponent passed can be listed. The en passant square is dropped
 * because it belongs to the side that would not be moving. Null if chess.js
 * rejects the resulting position.
 */
function withTurn(game: Chess, color: Color): Chess | null {
  const fields = game.fen().split(" ");
  if (fields.length < 4) return null;
  fields[1] = color;
  fields[3] = "-";
  try {
    return new Chess(fields.join(" "));
  } catch {
    return null;
  }
}

/**
 * Where the piece of `color` on `from` could go if it were that side's turn:
 * the squares offered while a premove is being chosen. Empty for an empty
 * square or the other side's piece.
 */
export function premoveDestinations(
  game: Chess,
  from: Square,
  color: Color,
): Destinations {
  if (game.get(from)?.color !== color) return NO_DESTINATIONS;
  const flipped = withTurn(game, color);
  if (!flipped) return NO_DESTINATIONS;
  // On a virtual board the opponent's king can be "in check" with the player to
  // move, which chess.js would let the player capture. Never offer that.
  const reachable = new Map<Square, { capture: boolean }>();
  for (const [square, info] of getDestinations(flipped, from)) {
    if (flipped.get(square)?.type !== "k") reachable.set(square, info);
  }
  return reachable;
}

/**
 * The move `premove` stands for in `game`, or null if it is not legal there. A
 * pawn reaching the last rank promotes to a queen. Castling by dropping the
 * king far along its rank counts, as in a game.
 */
function pickMove(game: Chess, premove: Premove): Move | null {
  let legal = findLegalMoves(game, premove.from, premove.to);
  if (legal.length === 0) legal = findCastlingDrop(game, premove.from, premove.to);
  if (legal.length === 0) return null;
  if (isPromotion(legal)) {
    return legal.find((move) => move.promotion === "q") ?? legal[0];
  }
  return legal[0];
}

/**
 * The SAN of `premove` if it is a legal move in `game` (the position after the
 * opponent's reply), otherwise null. A pawn reaching the last rank promotes to
 * a queen. Castling by dropping the king far along its rank counts, as in a
 * game.
 */
export function resolvePremove(game: Chess, premove: Premove): string | null {
  return pickMove(game, premove)?.san ?? null;
}

/**
 * The board after `color` plays `premove` and the opponent does nothing: a new
 * game with the opponent to move, or null if the move is not possible there
 * (not that side's piece, blocked, would expose its king, or would capture a
 * king). Never changes `game`.
 */
export function applyPremove(
  game: Chess,
  premove: Premove,
  color: Color,
): Chess | null {
  if (game.get(premove.from)?.color !== color) return null;
  const flipped = withTurn(game, color);
  if (!flipped) return null;
  const move = pickMove(flipped, premove);
  if (!move || flipped.get(move.to)?.type === "k") return null;
  try {
    flipped.move(move.san);
  } catch {
    return null;
  }
  return flipped;
}

export type VirtualBoard = {
  /** The board once every premove in `premoves` has been played. */
  game: Chess;
  /** The longest leading run of the queue that is possible, in order. */
  premoves: Premove[];
};

/**
 * Plays the queue on a copy of `game`, stopping at the first premove that is no
 * longer possible. What it returns is what the board should show while the
 * premoves wait. With an empty queue it is `game` itself.
 */
export function applyPremoves(
  game: Chess,
  premoves: readonly Premove[],
  color: Color,
): VirtualBoard {
  let board = game;
  const applied: Premove[] = [];
  for (const premove of premoves) {
    const next = applyPremove(board, premove, color);
    if (!next) break;
    board = next;
    applied.push(premove);
  }
  return { game: board, premoves: applied };
}

/**
 * The queue with `premove` added at the end, or null if it is not possible on
 * the board the queue leads to. The queue itself is not changed.
 */
export function addPremove(
  game: Chess,
  premoves: readonly Premove[],
  premove: Premove,
  color: Color,
): Premove[] | null {
  const virtual = applyPremoves(game, premoves, color);
  if (virtual.premoves.length !== premoves.length) return null;
  return applyPremove(virtual.game, premove, color)
    ? [...premoves, premove]
    : null;
}

/**
 * The longest leading run of `premoves` that is still possible from `game`.
 * Used after the opponent's reply has changed the position the rest of a queue
 * was chosen in: the first one that no longer works ends the queue.
 */
export function keepPossiblePremoves(
  game: Chess,
  premoves: readonly Premove[],
  color: Color,
): Premove[] {
  return applyPremoves(game, premoves, color).premoves;
}
