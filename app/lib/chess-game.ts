import {
  Chess,
  type Color,
  type Move,
  type PieceSymbol,
  type Square,
} from "chess.js";
import type { PieceCode, PieceType } from "../components/ChessPiece";

// Thin, framework-free helpers around chess.js. Every rule decision (legal
// moves, check, checkmate, draws, castling, en passant, promotion) comes from
// chess.js; nothing here re-implements chess rules.

/** Rows run from rank 8 down to rank 1; columns run from file a to h. */
export type Position = readonly (readonly (PieceCode | null)[])[];

/** Legal destination squares for one piece, keyed by square. */
export type Destinations = ReadonlyMap<Square, { capture: boolean }>;

export type GameStatus = {
  /** The side to move. */
  turn: Color;
  isOver: boolean;
  /** Human-readable summary, e.g. "White to move" or "Checkmate — Black wins". */
  text: string;
};

/** How a finished game ended. `winner` is null for every kind of draw. */
export type GameOutcome = {
  kind: "checkmate" | "stalemate" | "draw" | "timeout" | "resignation";
  winner: Color | null;
  /** Same wording as the status line, e.g. "Draw by stalemate". */
  text: string;
};

const COLOR_NAMES: Record<Color, string> = {
  w: "White",
  b: "Black",
};

const PIECE_TYPES: Record<PieceSymbol, PieceType> = {
  p: "P",
  n: "N",
  b: "B",
  r: "R",
  q: "Q",
  k: "K",
};

/**
 * Rebuilds a game from its SAN move list. The move list is the source of truth
 * in React state, so the `Chess` instance is derived and never mutated by the UI.
 */
export function replay(moves: readonly string[]): Chess {
  const game = new Chess();
  for (const san of moves) {
    game.move(san);
  }
  return game;
}

/** Converts chess.js's board into the piece codes used by the SVG assets. */
export function toPosition(game: Chess): Position {
  return game
    .board()
    .map((rank) =>
      rank.map((cell) =>
        cell ? (`${cell.color}${PIECE_TYPES[cell.type]}` as const) : null,
      ),
    );
}

/** True when `square` holds a piece belonging to the side to move. */
export function canSelect(game: Chess, square: Square): boolean {
  return !game.isGameOver() && game.get(square)?.color === game.turn();
}

/** Legal destinations for the piece on `from`, as reported by chess.js. */
export function getDestinations(game: Chess, from: Square): Destinations {
  const destinations = new Map<Square, { capture: boolean }>();
  for (const move of game.moves({ square: from, verbose: true })) {
    // chess.js reports en passant separately from ordinary captures.
    destinations.set(move.to, {
      capture: move.isCapture() || move.isEnPassant(),
    });
  }
  return destinations;
}

/** One piece's visual glide from `from` to `to` when a move is played. */
export type MoveSlide = { from: Square; to: Square };

/**
 * The glides that make up playing `san` in `game` (before the move): the moving
 * piece, plus the rook when castling. Captures, en passant and promotion are the
 * mover's glide alone: the captured piece just disappears.
 */
export function getMoveSlides(game: Chess, san: string): MoveSlide[] {
  const move = game.moves({ verbose: true }).find((m) => m.san === san);
  if (!move) return [];
  const slides: MoveSlide[] = [{ from: move.from, to: move.to }];
  const castleKingside = move.isKingsideCastle();
  if (castleKingside || move.isQueensideCastle()) {
    const rank = move.color === "w" ? "1" : "8";
    slides.push(
      castleKingside
        ? { from: `h${rank}` as Square, to: `f${rank}` as Square }
        : { from: `a${rank}` as Square, to: `d${rank}` as Square },
    );
  }
  return slides;
}

/**
 * The glides for stepping the history cursor by exactly one ply, forward or
 * back, so the board can animate the move that was just revealed or taken back.
 * Going forward plays the move at index `fromPly`; going back reverses the move
 * at index `toPly`, so every glide runs from where the piece stood in the old
 * view to where it stands in the new one. Any other jump (first/last position,
 * a distant move) returns no glides: those snap.
 */
export function getStepSlides(
  moves: readonly string[],
  fromPly: number,
  toPly: number,
): MoveSlide[] {
  if (Math.abs(toPly - fromPly) !== 1) return [];
  const forward = toPly > fromPly;
  const index = forward ? fromPly : toPly;
  const san = moves[index];
  if (index < 0 || san === undefined) return [];
  const slides = getMoveSlides(replay(moves.slice(0, index)), san);
  return forward ? slides : slides.map(({ from, to }) => ({ from: to, to: from }));
}

/** Wording for the history cursor: `shownPly` plies of `totalPlies` are on show. */
export function describeHistoryPosition(
  shownPly: number,
  totalPlies: number,
): string {
  return shownPly === 0
    ? "Viewing the starting position"
    : `Viewing move ${Math.ceil(shownPly / 2)} of ${Math.ceil(totalPlies / 2)}`;
}

/** The squares of the last move played in `game`, or null before any move. */
export type LastMove = { from: Square; to: Square };

/**
 * From/to of the most recent move, as recorded by chess.js. Castling reports
 * the king's squares; en passant and promotion report the pawn's own from/to.
 * Works for any `game` built by playing moves (see `replay`).
 */
export function getLastMove(game: Chess): LastMove | null {
  const history = game.history({ verbose: true });
  const last = history[history.length - 1];
  return last ? { from: last.from, to: last.to } : null;
}

/** Piece types a pawn may promote to, in picker order. */
export const PROMOTION_PIECES = ["q", "r", "b", "n"] as const;
export type PromotionPiece = (typeof PROMOTION_PIECES)[number];

/**
 * Every legal move from `from` to `to` as reported by chess.js. Ordinary
 * moves yield one entry; a promotion yields one per piece (q, r, b, n).
 */
export function findLegalMoves(game: Chess, from: Square, to: Square): Move[] {
  return game
    .moves({ square: from, verbose: true })
    .filter((move) => move.to === to);
}

/**
 * The castling move a king drop stands for, as a one-element list (empty when
 * the drop is not a castling gesture or castling is not legal right now).
 *
 * Two gestures count, both along the king's own rank: dropping the king more
 * than two squares to one side (two squares is already an ordinary legal
 * destination), or dropping it on its own corner rook. The side picks kingside
 * or queenside; chess.js then decides whether that castling move is legal, so
 * rights, clear squares and checks are never judged here.
 */
export function findCastlingDrop(game: Chess, from: Square, to: Square): Move[] {
  const king = game.get(from);
  if (!king || king.type !== "k" || king.color !== game.turn()) return [];
  if (from[1] !== to[1]) return [];
  const dx = to.charCodeAt(0) - from.charCodeAt(0);
  if (dx === 0) return [];
  const kingside = dx > 0;
  const target = game.get(to);
  const onOwnCornerRook =
    target?.type === "r" &&
    target.color === king.color &&
    to[0] === (kingside ? "h" : "a");
  if (Math.abs(dx) <= 2 && !onOwnCornerRook) return [];
  return game
    .moves({ square: from, verbose: true })
    .filter((move) =>
      kingside ? move.isKingsideCastle() : move.isQueensideCastle(),
    );
}

/** True when the move needs the player to choose a promotion piece. */
export function isPromotion(moves: readonly Move[]): boolean {
  return moves.some((move) => move.promotion !== undefined);
}

/** Groups a SAN list into numbered White/Black pairs. */
export type MovePair = {
  number: number;
  white: string;
  black?: string;
};

export function toMovePairs(moves: readonly string[]): MovePair[] {
  const pairs: MovePair[] = [];
  for (let i = 0; i < moves.length; i += 2) {
    pairs.push({ number: i / 2 + 1, white: moves[i], black: moves[i + 1] });
  }
  return pairs;
}

/**
 * PGN result token for a finished game, or "*" while it is in progress. A side
 * that ran out of time or resigned (`forfeited`) loses unless chess.js says the
 * game had already ended on the board.
 */
export function pgnResult(game: Chess, forfeited: Color | null): string {
  if (game.isCheckmate()) return game.turn() === "w" ? "0-1" : "1-0";
  if (game.isDraw()) return "1/2-1/2";
  if (forfeited) return forfeited === "w" ? "0-1" : "1-0";
  return "*";
}

/** Exports the game as PGN, with chess.js producing the movetext. */
export function toPgn(
  moves: readonly string[],
  date: Date,
  players: { white: string; black: string } = { white: "White", black: "Black" },
  timedOut: Color | null = null,
  resigned: Color | null = null,
): string {
  const game = replay(moves);
  const pad = (n: number) => String(n).padStart(2, "0");
  game.setHeader("Event", "Casual Game");
  game.setHeader(
    "Date",
    `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())}`,
  );
  game.setHeader("White", players.white);
  game.setHeader("Black", players.black);
  game.setHeader("Result", pgnResult(game, timedOut ?? resigned));
  if (timedOut && !game.isGameOver()) {
    game.setHeader("Termination", "time forfeit");
  }
  return game.pgn();
}

/**
 * How the game ended, or null while it is in progress. Every board outcome is
 * decided by chess.js; `timedOut` is the side whose clock ran out and `resigned`
 * the side that resigned. Both only count if the position on the board is still
 * undecided.
 */
export function getOutcome(
  game: Chess,
  timedOut: Color | null = null,
  resigned: Color | null = null,
): GameOutcome | null {
  if (game.isCheckmate()) {
    const winner: Color = game.turn() === "w" ? "b" : "w";
    return {
      kind: "checkmate",
      winner,
      text: `Checkmate — ${COLOR_NAMES[winner]} wins`,
    };
  }
  if (game.isStalemate()) {
    return { kind: "stalemate", winner: null, text: "Draw by stalemate" };
  }
  if (game.isDrawByFiftyMoves()) {
    return { kind: "draw", winner: null, text: "Draw — fifty-move rule" };
  }
  if (game.isInsufficientMaterial()) {
    return { kind: "draw", winner: null, text: "Draw — insufficient material" };
  }
  if (game.isThreefoldRepetition()) {
    return { kind: "draw", winner: null, text: "Draw by repetition" };
  }
  if (game.isDraw()) {
    return { kind: "draw", winner: null, text: "Draw" };
  }
  if (resigned) {
    const winner: Color = resigned === "w" ? "b" : "w";
    return {
      kind: "resignation",
      winner,
      text: `Resignation — ${COLOR_NAMES[winner]} wins`,
    };
  }
  if (timedOut) {
    const winner: Color = timedOut === "w" ? "b" : "w";
    return {
      kind: "timeout",
      winner,
      text: `Time out — ${COLOR_NAMES[winner]} wins`,
    };
  }
  return null;
}

export function getStatus(
  game: Chess,
  timedOut: Color | null = null,
  resigned: Color | null = null,
): GameStatus {
  const turn = game.turn();
  const outcome = getOutcome(game, timedOut, resigned);
  if (outcome) return { turn, isOver: true, text: outcome.text };

  const mover = COLOR_NAMES[turn];
  if (game.isCheck()) {
    return { turn, isOver: false, text: `${mover} to move — in check` };
  }
  return { turn, isOver: false, text: `${mover} to move` };
}

/** Status of a position on the analysis board. */
export type AnalysisStatus = GameStatus & {
  /** Set when the position counts as a draw that analysis can play on from. */
  note?: string;
};

/**
 * Like `getStatus`, but for free analysis: only checkmate and stalemate end
 * it, because only then is there no legal move left. A draw by repetition, the
 * fifty-move rule or insufficient material is reported as a `note` and the
 * position stays playable. Every decision still comes from chess.js.
 */
export function getAnalysisStatus(game: Chess): AnalysisStatus {
  if (game.isCheckmate() || game.isStalemate()) return getStatus(game);

  const turn = game.turn();
  const mover = COLOR_NAMES[turn];
  const text = game.isCheck()
    ? `${mover} to move — in check`
    : `${mover} to move`;
  // Checkmate and stalemate are ruled out above, so any outcome left is a draw.
  const draw = getOutcome(game);
  return {
    turn,
    isOver: false,
    text,
    note: draw ? `${draw.text}. Analysis can continue.` : undefined,
  };
}

/**
 * Validates an engine-suggested UCI move against chess.js for the position in
 * `fen`. Returns the legal move (with its SAN), or null if the move is not
 * legal there, so a stale or bogus engine reply is never accepted.
 */
export function resolveUciMove(
  fen: string,
  move: { from: string; to: string; promotion?: string },
): Move | null {
  let game: Chess;
  try {
    game = new Chess(fen);
  } catch {
    return null;
  }
  return (
    game
      .moves({ verbose: true })
      .find(
        (m) =>
          m.from === move.from &&
          m.to === move.to &&
          m.promotion === move.promotion,
      ) ?? null
  );
}

/**
 * How many moves should remain after "undo" in a human-vs-engine game, or null
 * when there is nothing sensible to undo. Undo always hands control back to the
 * human: if the human made the last move (the engine has not replied yet, or the
 * game just ended) only that move is removed; if the engine made it, its move
 * and the human move it answered are removed together. Pure ply arithmetic —
 * no chess rules involved.
 */
export function getUndoLength(moveCount: number, human: Color): number | null {
  if (moveCount === 0) return null;
  const lastMoveBy: Color = moveCount % 2 === 1 ? "w" : "b";
  const target = moveCount - (lastMoveBy === human ? 1 : 2);
  // A negative target means only the engine's opening move is on the board
  // (human plays Black): undoing it would just hand the turn back to the engine.
  return target >= 0 ? target : null;
}

/** True once the human has made at least one move in the current game. */
export function hasHumanMoved(moveCount: number, human: Color): boolean {
  return moveCount >= (human === "w" ? 1 : 2);
}
