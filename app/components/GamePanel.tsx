import { useEffect, useRef } from "react";
import { describeHistoryPosition, toMovePairs } from "../lib/chess-game";
import type { EngineOpponentStatus } from "../lib/use-engine-opponent";

type GamePanelProps = {
  /** The side to move in the live game. */
  turn: "w" | "b";
  /** e.g. "White to move", "Black to move — in check", "Checkmate — White wins". */
  statusText: string;
  /** Show whose turn it is; false before a game starts and once it has ended. */
  showTurn: boolean;
  /** SAN moves of the live game. */
  moves: readonly string[];
  /** Plies shown on the board; equals `moves.length` for the live position. */
  shownPly: number;
  /** True while browsing an earlier position. */
  isViewing: boolean;
  onSelectPly: (ply: number) => void;
  onUndo: () => void;
  onNewGame: () => void;
  onCopyPgn: () => void;
  onDownloadPgn: () => void;
  /** Result of the last PGN action, announced politely. */
  pgnNotice: string;
  engineStatus: EngineOpponentStatus;
  onRetryEngine: () => void;
  /** Undo is unavailable when there is nothing to hand back to the human. */
  canUndo: boolean;
  /** Resign is available only while a game is in progress. */
  canResign: boolean;
  onResign: () => void;
  /** Open the analysis page on this game. */
  onAnalyze: () => void;
  /** True while the game is being saved for analysis. */
  analyzing: boolean;
  /** New Game does nothing before a game starts (setup is already open). */
  newGameDisabled: boolean;
};

const SECONDARY_BUTTON =
  "rounded-md border border-line px-2 py-2 text-xs font-medium text-foreground transition-colors hover:bg-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent";

type MoveButtonProps = {
  san: string;
  ply: number;
  shownPly: number;
  onSelectPly: (ply: number) => void;
};

function MoveButton({ san, ply, shownPly, onSelectPly }: MoveButtonProps) {
  const current = ply === shownPly;
  return (
    <button
      type="button"
      aria-current={current ? "step" : undefined}
      aria-label={`Move ${Math.ceil(ply / 2)}, ${ply % 2 === 1 ? "White" : "Black"}: ${san}`}
      onClick={() => onSelectPly(ply)}
      className={`rounded px-2 py-1 text-left font-mono text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent ${
        current
          ? "bg-accent font-semibold text-background"
          : "text-foreground hover:bg-background"
      }`}
    >
      {san}
    </button>
  );
}

export default function GamePanel({
  turn,
  statusText,
  showTurn,
  moves,
  shownPly,
  isViewing,
  onSelectPly,
  onUndo,
  onNewGame,
  onCopyPgn,
  onDownloadPgn,
  pgnNotice,
  engineStatus,
  onRetryEngine,
  canUndo,
  canResign,
  onResign,
  onAnalyze,
  analyzing,
  newGameDisabled,
}: GamePanelProps) {
  const listRef = useRef<HTMLOListElement>(null);
  const lastMove = moves[moves.length - 1];
  const pairs = toMovePairs(moves);
  const hasMoves = moves.length > 0;

  // Keep the highlighted move visible as the game grows or the cursor moves.
  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>('[aria-current="step"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [shownPly, moves.length]);

  return (
    <aside
      aria-label="Game information"
      className="flex flex-col overflow-hidden rounded-md border border-line bg-surface lg:h-0 lg:min-h-full"
    >
      <div
        role="status"
        className="flex items-center gap-3 border-b border-line px-4 py-3"
      >
        {showTurn && (
          <span
            aria-hidden
            className={`size-3.5 shrink-0 rounded-full border ${
              turn === "w"
                ? "border-board-light bg-board-light"
                : "border-muted bg-background"
            }`}
          />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">
            {statusText}
            {lastMove && (
              <span className="sr-only">{`. Last move: ${lastMove}.`}</span>
            )}
          </p>
          {engineStatus.phase !== "idle" && (
            <p className="mt-0.5 text-xs text-muted">
              {engineStatus.phase === "loading" && "Loading Stockfish…"}
              {engineStatus.phase === "thinking" && "Stockfish is thinking…"}
              {engineStatus.phase === "error" && engineStatus.message}
            </p>
          )}
        </div>
        {engineStatus.phase === "error" && (
          <button
            type="button"
            onClick={onRetryEngine}
            className="shrink-0 text-xs font-semibold text-accent hover:text-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Retry
          </button>
        )}
      </div>

      <section
        aria-labelledby="moves-heading"
        className="flex min-h-48 flex-1 flex-col border-t border-line lg:min-h-0"
      >
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 px-4 pb-2 pt-3.5">
          <h2
            id="moves-heading"
            className="text-xs font-medium uppercase tracking-widest text-muted"
          >
            Moves
          </h2>
          <div className="flex flex-wrap justify-end gap-1">
            <button
              type="button"
              disabled={!canUndo}
              onClick={onUndo}
              className={SECONDARY_BUTTON}
            >
              Undo
            </button>
            <button
              type="button"
              disabled={!hasMoves}
              onClick={onCopyPgn}
              className={SECONDARY_BUTTON}
            >
              Copy PGN
            </button>
            <button
              type="button"
              disabled={!hasMoves}
              onClick={onDownloadPgn}
              className={SECONDARY_BUTTON}
            >
              Download
            </button>
            <button
              type="button"
              disabled={!hasMoves || analyzing}
              onClick={onAnalyze}
              className={SECONDARY_BUTTON}
            >
              {analyzing ? "Opening…" : "Analyze"}
            </button>
          </div>
        </div>
        <p role="status" className="-mt-1 min-h-4 px-4 pb-1 text-xs text-muted">
          {pgnNotice}
        </p>

        {isViewing && (
          <div className="mx-4 mb-2 flex items-center justify-between gap-3 rounded-md border border-line bg-background px-3 py-2">
            <p className="text-xs text-muted">
              {describeHistoryPosition(shownPly, moves.length)}
            </p>
            <button
              type="button"
              onClick={() => onSelectPly(moves.length)}
              className="shrink-0 text-xs font-semibold text-accent hover:text-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              Return to current
            </button>
          </div>
        )}

        {hasMoves ? (
          <ol
            ref={listRef}
            aria-labelledby="moves-heading"
            className="max-h-72 flex-1 overflow-y-auto px-2 pb-3 lg:max-h-none lg:min-h-0"
          >
            {pairs.map((pair) => (
              <li
                key={pair.number}
                className="grid grid-cols-[2.25rem_1fr_1fr] items-center gap-1"
              >
                <span className="pl-2 font-mono text-xs tabular-nums text-muted">
                  {pair.number}.
                </span>
                <MoveButton
                  san={pair.white}
                  ply={pair.number * 2 - 1}
                  shownPly={shownPly}
                  onSelectPly={onSelectPly}
                />
                {pair.black !== undefined ? (
                  <MoveButton
                    san={pair.black}
                    ply={pair.number * 2}
                    shownPly={shownPly}
                    onSelectPly={onSelectPly}
                  />
                ) : (
                  <span />
                )}
              </li>
            ))}
          </ol>
        ) : (
          <div className="flex flex-1 items-center justify-center px-4 pb-6">
            <p className="text-center text-sm text-muted">
              Moves will appear here once a game begins.
            </p>
          </div>
        )}
      </section>

      <div className="flex flex-col gap-2 border-t border-line p-4">
        <div className="grid grid-cols-4 gap-2">
          <button
            type="button"
            aria-label="First position"
            disabled={shownPly === 0}
            onClick={() => onSelectPly(0)}
            className={SECONDARY_BUTTON}
          >
            «
          </button>
          <button
            type="button"
            aria-label="Previous move"
            disabled={shownPly === 0}
            onClick={() => onSelectPly(shownPly - 1)}
            className={SECONDARY_BUTTON}
          >
            ‹
          </button>
          <button
            type="button"
            aria-label="Next move"
            disabled={!isViewing}
            onClick={() => onSelectPly(shownPly + 1)}
            className={SECONDARY_BUTTON}
          >
            ›
          </button>
          <button
            type="button"
            aria-label="Current position"
            disabled={!isViewing}
            onClick={() => onSelectPly(moves.length)}
            className={SECONDARY_BUTTON}
          >
            »
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={!canResign}
            onClick={onResign}
            className="rounded-md border border-line px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
          >
            Resign
          </button>
          <button
            type="button"
            disabled={newGameDisabled}
            onClick={onNewGame}
            className="rounded-md bg-accent px-4 py-2.5 text-sm font-semibold text-background transition-colors hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-accent"
          >
            New Game
          </button>
        </div>
      </div>
    </aside>
  );
}
