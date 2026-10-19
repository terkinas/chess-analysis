import Image from "next/image";
import { pieceImageUrl, type PieceSetId } from "../lib/appearance";
import { useAppearance } from "../lib/use-appearance";

export type PieceColor = "w" | "b";
export type PieceType = "K" | "Q" | "R" | "B" | "N" | "P";

/** Two-letter piece code that matches the asset name in `public/pieces/`. */
export type PieceCode = `${PieceColor}${PieceType}`;

const COLOR_NAMES: Record<PieceColor, string> = {
  w: "White",
  b: "Black",
};

const TYPE_NAMES: Record<PieceType, string> = {
  K: "king",
  Q: "queen",
  R: "rook",
  B: "bishop",
  N: "knight",
  P: "pawn",
};

type ChessPieceProps = {
  piece: PieceCode;
  /** Algebraic square (e.g. "e4"), used only to make the label more useful. */
  square?: string;
  /**
   * Render with empty alt text, for when a parent already labels the piece
   * (e.g. a board square's `aria-label`) and a second label would be read twice.
   */
  decorative?: boolean;
  /** Draw from this set instead of the saved one (settings previews). */
  set?: PieceSetId;
};

export function describePiece(piece: PieceCode, square?: string): string {
  const color = COLOR_NAMES[piece[0] as PieceColor];
  const type = TYPE_NAMES[piece[1] as PieceType];
  const name = `${color} ${type}`;
  return square ? `${name} on ${square}` : name;
}

// Fills its nearest positioned ancestor, so it must be rendered inside an
// element with `position: relative` (the board squares are).
export default function ChessPiece({
  piece,
  square,
  decorative = false,
  set,
}: ChessPieceProps) {
  const saved = useAppearance().pieceSet;
  return (
    <Image
      src={pieceImageUrl(set ?? saved, piece)}
      alt={decorative ? "" : describePiece(piece, square)}
      fill
      sizes="(min-width: 1024px) 92px, 12vw"
      loading="eager"
      unoptimized
      draggable={false}
      className="select-none object-contain p-[2%]"
    />
  );
}
