"use client";

import type { Color } from "chess.js";
import { PROMOTION_PIECES, type PromotionPiece } from "../lib/chess-game";
import ChessPiece, { describePiece, type PieceCode } from "./ChessPiece";
import Dialog from "./Dialog";

type PromotionPickerProps = {
  /** Colour of the promoting pawn, so the right set of pieces is shown. */
  color: Color;
  onSelect: (piece: PromotionPiece) => void;
  onCancel: () => void;
};

export default function PromotionPicker({
  color,
  onSelect,
  onCancel,
}: PromotionPickerProps) {
  return (
    <Dialog label="Choose a promotion piece" onClose={onCancel}>
      <h2 className="text-sm font-semibold text-foreground">Promote pawn to</h2>
      <div className="mt-4 grid grid-cols-4 gap-2">
        {PROMOTION_PIECES.map((piece, index) => {
          const code = `${color}${piece.toUpperCase()}` as PieceCode;
          return (
            <button
              key={piece}
              type="button"
              autoFocus={index === 0}
              aria-label={describePiece(code)}
              onClick={() => onSelect(piece)}
              className="relative aspect-square rounded-md bg-square-dark transition-colors hover:bg-square-light focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <ChessPiece piece={code} decorative />
            </button>
          );
        })}
      </div>
      <button
        type="button"
        onClick={onCancel}
        className="mt-4 w-full rounded-md border border-line px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        Cancel
      </button>
    </Dialog>
  );
}
