"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Chess, type Square } from "chess.js";
import {
  EMPTY_SESSION,
  activeLine,
  goToPlyInSession,
  importedSession,
  isMainActive,
  lineName,
  lineOptions,
  lineView,
  playMoveInSession,
  playMovesInSession,
  selectLine,
  type AnalysisSession,
} from "../lib/analysis-session";
import {
  findLegalMoves,
  getAnalysisStatus,
  getDestinations,
  getStepSlides,
  isPromotion,
  replay,
  resolveUciMove,
  toPosition,
  type Destinations,
  type MoveSlide,
  type PromotionPiece,
} from "../lib/chess-game";
import {
  parsePgn,
  type PgnImportFailure,
  type PgnImportSuccess,
} from "../lib/pgn-import";
import {
  activePvView,
  pvFenAt,
  pvMatchesPosition,
  stepPvIndex,
  type PvView,
} from "../lib/pv-format";
import { replayPvOnto } from "../lib/pv-line";
import { moveContextAt } from "../lib/move-context";
import { moveQualityLabel } from "../lib/move-quality-label";
import { parseUciMove } from "../lib/stockfish-engine";
import type { WhiteScore } from "../lib/uci-info";
import { useEvaluationCache } from "../lib/use-evaluation-cache";
import { useMoveClassification } from "../lib/use-move-classification";
import { usePositionAnalysis } from "../lib/use-position-analysis";
import AnalysisPanel from "./AnalysisPanel";
import Chessboard from "./Chessboard";
import EvalBar from "./EvalBar";
import PgnImportDialog from "./PgnImportDialog";
import PromotionPicker from "./PromotionPicker";

const NO_DESTINATIONS: Destinations = new Map();

type PendingPromotion = { from: Square; to: Square };

/** One-line summary of an import, e.g. "Imported Smith vs Jones (1-0): 21 moves." */
function describeImport(game: PgnImportSuccess): string {
  const players =
    game.white && game.black ? ` ${game.white} vs ${game.black}` : " game";
  const result = game.result ? ` (${game.result})` : "";
  const fullMoves = Math.ceil(game.moves.length / 2);
  const count = `${fullMoves} ${fullMoves === 1 ? "move" : "moves"}`;
  const note = game.variationsIgnored
    ? " Variations were ignored; only the main line is loaded."
    : "";
  return `Imported${players}${result}: ${count}, showing the final position.${note}`;
}

// A free-play board for studying positions. It has its own state and shares
// nothing with the live game: no clocks, no setup, no Stockfish. The session
// (a main line, any variations, which line is shown and a cursor on it, see
// `analysis-session.ts`) is the source of truth; the chess.js instance shown on
// the board is derived from the selected line and never mutated, and every move
// is checked by chess.js before it is added. Previous/Next only move the cursor.
// The main line is never overwritten or truncated: a move that differs from the
// line's next move starts (or follows) a variation, and the line selector
// returns to the main line. Either side's pieces can be moved. Only
// checkmate and stalemate lock the board; a draw by repetition or the
// fifty-move rule is reported but can be played on from. A PGN import (parsed
// by chess.js in `pgn-import.ts`) starts a new session whose locked main line is
// the game's main line.
// Engine evaluation is a one-shot, on-demand request for the position on the
// board (see `use-position-analysis.ts`); it has its own worker and is
// discarded whenever the position, a reset or an import changes it. Its
// principal variation can be stepped through on the board as a temporary view
// that leaves the line, cursor and move list alone.
// Renders the two grid children that `analysis/page.tsx`'s <main> lays out.
/**
 * A saved game to open, from `/analysis?game=<id>`: its PGN, or why it could
 * not be loaded. The id decides when to load, so a different game in the URL is
 * loaded even though Next.js keeps this page mounted between visits.
 */
export type AnalysisSource =
  | { id: string; pgn: string }
  | { id: string; error: string };

export default function AnalysisBoard({
  source = null,
}: {
  source?: AnalysisSource | null;
}) {
  const [session, setSession] = useState<AnalysisSession>(EMPTY_SESSION);
  const [selected, setSelected] = useState<Square | null>(null);
  const [pendingPromotion, setPendingPromotion] =
    useState<PendingPromotion | null>(null);

  const [importOpen, setImportOpen] = useState(false);
  // What the last import did; cleared as soon as the line is changed by hand.
  const [importNotice, setImportNotice] = useState("");
  const importButtonRef = useRef<HTMLButtonElement>(null);
  const wasImportOpen = useRef(false);

  // A closed <dialog> that is simply unmounted leaves focus on the page, so
  // hand it back to the button that opened the dialog.
  useEffect(() => {
    if (wasImportOpen.current && !importOpen) {
      importButtonRef.current?.focus();
    }
    wasImportOpen.current = importOpen;
  }, [importOpen]);

  // The selected line and the cursor on it. Everything below (position,
  // evaluation, arrows, move quality, animations) reads this one line, so it
  // always matches the board.
  const line = useMemo(() => lineView(session), [session]);
  const { moves, ply } = line;
  const current = activeLine(session);
  const variationStart = isMainActive(session) ? null : current.branchPly;
  const lineChoices = useMemo(() => lineOptions(session), [session]);
  const game = useMemo(() => replay(moves.slice(0, ply)), [moves, ply]);
  const status = useMemo(() => getAnalysisStatus(game), [game]);
  // Bumped on reset and PGN import so an evaluation never survives either,
  // even when the new position equals the old one.
  const [analysisEpoch, setAnalysisEpoch] = useState(0);

  const fen = useMemo(() => game.fen(), [game]);
  // Off by default: evaluate each position automatically, at a shallow depth.
  const [autoEvaluate, setAutoEvaluate] = useState(false);
  // Completed evaluations, shared so no position is searched twice.
  const evaluationStore = useEvaluationCache();
  const {
    status: evaluation,
    evaluate,
    barScore,
  } = usePositionAnalysis({
    fen,
    epoch: analysisEpoch,
    disabled: status.isOver,
    auto: autoEvaluate,
    store: evaluationStore,
  });

  // The move the cursor is on, with the exact positions before and after it.
  // Rebuilt from the line, so it always names the move now on the board; the
  // classification below is derived from these two positions alone.
  const moveContext = useMemo(() => moveContextAt(moves, ply), [moves, ply]);
  const moveClassification = useMoveClassification({
    context: moveContext,
    epoch: analysisEpoch,
    store: evaluationStore,
  });

  // The last score the bar showed for any position. While the position on show
  // has no score of its own the bar keeps this fill (see EvalBar), so it does not
  // flash to balanced between moves. A reset or an import starts a fresh
  // analysis, so it forgets the fill. Adjusted during render, like the hook's
  // own per-position state, so the bar never paints a stale frame.
  const [fill, setFill] = useState<{ epoch: number; score: WhiteScore | null }>(
    { epoch: analysisEpoch, score: null },
  );
  const previousScore = fill.epoch === analysisEpoch ? fill.score : null;
  if (
    fill.epoch !== analysisEpoch ||
    (barScore !== null && barScore !== fill.score)
  ) {
    setFill({ epoch: analysisEpoch, score: barScore ?? null });
  }

  // The glide for the single history step just taken, for the board to play once.
  const [slide, setSlide] = useState<{
    id: number;
    moves: readonly MoveSlide[];
    duration?: number;
  } | null>(null);
  const slideId = useRef(0);

  // Temporary browsing of the engine's line. It never touches `line`: the main
  // cursor and move list stay exactly as they were, and leaving the view just
  // puts the board back on `game`. A view only counts while it belongs to the
  // PV on show, so a replaced or discarded PV can never come back.
  const [pvViewState, setPvViewState] = useState<PvView | null>(null);

  // Loads the game from the URL, once per game id. Done while rendering (React's
  // "adjust state when a prop changes" pattern) so the first paint already
  // shows the game instead of an empty board that an effect then replaces.
  const [loadedSourceId, setLoadedSourceId] = useState<string | null>(null);
  if (source !== null && source.id !== loadedSourceId) {
    setLoadedSourceId(source.id);
    setAnalysisEpoch((epoch) => epoch + 1);
    setSelected(null);
    setPendingPromotion(null);
    setPvViewState(null);
    const parsed = "pgn" in source ? parsePgn(source.pgn) : null;
    if (parsed?.ok) {
      setSession(importedSession(parsed.moves));
      setImportNotice(describeImport(parsed));
    } else {
      setImportNotice(
        "error" in source ? source.error : "That game couldn't be opened.",
      );
    }
  }
  const currentPv =
    evaluation.phase === "done" ? evaluation.evaluation.pv : null;
  const pvView = activePvView(pvViewState, currentPv);
  const pvFen = pvView ? pvFenAt(pvView.pv, pvView.index) : null;
  // The best move for the analysed position, shown only while that position is
  // on the board: `evaluation` is already discarded when the position, a reset
  // or an import changes it, and the arrow is hidden while the PV view shows
  // some other position. Read-only: nothing is ever played from it.
  const inPvView = pvView !== null;
  const bestMoveUci =
    evaluation.phase === "done" ? evaluation.evaluation.bestMoveUci : null;
  const bestMoveArrow = useMemo(() => {
    if (!bestMoveUci || inPvView) return null;
    const parsed = parseUciMove(bestMoveUci);
    const move = parsed ? resolveUciMove(fen, parsed) : null;
    return move ? { from: move.from, to: move.to } : null;
  }, [bestMoveUci, inPvView, fen]);
  const shownGame = useMemo(
    () => (pvFen ? new Chess(pvFen) : game),
    [pvFen, game],
  );
  const shownStatus = useMemo(
    () => getAnalysisStatus(shownGame),
    [shownGame],
  );
  const shownPosition = useMemo(() => toPosition(shownGame), [shownGame]);

  const destinations = useMemo(
    () => (selected ? getDestinations(game, selected) : NO_DESTINATIONS),
    [game, selected],
  );

  // Every action that changes the main line also leaves the engine-line view.
  function clearTransient() {
    setSelected(null);
    setPendingPromotion(null);
    setPvViewState(null);
  }

  function stepPv(delta: 1 | -1) {
    if (!currentPv) return;
    const index = stepPvIndex(pvView?.index ?? null, delta, currentPv.moves.length);
    setSelected(null);
    setPendingPromotion(null);
    setPvViewState(index === null ? null : { pv: currentPv, index });
  }

  function selectPvMove(index: number) {
    if (!currentPv) return;
    const clamped = Math.min(currentPv.moves.length, Math.max(0, index));
    setSelected(null);
    setPendingPromotion(null);
    setPvViewState({ pv: currentPv, index: clamped });
  }

  function commitMove(san: string) {
    setSession((previous) => playMoveInSession(previous, san));
    setImportNotice("");
    clearTransient();
  }

  // The PV may only be applied to the position it was computed for. The hook
  // already drops a PV when the position changes; this is a second check at the
  // point of use.
  const pvActionable = currentPv !== null && pvMatchesPosition(currentPv, fen);

  // Plays `sans` from the position on the board. They follow lines that already
  // make those moves and otherwise start or extend a variation; the main line
  // is never cut. Returns the session that results.
  function commitMoves(sans: readonly string[]): AnalysisSession {
    const next = playMovesInSession(session, sans);
    setSession(next);
    setImportNotice("");
    clearTransient();
    return next;
  }

  // Plays the engine moves that lead to the position on the board, i.e. the
  // selected move and the ones before it (which it needs to be legal), but none
  // after it. Re-validated by chess.js against the current game position.
  function playPvMove() {
    if (!currentPv || !pvView || !pvActionable || pvView.index < 1) return;
    const replayed = replayPvOnto(fen, currentPv, pvView.index);
    if (!replayed || !replayed.complete) return;
    commitMoves(replayed.sans);
  }

  // Appends the whole engine line, stopping at the first invalid move or the
  // first checkmate/stalemate. Moves after the cursor are dropped first, as for
  // any move played from an earlier position.
  function addPvLine() {
    if (!currentPv || !pvActionable) return;
    const replayed = replayPvOnto(fen, currentPv, currentPv.moves.length);
    if (!replayed || replayed.sans.length === 0) return;
    const next = commitMoves(replayed.sans);
    const added = replayed.sans.length;
    setImportNotice(
      `Added ${added} engine ${added === 1 ? "move" : "moves"} to ${
        isMainActive(next) ? "the main line" : lineName(next, next.activeId)
      }.${replayed.complete ? "" : " The engine line was cut short."}`,
    );
  }

  function tryMove(from: Square, to: Square) {
    if (status.isOver || pvView) return;
    const legal = findLegalMoves(game, from, to);
    if (legal.length === 0) return;
    if (isPromotion(legal)) {
      setPendingPromotion({ from, to });
    } else {
      commitMove(legal[0].san);
    }
  }

  function choosePromotion(piece: PromotionPiece) {
    if (!pendingPromotion) return;
    const { from, to } = pendingPromotion;
    const move = findLegalMoves(game, from, to).find(
      (m) => m.promotion === piece,
    );
    if (move) commitMove(move.san);
    else setPendingPromotion(null);
  }

  // Not `canSelect`: that treats every draw as the end of the game, but here
  // the side to move can always move unless it is checkmate or stalemate.
  function handleSquareActivate(square: Square) {
    if (status.isOver || pvView) return;

    if (selected && destinations.has(square)) {
      tryMove(selected, square);
    } else if (game.get(square)?.color === status.turn) {
      setSelected(selected === square ? null : square);
    } else {
      setSelected(null);
    }
  }

  // Stepping the cursor by one move glides the piece that moved, forward or
  // back. Bigger jumps, and any step taken while the engine line is on the
  // board (it shows a different position), snap.
  function selectPly(target: number) {
    const next = goToPlyInSession(session, target);
    const slides = pvView ? [] : getStepSlides(moves, ply, next.ply);
    if (slides.length > 0) {
      slideId.current += 1;
      setSlide({ id: slideId.current, moves: slides, duration: 150 });
    } else {
      setSlide(null);
    }
    setSession(next);
    clearTransient();
  }

  // Shows another line. The board snaps to it (no glide): the position may
  // jump to a different branch.
  function chooseLine(id: number) {
    const next = selectLine(session, id);
    if (next === session) return;
    setSlide(null);
    setSession(next);
    setImportNotice("");
    clearTransient();
  }

  function reset() {
    setSession(EMPTY_SESSION);
    setAnalysisEpoch((epoch) => epoch + 1);
    setImportNotice("");
    clearTransient();
  }

  // Nothing is touched unless chess.js accepts the whole PGN, so a bad paste
  // never loses the current analysis.
  function importPgn(text: string): PgnImportFailure | null {
    const result = parsePgn(text);
    if (!result.ok) return result;
    setSession(importedSession(result.moves));
    setAnalysisEpoch((epoch) => epoch + 1);
    setImportNotice(describeImport(result));
    clearTransient();
    setImportOpen(false);
    return null;
  }

  return (
    <>
      <div className="mx-auto flex w-full max-w-[max(16rem,min(100%,calc(100dvh_-_9rem)))] gap-1.5 sm:gap-2 lg:max-w-[max(24rem,calc(100dvh_-_9rem))]">
        {/* Only an evaluation of the position on show gives the bar its text:
            the hook drops results for any other position, and none is shown
            while the engine's line is browsed (the board then shows a
            different position). Until the position has its own score the bar
            only keeps the previous fill. */}
        <EvalBar
          score={inPvView ? null : barScore}
          previousScore={previousScore}
          orientation="w"
        />
        <div
          className={`flex min-w-0 flex-1 flex-col ${
            pvView ? "rounded-sm outline-4 outline-offset-2 outline-accent" : ""
          }`}
        >
        <Chessboard
          position={shownPosition}
          orientation="w"
          turn={shownStatus.turn}
          interactive={!status.isOver && !pvView}
          selected={selected}
          destinations={destinations}
          onSquareActivate={handleSquareActivate}
          onPieceDragStart={setSelected}
          onPieceDrop={tryMove}
          onClearSelection={() => setSelected(null)}
          engineArrow={bestMoveArrow}
          animatePieces
          slide={slide}
        />
        </div>
      </div>
      <AnalysisPanel
        turn={shownStatus.turn}
        statusText={shownStatus.text}
        statusNote={pvView ? undefined : shownStatus.note}
        showTurn={!shownStatus.isOver}
        moves={moves}
        ply={ply}
        onSelectPly={selectPly}
        lines={lineChoices}
        activeLineId={session.activeId}
        onSelectLine={chooseLine}
        variationStart={variationStart}
        onReset={reset}
        onImport={() => setImportOpen(true)}
        importButtonRef={importButtonRef}
        importNotice={importNotice}
        moveQuality={
          pvView ? null : moveQualityLabel(moveClassification, moveContext?.key ?? null)
        }
        evaluation={evaluation}
        onEvaluate={evaluate}
        autoEvaluate={autoEvaluate}
        onAutoEvaluateChange={setAutoEvaluate}
        evaluateUnavailable={status.isOver ? status.text : undefined}
        pvIndex={pvView?.index ?? null}
        onPvStep={stepPv}
        onPvSelect={selectPvMove}
        onPvExit={() => setPvViewState(null)}
        pvActionable={pvActionable}
        onPvPlay={playPvMove}
        onPvAddLine={addPvLine}
      />

      {importOpen && (
        <PgnImportDialog
          onImport={importPgn}
          onClose={() => setImportOpen(false)}
        />
      )}

      {pendingPromotion && (
        <PromotionPicker
          color={status.turn}
          onSelect={choosePromotion}
          onCancel={() => setPendingPromotion(null)}
        />
      )}
    </>
  );
}
