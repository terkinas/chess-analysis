import { useEffect, useRef, type Ref, type RefObject } from "react";
import { toMovePairs } from "../lib/chess-game";
import type { EvaluationStatus } from "../lib/use-position-analysis";
import type { LineOption } from "../lib/analysis-session";
import type { LabelTone, MoveQualityLabel } from "../lib/move-quality-label";
import { describeWhiteScore, formatWhiteScore } from "../lib/uci-info";
import { labelPvMoves, pvStartFromFen, type PvLine } from "../lib/pv-format";

type AnalysisPanelProps = {
  /** The side to move in the position shown on the board. */
  turn: "w" | "b";
  /** e.g. "White to move", "Black to move — in check", "Checkmate — White wins". */
  statusText: string;
  /** Extra line for a draw that analysis can play on from, if any. */
  statusNote?: string;
  /** Show whose turn it is; false once the shown position is a finished game. */
  showTurn: boolean;
  /** Every SAN move on the analysis line, including those after the cursor. */
  moves: readonly string[];
  /** Plies shown on the board (0 = starting position). */
  ply: number;
  onSelectPly: (ply: number) => void;
  /** The main line and any variations; the selector shows only with 2 or more. */
  lines: readonly LineOption[];
  /** Which of `lines` is on the board. */
  activeLineId: number;
  onSelectLine: (id: number) => void;
  /**
   * For a variation, how many plies at the start of `moves` it shares with the
   * line it branched from (its own moves come after); null on the main line.
   */
  variationStart: number | null;
  onReset: () => void;
  /** Opens the PGN import dialog. */
  onImport: () => void;
  /** Lets the parent return focus here when the dialog closes. */
  importButtonRef?: Ref<HTMLButtonElement>;
  /** What the last import did, announced politely; empty when there is none. */
  importNotice?: string;
  /**
   * Quality of the move the cursor is on (see `moveQualityLabel`), or null when
   * there is nothing to show, such as at the start or while the engine's line
   * is on the board.
   */
  moveQuality?: MoveQualityLabel | null;
  /** Engine evaluation of the position on the board. */
  evaluation: EvaluationStatus;
  /** Starts an evaluation of the position on the board. */
  onEvaluate: () => void;
  /** Evaluate every position automatically, at a shallow depth. */
  autoEvaluate: boolean;
  onAutoEvaluateChange: (on: boolean) => void;
  /** Why there is nothing to evaluate (e.g. checkmate); undefined when there is. */
  evaluateUnavailable?: string;
  /**
   * How many moves of the engine's line are applied on the board, or null while
   * the board shows the game itself (the engine line is only a temporary view).
   */
  pvIndex: number | null;
  /** Steps through the engine's line; stepping forward from null enters it. */
  onPvStep: (delta: 1 | -1) => void;
  /** Shows the position after `index` moves of the engine's line. */
  onPvSelect: (index: number) => void;
  /** Leaves the engine line and returns to the game position. */
  onPvExit: () => void;
  /** False when the line no longer matches the position on the game board. */
  pvActionable: boolean;
  /** Plays the engine moves up to the selected one on the main line. */
  onPvPlay: () => void;
  /** Appends the whole engine line to the main line. */
  onPvAddLine: () => void;
};

type PvLineViewProps = {
  pv: PvLine;
  index: number | null;
  /** The game's own position, shown in the banner so the two stay distinct. */
  gamePositionText: string;
  actionable: boolean;
  onStep: (delta: 1 | -1) => void;
  onSelect: (index: number) => void;
  onExit: () => void;
  onPlay: () => void;
  onAddLine: () => void;
  /** A button that stays mounted after Play/Add, so focus has somewhere to go. */
  focusAfterApplyRef: RefObject<HTMLButtonElement | null>;
};

const DISABLEABLE =
  "aria-disabled:cursor-not-allowed aria-disabled:opacity-40 aria-disabled:hover:bg-transparent";

/** The engine's suggested line, numbered, with stepping controls. */
function PvLineView({
  pv,
  index,
  gamePositionText,
  actionable,
  onStep,
  onSelect,
  onExit,
  onPlay,
  onAddLine,
  focusAfterApplyRef,
}: PvLineViewProps) {
  // "Return to game", "Play this move" and "Add line" each remove the button
  // that was just used; move focus to a control that survives instead of
  // letting it fall back to the page.
  const nextRef = useRef<HTMLButtonElement>(null);
  const start = pvStartFromFen(pv.startFen);
  if (!start || pv.moves.length === 0) return null;
  const entries = labelPvMoves(
    start,
    pv.moves.map((move) => move.san),
  );
  const browsing = index !== null;
  const atStart = !browsing || index === 0;
  const atEnd = browsing && index === pv.moves.length;
  const selected = browsing && index > 0 ? entries[index - 1] : undefined;
  const canPlay = actionable && selected !== undefined;

  return (
    <div className="mt-2.5 border-t border-line pt-2.5">
      <p className="text-xs text-muted">Engine line</p>
      <div
        role="group"
        aria-label="Engine line"
        className="mt-1 flex flex-wrap items-baseline gap-x-0.5 gap-y-1"
      >
        {entries.map((entry) => (
          <span key={entry.index} className="inline-flex items-baseline">
            {entry.label && (
              <span className="mr-0.5 pl-1 font-mono text-xs tabular-nums text-muted">
                {entry.label}
              </span>
            )}
            <button
              type="button"
              aria-current={index === entry.index + 1 ? "step" : undefined}
              aria-label={`Engine line, ${entry.color === "w" ? "White" : "Black"}: ${entry.san}. Show position after this move.`}
              onClick={() => onSelect(entry.index + 1)}
              className={`rounded px-1.5 py-0.5 font-mono text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent ${
                index === entry.index + 1
                  ? "bg-accent font-semibold text-background"
                  : "text-foreground hover:bg-background"
              }`}
            >
              {entry.san}
            </button>
          </span>
        ))}
        {pv.stoppedEarly && (
          <span
            className="pl-1 text-xs text-muted"
            title="The engine sent a move that is not legal here, so the line stops."
          >
            … (line cut short)
          </span>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-label="Previous engine move"
          aria-disabled={atStart}
          onClick={() => {
            if (!atStart) onStep(-1);
          }}
          className={`${SMALL_BUTTON} aria-disabled:cursor-not-allowed aria-disabled:opacity-40 aria-disabled:hover:bg-transparent`}
        >
          ‹
        </button>
        <button
          type="button"
          ref={nextRef}
          aria-label="Next engine move"
          aria-disabled={atEnd}
          onClick={() => {
            if (!atEnd) onStep(1);
          }}
          className={`${SMALL_BUTTON} aria-disabled:cursor-not-allowed aria-disabled:opacity-40 aria-disabled:hover:bg-transparent`}
        >
          ›
        </button>
        {browsing ? (
          <button
            type="button"
            onClick={() => {
              nextRef.current?.focus();
              onExit();
            }}
            className={SMALL_BUTTON}
          >
            Return to game
          </button>
        ) : (
          <span className="text-xs text-muted">
            Step through the line on the board.
          </span>
        )}
      </div>

      <div
        role="group"
        aria-label="Apply engine line to the game"
        className="mt-2 flex flex-wrap items-center gap-2"
      >
        {browsing && (
          <button
            type="button"
            aria-disabled={!canPlay}
            aria-label={
              selected
                ? `Play this move: ${selected.san}`
                : "Play this move (step to an engine move first)"
            }
            onClick={() => {
              if (canPlay) {
                focusAfterApplyRef.current?.focus();
                onPlay();
              }
            }}
            className={`${SMALL_BUTTON} ${DISABLEABLE}`}
          >
            Play this move
          </button>
        )}
        <button
          type="button"
          aria-disabled={!actionable}
          aria-label={`Add line to analysis (${pv.moves.length} ${pv.moves.length === 1 ? "move" : "moves"})`}
          onClick={() => {
            if (actionable) {
              focusAfterApplyRef.current?.focus();
              onAddLine();
            }
          }}
          className={`${SMALL_BUTTON} ${DISABLEABLE}`}
        >
          Add line to analysis
        </button>
      </div>
      {browsing && selected && selected.index > 0 && (
        <p className="mt-1.5 text-xs text-muted">
          Playing a move here plays the engine line up to it ({selected.index + 1}{" "}
          moves), so the move is legal from your game position.
        </p>
      )}
      {!actionable && (
        <p className="mt-1.5 text-xs text-muted">
          This line is for a different position, so it can&rsquo;t be played.
        </p>
      )}
      {browsing && (
        <p
          role="status"
          className="mt-2 rounded-md border border-accent bg-background px-3 py-2 text-xs text-foreground"
        >
          Viewing the engine&rsquo;s line, not your game. Your moves and your
          place in them ({gamePositionText.toLowerCase()}) are unchanged until
          you play from the line. If it differs from the game&rsquo;s next
          move, it starts a variation; the original line is kept.
        </p>
      )}
    </div>
  );
}

const SMALL_BUTTON =
  "rounded-md border border-line px-2 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

const BUTTON =
  "rounded-md border border-line px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent aria-disabled:cursor-not-allowed aria-disabled:opacity-40 aria-disabled:hover:bg-transparent";

type MoveButtonProps = {
  san: string;
  /** 1-based ply of this move. */
  moveOrdinal: number;
  ply: number;
  onSelectPly: (ply: number) => void;
  /** True for a move that belongs to the variation itself, not to the shared start. */
  variation?: boolean;
};

function MoveButton({
  san,
  moveOrdinal,
  ply,
  onSelectPly,
  variation = false,
}: MoveButtonProps) {
  const current = moveOrdinal === ply;
  // Moves after the cursor are still on the line, just not on the board.
  const ahead = moveOrdinal > ply;
  return (
    <button
      type="button"
      aria-current={current ? "step" : undefined}
      aria-label={`Move ${Math.ceil(moveOrdinal / 2)}, ${moveOrdinal % 2 === 1 ? "White" : "Black"}: ${san}${variation ? " (variation)" : ""}`}
      onClick={() => onSelectPly(moveOrdinal)}
      className={`rounded px-2 py-1 text-left font-mono text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent ${
        current
          ? "bg-accent font-semibold text-background"
          : ahead
            ? "text-muted hover:bg-background"
            : variation
              ? "text-accent hover:bg-background"
              : "text-foreground hover:bg-background"
      }`}
    >
      {san}
    </button>
  );
}

const TONE_CLASS: Record<LabelTone, string> = {
  best: "text-accent",
  good: "text-foreground",
  inaccuracy: "text-board-select",
  mistake: "text-danger",
  pending: "text-muted",
  unavailable: "text-muted",
};

/** The compact quality label shown beside the current move. */
function MoveQualityBadge({ label }: { label: MoveQualityLabel }) {
  return (
    <span
      title={label.description}
      className={`inline-flex items-center gap-1.5 font-medium ${TONE_CLASS[label.tone]}`}
    >
      {label.pending ? (
        <Spinner />
      ) : (
        <span aria-hidden className="size-1.5 rounded-full bg-current" />
      )}
      {/* A placeholder is not announced; only the result is. */}
      <span aria-hidden={label.pending || undefined}>{label.text}</span>
      <span className="sr-only">
        {label.pending ? "" : label.description}
      </span>
    </span>
  );
}

function Spinner() {
  return (
    <span
      aria-hidden
      className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-muted border-t-transparent"
    />
  );
}

export default function AnalysisPanel({
  turn,
  statusText,
  statusNote,
  showTurn,
  moves,
  ply,
  onSelectPly,
  lines,
  activeLineId,
  onSelectLine,
  variationStart,
  onReset,
  onImport,
  importButtonRef,
  importNotice,
  moveQuality,
  evaluation,
  onEvaluate,
  autoEvaluate,
  onAutoEvaluateChange,
  evaluateUnavailable,
  pvIndex,
  onPvStep,
  onPvSelect,
  onPvExit,
  pvActionable,
  onPvPlay,
  onPvAddLine,
}: AnalysisPanelProps) {
  const listRef = useRef<HTMLOListElement>(null);
  const evaluateRef = useRef<HTMLButtonElement>(null);
  const pairs = toMovePairs(moves);
  const hasMoves = moves.length > 0;
  const atStart = ply === 0;
  const atEnd = ply === moves.length;
  const evaluating =
    evaluation.phase === "loading" || evaluation.phase === "thinking";
  const activeOption = lines.find((option) => option.id === activeLineId);
  const evaluateBlocked = evaluating || evaluateUnavailable !== undefined;

  // The san of the move that produced the position on the board.
  const shownMove = ply > 0 ? moves[ply - 1] : undefined;
  const positionText =
    shownMove === undefined
      ? "Starting position"
      : `After ${Math.ceil(ply / 2)}${ply % 2 === 1 ? "." : "…"} ${shownMove}`;

  // While the engine's line is on the board, say so instead of naming the
  // game position, so the two can never be confused.
  let headerPositionText = positionText;
  if (pvIndex !== null && evaluation.phase === "done") {
    const pv = evaluation.evaluation.pv;
    const start = pvStartFromFen(pv.startFen);
    const entry =
      start && pvIndex > 0
        ? labelPvMoves(
            start,
            pv.moves.map((move) => move.san),
          )[pvIndex - 1]
        : undefined;
    headerPositionText = entry
      ? `Engine line — after ${entry.number}${entry.color === "w" ? "." : "…"} ${entry.san}`
      : "Engine line — start (the game position)";
  }

  // Keep the highlighted move visible as the cursor moves or the line grows.
  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>('[aria-current="step"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [ply, moves.length]);

  return (
    <aside
      aria-label="Analysis information"
      className="flex flex-col overflow-hidden rounded-md border border-line bg-surface lg:h-0 lg:min-h-full"
    >
      <div className="border-b border-line px-4 py-3">
        <h1 className="text-xs font-medium uppercase tracking-widest text-muted">
          Analysis board
        </h1>
        <div role="status" className="mt-2.5 flex items-center gap-3">
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
            <p className="text-sm font-medium text-foreground">{statusText}</p>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
              <span>{headerPositionText}</span>
              {moveQuality && (
                <>
                  <span aria-hidden>·</span>
                  <MoveQualityBadge label={moveQuality} />
                </>
              )}
            </p>
            {statusNote && (
              <p className="mt-0.5 text-xs text-muted">{statusNote}</p>
            )}
          </div>
        </div>
      </div>

      <section
        aria-labelledby="analysis-moves-heading"
        className="flex min-h-48 flex-1 flex-col lg:min-h-0"
      >
        <div className="flex items-center justify-between gap-2 px-4 pb-2 pt-3.5">
          <h2
            id="analysis-moves-heading"
            className="text-xs font-medium uppercase tracking-widest text-muted"
          >
            Moves
          </h2>
          <button
            ref={importButtonRef}
            type="button"
            onClick={onImport}
            className={SMALL_BUTTON}
          >
            Import PGN
          </button>
        </div>

        {importNotice && (
          <p
            role="status"
            className="mx-4 mb-2 rounded-md border border-line bg-background px-3 py-2 text-xs text-muted"
          >
            {importNotice}
          </p>
        )}

        {lines.length > 1 && (
          <div className="mx-4 mb-2">
            <div
              role="group"
              aria-label="Analysis line"
              className="flex flex-wrap items-center gap-1.5"
            >
              <span className="text-xs text-muted">Line</span>
              {lines.map((option) => {
                const active = option.id === activeLineId;
                return (
                  <button
                    key={option.id}
                    type="button"
                    aria-pressed={active}
                    aria-label={
                      option.branch
                        ? `${option.name}, branches ${option.branch}`
                        : `${option.name} (the original game)`
                    }
                    title={option.branch ? `Branches ${option.branch}` : "The original game"}
                    onClick={() => onSelectLine(option.id)}
                    className={`rounded-md border px-2 py-1 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                      active
                        ? "border-accent bg-accent text-background"
                        : "border-line text-foreground hover:bg-background"
                    }`}
                  >
                    {option.short}
                  </button>
                );
              })}
            </div>
            <p className="mt-1.5 text-xs text-muted">
              {activeOption?.branch
                ? `${activeOption.name} branches ${activeOption.branch}. Earlier moves are shared with the line it came from.`
                : "Original game. Variations branch from it; it is never changed."}
            </p>
          </div>
        )}

        {hasMoves ? (
          <ol
            ref={listRef}
            aria-labelledby="analysis-moves-heading"
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
                  moveOrdinal={pair.number * 2 - 1}
                  ply={ply}
                  onSelectPly={onSelectPly}
                  variation={
                    variationStart !== null &&
                    pair.number * 2 - 1 > variationStart
                  }
                />
                {pair.black !== undefined ? (
                  <MoveButton
                    san={pair.black}
                    moveOrdinal={pair.number * 2}
                    ply={ply}
                    onSelectPly={onSelectPly}
                    variation={
                      variationStart !== null &&
                      pair.number * 2 > variationStart
                    }
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
              Move any piece to start analysing, or import a PGN. Moves will appear here.
            </p>
          </div>
        )}
      </section>

      <section
        aria-labelledby="analysis-engine-heading"
        className="border-t border-line px-4 py-3"
      >
        <div className="flex items-center justify-between gap-2">
          <h2
            id="analysis-engine-heading"
            className="text-xs font-medium uppercase tracking-widest text-muted"
          >
            Engine
          </h2>
          <button
            ref={evaluateRef}
            type="button"
            aria-disabled={evaluateBlocked}
            onClick={() => {
              if (!evaluateBlocked) onEvaluate();
            }}
            className={`${SMALL_BUTTON} aria-disabled:cursor-not-allowed aria-disabled:opacity-40 aria-disabled:hover:bg-transparent`}
          >
            Evaluate position
          </button>
        </div>
        <label className="mt-2 flex cursor-pointer items-center gap-2 text-xs text-muted">
          <button
            type="button"
            role="switch"
            aria-checked={autoEvaluate}
            aria-label="Auto-evaluate"
            onClick={() => onAutoEvaluateChange(!autoEvaluate)}
            className={`relative h-5 w-9 shrink-0 rounded-full border border-line transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
              autoEvaluate ? "bg-accent" : "bg-background"
            }`}
          >
            <span
              aria-hidden
              className={`absolute left-0.5 top-0.5 h-3.5 w-3.5 rounded-full bg-foreground transition-transform ${
                autoEvaluate ? "translate-x-4" : ""
              }`}
            />
          </button>
          <span aria-hidden>
            Auto-evaluate{" "}
            <span className="opacity-70">(quick, depth 8)</span>
          </span>
        </label>
        <div role="status" className="mt-2 min-h-10 text-xs text-muted">
          {evaluateUnavailable !== undefined ? (
            <p>{evaluateUnavailable}. Nothing to evaluate.</p>
          ) : evaluation.phase === "loading" ? (
            <p className="flex items-center gap-2">
              <Spinner />
              Starting engine…
            </p>
          ) : evaluation.phase === "thinking" ? (
            <p className="flex items-center gap-2">
              <Spinner />
              Evaluating…
            </p>
          ) : evaluation.phase === "error" ? (
            <p className="text-foreground">
              Evaluation failed: {evaluation.message}. You can try again.
            </p>
          ) : evaluation.phase === "done" ? (
            <div>
              <p className="text-foreground">
                <span
                  className="font-mono text-base font-semibold tabular-nums"
                  title={describeWhiteScore(evaluation.evaluation.score)}
                >
                  {formatWhiteScore(evaluation.evaluation.score)}
                </span>
                <span className="ml-2 text-sm">
                  {describeWhiteScore(evaluation.evaluation.score)}
                </span>
              </p>
              <p className="mt-1">
                Best move:{" "}
                <span className="font-mono text-sm font-semibold text-foreground">
                  {evaluation.evaluation.bestMoveSan}
                </span>{" "}
                (suggestion only) · depth {evaluation.evaluation.depth}
              </p>
              <PvLineView
                pv={evaluation.evaluation.pv}
                index={pvIndex}
                gamePositionText={positionText}
                actionable={pvActionable}
                onStep={onPvStep}
                onSelect={onPvSelect}
                onExit={onPvExit}
                onPlay={onPvPlay}
                onAddLine={onPvAddLine}
                focusAfterApplyRef={evaluateRef}
              />
            </div>
          ) : (
            <p>Scores are from White&rsquo;s point of view.</p>
          )}
        </div>
      </section>

      <div
        role="group"
        aria-label="Game navigation"
        className="grid grid-cols-3 gap-2 border-t border-line p-4"
      >
        {/* aria-disabled rather than disabled: a button the keyboard has
            just used must not vanish from the tab order at either end of the
            line, which would drop focus back to the page. */}
        <button
          type="button"
          aria-label="Previous game move"
          aria-disabled={atStart}
          onClick={() => {
            if (!atStart) onSelectPly(ply - 1);
          }}
          className={BUTTON}
        >
          <span aria-hidden>‹ </span>Previous
        </button>
        <button
          type="button"
          aria-label="Next game move"
          aria-disabled={atEnd}
          onClick={() => {
            if (!atEnd) onSelectPly(ply + 1);
          }}
          className={BUTTON}
        >
          Next<span aria-hidden> ›</span>
        </button>
        <button
          type="button"
          aria-disabled={!hasMoves}
          onClick={() => {
            if (hasMoves) onReset();
          }}
          className={BUTTON}
        >
          Reset
        </button>
      </div>
    </aside>
  );
}
