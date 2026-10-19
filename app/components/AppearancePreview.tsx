import type { PieceSetId } from "../lib/appearance";
import ChessPiece, { type PieceCode } from "./ChessPiece";

// A fixed position after 1.e4 e5, rank 8 first. Upper case = White.
const SAMPLE_RANKS = [
  "rnbqkbnr",
  "pppp.ppp",
  "........",
  "....p...",
  "....P...",
  "........",
  "PPPP.PPP",
  "RNBQKBNR",
] as const;

const FILES = "abcdefgh";
const LAST_MOVE = new Set(["e7", "e5"]);
const SELECTED = "g1";
const HINTS = new Set(["f3", "h3"]);

function pieceAt(file: number, rankIndex: number): PieceCode | null {
  const char = SAMPLE_RANKS[rankIndex][file];
  if (char === ".") return null;
  const isWhite = char === char.toUpperCase();
  return `${isWhite ? "w" : "b"}${char.toUpperCase()}` as PieceCode;
}

type BoardPreviewProps = {
  pieceSet: PieceSetId;
  className?: string;
};

/**
 * A small board in the live board colours (the CSS variables set on <html>),
 * showing a selected piece, its move hints and a last move, so the user sees
 * how highlights read on the chosen colours. It draws squares with the same
 * utilities and overlay colours as the real Chessboard.
 */
export function BoardPreview({ pieceSet, className = "" }: BoardPreviewProps) {
  return (
    <div
      role="img"
      aria-label="Preview board showing the chosen pieces and colours"
      className={`grid aspect-square w-full grid-cols-8 grid-rows-8 overflow-hidden rounded-sm shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_18px_40px_-24px_rgba(0,0,0,0.9)] ${className}`}
    >
      {SAMPLE_RANKS.map((_, row) =>
        Array.from({ length: 8 }, (_, col) => {
          const square = `${FILES[col]}${8 - row}`;
          const piece = pieceAt(col, row);
          const isDark = (row + col) % 2 === 1;
          return (
            <div
              key={square}
              className={`relative ${isDark ? "bg-square-dark" : "bg-square-light"}`}
            >
              {LAST_MOVE.has(square) && (
                <span className="absolute inset-0 bg-board-last/45" />
              )}
              {square === SELECTED && (
                <span className="absolute inset-0 bg-board-select/55" />
              )}
              {piece && (
                <span className="absolute inset-0">
                  <ChessPiece piece={piece} set={pieceSet} decorative />
                </span>
              )}
              {HINTS.has(square) && (
                <span className="absolute inset-[35%] rounded-full bg-black/30" />
              )}
            </div>
          );
        }),
      )}
    </div>
  );
}

const STRIP_PIECES = ["K", "Q", "R", "B", "N", "P"] as const;

/**
 * Two rows of all six piece types (White above Black) on alternating squares
 * in the live board colours: the thumbnail for one piece-set choice.
 */
export function PieceStrip({ pieceSet }: { pieceSet: PieceSetId }) {
  return (
    <div
      aria-hidden
      className="grid grid-cols-6 overflow-hidden rounded-sm"
    >
      {(["w", "b"] as const).flatMap((color, row) =>
        STRIP_PIECES.map((type, col) => (
          <div
            key={`${color}${type}`}
            className={`relative aspect-square ${
              (row + col) % 2 === 1 ? "bg-square-dark" : "bg-square-light"
            }`}
          >
            <ChessPiece
              piece={`${color}${type}` as PieceCode}
              set={pieceSet}
              decorative
            />
          </div>
        )),
      )}
    </div>
  );
}
