"use client";

import type { Color } from "chess.js";
import type { GameOutcome } from "../lib/chess-game";
import Dialog from "./Dialog";

type GameOverDialogProps = {
  outcome: GameOutcome;
  /** The side the human played, to word the result from their point of view. */
  humanColor: Color;
  /** Number of plies played. */
  plies: number;
  onPlayAgain: () => void;
  /** Open the analysis page with this game loaded. */
  onAnalyze: () => void;
  /** Close the dialog and step through the finished game. */
  onReview: () => void;
  /** Escape or a click on the backdrop: stay on the final position. */
  onClose: () => void;
};

function headline(outcome: GameOutcome, humanColor: Color): string {
  if (outcome.winner === null) return "Draw";
  return outcome.winner === humanColor ? "You win" : "You lose";
}

export default function GameOverDialog({
  outcome,
  humanColor,
  plies,
  onPlayAgain,
  onAnalyze,
  onReview,
  onClose,
}: GameOverDialogProps) {
  const title = headline(outcome, humanColor);
  const moveCount = Math.ceil(plies / 2);

  return (
    <Dialog label={`Game over: ${title}`} onClose={onClose}>
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      <p className="mt-1 text-sm text-foreground">{outcome.text}</p>
      {plies > 0 && (
        <p className="mt-1 text-xs text-muted">
          {moveCount} {moveCount === 1 ? "move" : "moves"} played
        </p>
      )}
      <div className="mt-5 flex flex-col gap-2">
        <button
          type="button"
          onClick={onAnalyze}
          className="rounded-md border border-line px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Analyze game
        </button>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onReview}
            className="rounded-md border border-line px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Review game
          </button>
          <button
            type="button"
            autoFocus
            onClick={onPlayAgain}
            className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-background transition-colors hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Play again
          </button>
        </div>
      </div>
    </Dialog>
  );
}
