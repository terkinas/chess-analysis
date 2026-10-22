import { useEffect, useRef, type Ref, type RefObject } from "react";
import { toMovePairs } from "../lib/chess-game";
import { revealInContainer } from "../lib/scroll-within";
import type { EvaluationStatus } from "../lib/use-position-analysis";
import type { LineOption } from "../lib/analysis-session";
import type { AnalyzedMove, GameSummary } from "../lib/game-analysis";
import { NOTABLE_ORDER, QUALITY_MARK, markFor } from "../lib/quality-style";
import EvalGraph from "./EvalGraph";
import GameNavigation from "./GameNavigation";
import MoveExplanationCard from "./MoveExplanationCard";
import type { LineKind, MoveExplanation } from "../lib/move-explanation";
import type { MoveQuality } from "../lib/move-classification";
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
  /** The side at the bottom of the board, to word the flip button. */
  boardOrientation: "w" | "b";
  /** Turns the board around to the other side's point of view. */
  onFlipBoard: () => void;
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
  /**
   * Set for a move rated inaccuracy, mistake or blunder when the engine's reply
   * is known: adds that reply to the analysis as a variation, to show why.
   */
  mistakeLine?: { count: number; onAdd: () => void } | null;
  /** Why the move at the cursor got its rating, once it has one. */
  explanation?: MoveExplanation | null;
  /** The explanation's line now on the board, if any. */
  explanationLine?: { kind: LineKind; index: number } | null;
  onShowExplanationLine?: (kind: LineKind) => void;
  onSelectExplanationLineIndex?: (index: number) => void;
  onStepExplanationLine?: (delta: 1 | -1) => void;
  onCloseExplanationLine?: () => void;
  /** The judgement of each move of the line, in order; unjudged ones are empty. */
  analyses: readonly (AnalyzedMove | null | undefined)[];
  /** Accuracy and flagged-move counts for each player, over the judged moves. */
  gameSummary: GameSummary;
  /** Moves judged so far, of `analysisTotal` moves in the line. */
  analysisDone: number;
  analysisTotal: number;
  /** True while the moves are still being judged. */
  analysisRunning: boolean;
  /** The engine error that stopped the game analysis, or null. */
  analysisFailure: string | null;
  /** Starts judging every move of the line. */
  onAnalyzeGame: () => void;
  /** Player names from the PGN headers; null when a name is not known. */
  playerNames: { white: string | null; black: string | null };
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

const PRIMARY_SMALL =
  "rounded-md border border-accent bg-accent px-2 py-1.5 text-xs font-medium text-background transition-colors hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent aria-disabled:hover:bg-accent";

type MoveButtonProps = {
  san: string;
  /** 1-based ply of this move. */
  moveOrdinal: number;
  ply: number;
  onSelectPly: (ply: number) => void;
  /** True for a move that belongs to the variation itself, not to the shared start. */
  variation?: boolean;
  /** The move's quality once judged; only the flagged ones are coloured. */
  quality?: MoveQuality | null;
};

function MoveButton({
  san,
  moveOrdinal,
  ply,
  onSelectPly,
  variation = false,
  quality = null,
}: MoveButtonProps) {
  const current = moveOrdinal === ply;
  // Moves after the cursor are still on the line, just not on the board.
  const ahead = moveOrdinal > ply;
  const mark = markFor(quality);
  return (
    <button
      type="button"
      aria-current={current ? "step" : undefined}
      aria-label={`Move ${Math.ceil(moveOrdinal / 2)}, ${moveOrdinal % 2 === 1 ? "White" : "Black"}: ${san}${variation ? " (variation)" : ""}${mark ? `, ${mark.label.toLowerCase()}` : ""}`}
      title={mark?.label}
      onClick={() => onSelectPly(moveOrdinal)}
      className={`rounded px-2 py-1 text-left font-mono text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent ${
        current
          ? "bg-accent font-semibold text-background"
          : mark
            ? `${mark.text} font-semibold hover:bg-background`
            : ahead
              ? "text-muted hover:bg-background"
              : variation
                ? "text-accent hover:bg-background"
                : "text-foreground hover:bg-background"
      }`}
    >
      {san}
      {mark && (
        <span aria-hidden className="ml-0.5 text-[10px] font-bold">
          {mark.glyph}
        </span>
      )}
    </button>
  );
}

const SIDE_WORD = { w: "White", b: "Black" } as const;

/** Column heading for one player: a colour swatch and the name (or the colour). */
function PlayerHead({ side, name }: { side: "w" | "b"; name: string | null }) {
  return (
    <span className="flex items-center justify-end gap-1.5">
      <span
        aria-hidden
        className={`size-2.5 shrink-0 rounded-full border ${
          side === "w"
            ? "border-board-light bg-board-light"
            : "border-muted bg-background"
        }`}
      />
      <span className="truncate text-foreground">{name ?? SIDE_WORD[side]}</span>
    </span>
  );
}

const formatAccuracy = (accuracy: number | null) =>
  accuracy === null ? "—" : `${accuracy.toFixed(1)}%`;

/**
 * Both players side by side: accuracy, then how many moves of each kind. The
 * coloured dot in each row is the same colour used on the graph, the move list
 * and the board, so the table also works as the key.
 */
function AccuracyTable({
  summary,
  playerNames,
}: {
  summary: GameSummary;
  playerNames: { white: string | null; black: string | null };
}) {
  return (
    <table className="mt-2 w-full table-fixed text-xs">
      <caption className="sr-only">
        Accuracy and noteworthy moves for each player
      </caption>
      <colgroup>
        <col className="w-[34%]" />
        <col />
        <col />
      </colgroup>
      <thead>
        <tr>
          <th scope="col" className="pb-1.5 text-left font-normal">
            <span className="sr-only">Measure</span>
          </th>
          <th scope="col" className="pb-1.5 pl-2 font-medium">
            <PlayerHead side="w" name={playerNames.white} />
          </th>
          <th scope="col" className="pb-1.5 pl-2 font-medium">
            <PlayerHead side="b" name={playerNames.black} />
          </th>
        </tr>
      </thead>
      <tbody>
        <tr className="border-t border-line">
          <th scope="row" className="py-1.5 text-left font-normal text-muted">
            Accuracy
          </th>
          <td className="py-1.5 text-right font-mono text-base font-semibold tabular-nums text-foreground">
            {formatAccuracy(summary.white.accuracy)}
          </td>
          <td className="py-1.5 text-right font-mono text-base font-semibold tabular-nums text-foreground">
            {formatAccuracy(summary.black.accuracy)}
          </td>
        </tr>
        {NOTABLE_ORDER.map((quality) => {
          const mark = QUALITY_MARK[quality];
          const white = summary.white.counts[quality];
          const black = summary.black.counts[quality];
          return (
            <tr key={quality}>
              <th scope="row" className="py-0.5 text-left font-normal">
                <span className="flex items-center gap-1.5 text-muted">
                  <span
                    aria-hidden
                    className={`size-2 shrink-0 rounded-full ${mark.fill}`}
                  />
                  {mark.label}
                </span>
              </th>
              {[white, black].map((count, index) => (
                <td
                  key={index}
                  className={`py-0.5 text-right font-mono tabular-nums ${
                    count === 0 ? "text-muted/60" : "text-foreground"
                  }`}
                >
                  {count}
                </td>
              ))}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

const TONE_CLASS: Record<LabelTone, string> = {
  brilliant: "text-brilliant",
  great: "text-board-last",
  best: "text-accent",
  good: "text-foreground",
  inaccuracy: "text-board-select",
  mistake: "text-mistake",
  blunder: "text-danger",
  pending: "text-muted",
  unavailable: "text-muted",
};

/** The quality of the current move, as a small tinted pill with its mark. */
function MoveQualityBadge({ label }: { label: MoveQualityLabel }) {
  return (
    <span
      title={label.description}
      className={`inline-flex items-center gap-1.5 rounded-full bg-current/10 py-0.5 pl-2 pr-2.5 font-medium ${TONE_CLASS[label.tone]}`}
    >
      {label.pending ? (
        <Spinner />
      ) : label.glyph ? (
        <span aria-hidden className="font-mono text-[11px] font-bold">
          {label.glyph}
        </span>
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
  boardOrientation,
  onFlipBoard,
  onImport,
  importButtonRef,
  importNotice,
  moveQuality,
  mistakeLine,
  explanation,
  explanationLine,
  onShowExplanationLine,
  onSelectExplanationLineIndex,
  onStepExplanationLine,
  onCloseExplanationLine,
  analyses,
  gameSummary,
  analysisDone,
  analysisTotal,
  analysisRunning,
  analysisFailure,
  onAnalyzeGame,
  playerNames,
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
  const evaluating =
    evaluation.phase === "loading" || evaluation.phase === "thinking";
  const activeOption = lines.find((option) => option.id === activeLineId);
  const evaluateBlocked = evaluating || evaluateUnavailable !== undefined;
  const analysisStarted = analysisDone > 0 || analysisRunning;

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
    // Scrolls the list only; scrollIntoView would also scroll the page.
    const list = listRef.current;
    const current = list?.querySelector<HTMLElement>('[aria-current="step"]');
    if (list && current) revealInContainer(list, current);
  }, [ply, moves.length]);

  return (
    <aside
      aria-label="Analysis information"
      className="flex flex-col overflow-y-auto rounded-md border border-line bg-surface lg:h-0 lg:min-h-full"
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
                  {mistakeLine && (
                    <button
                      type="button"
                      onClick={mistakeLine.onAdd}
                      title="Adds the engine's best reply to the analysis as a variation, so you can step through how this move is punished"
                      className="rounded-md border border-line px-2 py-0.5 text-xs font-medium text-foreground transition-colors hover:bg-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    >
                      Show why
                      <span className="sr-only">
                        {` (adds ${mistakeLine.count} engine ${mistakeLine.count === 1 ? "move" : "moves"} as a variation)`}
                      </span>
                    </button>
                  )}
                </>
              )}
            </p>
            {statusNote && (
              <p className="mt-0.5 text-xs text-muted">{statusNote}</p>
            )}
          </div>
        </div>
      </div>

      {explanation && (
        <MoveExplanationCard
          key={explanation.key}
          explanation={explanation}
          lineView={explanationLine ?? null}
          onShowLine={(kind) => onShowExplanationLine?.(kind)}
          onSelectLineIndex={(index) => onSelectExplanationLineIndex?.(index)}
          onStepLine={(delta) => onStepExplanationLine?.(delta)}
          onCloseLine={() => onCloseExplanationLine?.()}
        />
      )}

      <section
        aria-labelledby="analysis-review-heading"
        className="border-b border-line px-4 py-3"
      >
        <div className="flex items-center justify-between gap-2">
          <h2
            id="analysis-review-heading"
            className="text-xs font-medium uppercase tracking-widest text-muted"
          >
            Game review
          </h2>
          <button
            type="button"
            aria-disabled={!hasMoves || analysisRunning}
            onClick={() => {
              if (hasMoves && !analysisRunning) onAnalyzeGame();
            }}
            className={`${analysisStarted ? SMALL_BUTTON : PRIMARY_SMALL} aria-disabled:cursor-not-allowed aria-disabled:opacity-40 aria-disabled:hover:bg-transparent`}
          >
            {analysisRunning
              ? "Analysing…"
              : analysisFailure
                ? "Try again"
                : analysisTotal > 0 && analysisDone === analysisTotal
                  ? "Re-check"
                  : "Analyse game"}
          </button>
        </div>

        <div role="status" className="mt-2 text-xs text-muted">
          {analysisFailure ? (
            <p className="text-foreground">
              Analysis stopped: {analysisFailure}. You can try again.
            </p>
          ) : analysisRunning ? (
            <div>
              <p className="flex items-center gap-2">
                <Spinner />
                Judged {analysisDone} of {analysisTotal}{" "}
                {analysisTotal === 1 ? "move" : "moves"}…
              </p>
              <div
                aria-hidden
                className="mt-1.5 h-1 overflow-hidden rounded-full bg-background"
              >
                <div
                  className="h-full rounded-full bg-accent transition-[width] duration-300 motion-reduce:transition-none"
                  style={{
                    width: `${analysisTotal > 0 ? (analysisDone / analysisTotal) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>
          ) : analysisTotal > 0 && analysisDone === analysisTotal ? (
            <p>
              All {analysisTotal} {analysisTotal === 1 ? "move" : "moves"}{" "}
              judged. Click the graph to jump to a move.
            </p>
          ) : (
            <p>Judges every move and plots the game. Accuracy is an estimate.</p>
          )}
        </div>

        {analysisDone > 0 && (
          <div className="mt-2.5">
            <EvalGraph
              moves={moves}
              analyses={analyses}
              ply={ply}
              onSelectPly={onSelectPly}
            />
          </div>
        )}
      </section>

      <section
        aria-labelledby="analysis-moves-heading"
        className="flex min-h-48 flex-col lg:min-h-64 lg:flex-1"
      >
        <div className="flex items-center justify-between gap-2 px-4 pb-2 pt-3.5">
          <h2
            id="analysis-moves-heading"
            className="text-xs font-medium uppercase tracking-widest text-muted"
          >
            Moves
          </h2>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onFlipBoard}
              aria-label={`Flip board, ${
                boardOrientation === "w" ? "White" : "Black"
              } is at the bottom`}
              className={SMALL_BUTTON}
            >
              Flip board
            </button>
            <button
              ref={importButtonRef}
              type="button"
              onClick={onImport}
              className={SMALL_BUTTON}
            >
              Import PGN
            </button>
          </div>
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
                  quality={analyses[pair.number * 2 - 2]?.quality ?? null}
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
                    quality={analyses[pair.number * 2 - 1]?.quality ?? null}
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

      {analysisDone > 0 && (
        <section
          aria-labelledby="analysis-accuracy-heading"
          className="border-t border-line px-4 py-3"
        >
          <h2
            id="analysis-accuracy-heading"
            className="text-xs font-medium uppercase tracking-widest text-muted"
          >
            Accuracy
          </h2>
          <AccuracyTable summary={gameSummary} playerNames={playerNames} />
        </section>
      )}

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

      {/* On small screens the same buttons sit under the board instead (see
          AnalysisBoard), so they are visible together with it. */}
      <GameNavigation
        ply={ply}
        total={moves.length}
        onSelectPly={onSelectPly}
        onReset={onReset}
        className="sticky bottom-0 hidden border-t border-line bg-surface p-4 lg:grid"
      />
    </aside>
  );
}
