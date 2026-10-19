"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Color, Move, Square } from "chess.js";
import {
  canSelect,
  describeHistoryPosition,
  findCastlingDrop,
  findLegalMoves,
  getDestinations,
  getLastMove,
  getMoveSlides,
  getOutcome,
  getStepSlides,
  getStatus,
  getUndoLength,
  hasHumanMoved,
  isPromotion,
  replay,
  toPgn,
  toPosition,
  type Destinations,
  type MoveSlide,
  type PromotionPiece,
} from "../lib/chess-game";
import {
  createClock,
  incrementMsOf,
  initialMsOf,
  isTimed,
} from "../lib/chess-clock";
import { saveHandoff } from "../lib/analysis-handoff";
import type { SaveGameRequest } from "../lib/game-record";
import { newGameId } from "../lib/games-api";
import { getLevel } from "../lib/engine-levels";
import { playMoveSound, primeMoveSound } from "../lib/move-sound";
import { useChessClock } from "../lib/use-chess-clock";
import { useGameSaver, type SaveStatus } from "../lib/use-game-saver";
import { useEngineOpponent } from "../lib/use-engine-opponent";
import Chessboard, { type ArrowAnnotation } from "./Chessboard";
import Dialog from "./Dialog";
import GameOverDialog from "./GameOverDialog";
import GamePanel from "./GamePanel";
import GameSetup, { DEFAULT_SETUP, type SetupSettings } from "./GameSetup";
import PlayerStrip from "./PlayerStrip";
import PromotionPicker from "./PromotionPicker";

const NO_DESTINATIONS: Destinations = new Map();

type PendingPromotion = { from: Square; to: Square };

// "setup": nothing is running (first visit, or after New Game) and the setup
// dialog collects colour, level and clock. "playing": a game is on the board,
// live or finished.
type Phase = "setup" | "playing";

// Owns the game state so the board and the panel stay in sync. The SAN move
// list is the source of truth for the live game; the chess.js instance is
// derived from it. History navigation is a separate `viewPly` cursor that only
// changes which position is displayed — it never touches `moves` or the clock.
// The human plays `humanColor`; Stockfish plays the other side. Its moves are
// requested by `useEngineOpponent` and arrive through `applyEngineMove`.
// Clocks live in `useChessClock`: only the side to move runs, the engine's
// clock runs only while it is searching, and every move, undo, restart and
// game end updates it from the handler that causes it.
// Renders the two grid children that `page.tsx`'s <main> lays out.
export default function Game() {
  const router = useRouter();
  const [moves, setMoves] = useState<readonly string[]>([]);
  // Number of plies shown while browsing history; null means the live position.
  const [viewPly, setViewPly] = useState<number | null>(null);
  const [selected, setSelected] = useState<Square | null>(null);
  const [pendingPromotion, setPendingPromotion] =
    useState<PendingPromotion | null>(null);
  const [confirmingNewGame, setConfirmingNewGame] = useState(false);
  const [pgnNotice, setPgnNotice] = useState("");
  const [phase, setPhase] = useState<Phase>("setup");
  // What the player picked; it only changes while the setup dialog is open, so
  // during a game it is also the game's own settings (and "Play again" reuses it).
  const [setup, setSetup] = useState<SetupSettings>(DEFAULT_SETUP);
  // Colour of the game on the board (a "random" choice is resolved at start).
  const [humanColor, setHumanColor] = useState<Color>("w");
  // The side whose clock ran out, if the game ended on time.
  const [timedOut, setTimedOut] = useState<Color | null>(null);
  // The side that resigned, if the game ended that way.
  const [resigned, setResigned] = useState<Color | null>(null);
  const [confirmingResign, setConfirmingResign] = useState(false);
  const [resultDismissed, setResultDismissed] = useState(false);
  // Incremented on every game start so the engine never reuses a stale request.
  const [gameEpoch, setGameEpoch] = useState(0);
  // Names the game on the board in the history database; new on every start.
  const [gameId, setGameId] = useState("");
  // The square of the piece the human is holding on the pointer, if any. It
  // can be picked up during Stockfish's turn; nothing is played until release.
  const [heldFrom, setHeldFrom] = useState<Square | null>(null);
  // Bumped to make the board cancel a drag (undo, new game, resign, flag).
  // Right-click arrow annotations: purely visual, never part of the game.
  const [arrows, setArrows] = useState<readonly ArrowAnnotation[]>([]);
  // The glides of the move just played, or of the one-ply history step just
  // taken, for the board to animate once. Cleared by anything else that changes
  // the position (jumping through history, undo, new game).
  const [slide, setSlide] = useState<{
    id: number;
    moves: readonly MoveSlide[];
    duration?: number;
  } | null>(null);
  const slideId = useRef(0);
  const [highlights, setHighlights] = useState<readonly Square[]>([]);
  const [dragCancelSignal, setDragCancelSignal] = useState(0);

  const game = useMemo(() => replay(moves), [moves]);
  const status = useMemo(
    () => getStatus(game, timedOut, resigned),
    [game, timedOut, resigned],
  );
  const outcome = useMemo(
    () => getOutcome(game, timedOut, resigned),
    [game, timedOut, resigned],
  );

  const playing = phase === "playing";
  const isViewing = viewPly !== null;
  const shownPly = viewPly ?? moves.length;
  const shownGame = useMemo(
    () => (viewPly === null ? game : replay(moves.slice(0, viewPly))),
    [game, moves, viewPly],
  );
  const position = useMemo(() => toPosition(shownGame), [shownGame]);
  // Follows the position on show, so it also tracks history browsing.
  const lastMove = useMemo(() => getLastMove(shownGame), [shownGame]);
  // A held piece takes over the hints. On Stockfish's turn the side to move is
  // not the holder's, so chess.js reports no destinations: no premove hints.
  const hintFrom = heldFrom ?? selected;
  const destinations = useMemo(
    () =>
      hintFrom && !isViewing
        ? getDestinations(game, hintFrom)
        : NO_DESTINATIONS,
    [game, hintFrom, isViewing],
  );

  const engineColor: Color = humanColor === "w" ? "b" : "w";
  const isEngineTurn = playing && !status.isOver && status.turn === engineColor;
  // The human can only move on their own turn, in the live position.
  const canPlay =
    playing && !status.isOver && !isViewing && status.turn === humanColor;

  // The human may hold a piece whenever a live game is running, even while
  // Stockfish is thinking.
  const canHold = playing && !status.isOver && !isViewing;

  const level = getLevel(setup.levelId);
  const timed = isTimed(setup.clock);
  const incrementMs = incrementMsOf(setup.clock);
  const fen = game.fen();

  const movesRef = useRef(moves);
  const resignedRef = useRef(resigned);
  const viewPlyRef = useRef(viewPly);
  useEffect(() => {
    movesRef.current = moves;
    resignedRef.current = resigned;
    viewPlyRef.current = viewPly;
  });

  // The clock has already stopped when this runs. Recording the result ends the
  // game, which also cancels any engine search (it is no longer anyone's turn).
  const handleFlag = useCallback((side: Color) => {
    setTimedOut(side);
    setHeldFrom(null);
    setDragCancelSignal((n) => n + 1);
    setPendingPromotion(null);
    setSelected(null);
  }, []);
  const {
    clock,
    begin: beginClock,
    move: clockMove,
    search: clockSearch,
    stop: stopClock,
    restore: restoreClock,
  } = useChessClock({ onFlag: handleFlag });

  // Applies Stockfish's (already chess.js-validated) move. It re-checks that the
  // board is still in the position the move was computed for, so a reply that
  // raced with undo, restart or another change can never be played.
  const applyEngineMove = useCallback(
    (move: Move, forFen: string) => {
      // Belt and braces: leaving the engine's turn already cancels its search.
      if (resignedRef.current) return;
      const live = replay(movesRef.current);
      if (live.fen() !== forFen) return;
      // The reply may land while a past position is on show; its glide belongs
      // to the live board, so it must not play over the history view.
      if (viewPlyRef.current === null) {
        slideId.current += 1;
        setSlide({ id: slideId.current, moves: getMoveSlides(live, move.san) });
      }
      live.move(move.san);
      playMoveSound(move.san);
      setMoves([...movesRef.current, move.san]);
      setSelected(null);
      setPgnNotice("");
      clockMove(incrementMs, getStatus(live).isOver ? "end" : "run");
    },
    [clockMove, incrementMs],
  );

  // The engine's clock runs only while it is really searching, not while the
  // worker loads or after an error.
  const handleThinkingChange = useCallback(
    (thinking: boolean) => clockSearch(engineColor, thinking),
    [clockSearch, engineColor],
  );

  const engine = useEngineOpponent({
    fen,
    active: isEngineTurn,
    depth: level.limit.depth,
    moveTimeMs: level.limit.moveTimeMs,
    epoch: gameEpoch,
    onMove: applyEngineMove,
    onThinkingChange: handleThinkingChange,
  });

  // Undo hands control back to the human and restores the clocks to where they
  // stood then. A game lost on time is final.
  const undoLength = getUndoLength(moves.length, humanColor);
  const canUndo =
    playing && undoLength !== null && timedOut === null && resigned === null;
  const canResign = playing && !status.isOver;

  // A finished game is saved to the history database. Undo after a checkmate
  // reopens the game, so it also takes that saved row back out (see the hook).
  const saveRequest = useMemo<SaveGameRequest | null>(
    () =>
      playing && outcome !== null && gameId !== ""
        ? {
            id: gameId,
            moves,
            humanColor,
            levelId: setup.levelId,
            clockMinutes: setup.clock.minutes,
            clockIncrementSeconds: setup.clock.incrementSeconds,
            timedOut,
            resigned,
          }
        : null,
    [
      playing,
      outcome,
      gameId,
      moves,
      humanColor,
      setup.levelId,
      setup.clock.minutes,
      setup.clock.incrementSeconds,
      timedOut,
      resigned,
    ],
  );
  const handleSaveStatus = useCallback((saveStatus: SaveStatus) => {
    setPgnNotice(
      saveStatus === "saved"
        ? "Game saved to history"
        : "Couldn't save to history — download the PGN to keep it",
    );
  }, []);
  const { discard: discardSavedGame } = useGameSaver(
    saveRequest,
    handleSaveStatus,
  );

  function commitMove(san: string, animate = true) {
    const next = [...moves, san];
    if (animate) {
      slideId.current += 1;
      setSlide({ id: slideId.current, moves: getMoveSlides(game, san) });
    } else {
      // A dropped piece is already on its square: nothing to glide.
      setSlide(null);
    }
    playMoveSound(san);
    setMoves(next);
    setSelected(null);
    setPendingPromotion(null);
    setPgnNotice("");
    // Stockfish replies next unless the move ended the game; its clock starts
    // when its search does.
    clockMove(
      incrementMs,
      getStatus(replay(next)).isOver ? "end" : "hold",
    );
  }

  function abortDrag() {
    setHeldFrom(null);
    setDragCancelSignal((n) => n + 1);
  }

  function handlePieceDragStart(square: Square) {
    setHeldFrom(square);
    // Selecting is for the human's own turn; while Stockfish thinks the piece
    // is only held.
    setSelected(canPlay ? square : null);
  }

  function tryMove(from: Square, to: Square, animate = true) {
    if (!canPlay) return;
    // A king dropped far along its rank, or on its own rook, means castling.
    // It is only tried when the drop is not already an ordinary legal move.
    let legal = findLegalMoves(game, from, to);
    if (legal.length === 0) legal = findCastlingDrop(game, from, to);
    if (legal.length === 0) return;
    if (isPromotion(legal)) {
      setPendingPromotion({ from, to });
    } else {
      commitMove(legal[0].san, animate);
    }
  }

  function choosePromotion(piece: PromotionPiece) {
    if (!pendingPromotion || !canPlay) return;
    const { from, to } = pendingPromotion;
    const move = findLegalMoves(game, from, to).find(
      (m) => m.promotion === piece,
    );
    if (move) commitMove(move.san);
    else setPendingPromotion(null);
  }

  function handleSquareActivate(square: Square) {
    if (!canPlay) return;

    if (selected && destinations.has(square)) {
      tryMove(selected, square);
    } else if (canSelect(game, square)) {
      setSelected(selected === square ? null : square);
    } else {
      setSelected(null);
    }
  }

  // Browsing only moves the display cursor; the live game and clocks carry on.
  // A single step glides the piece that moved; bigger jumps snap.
  function goToPly(ply: number) {
    abortDrag();
    setArrows([]);
    setHighlights([]);
    const clamped = Math.min(moves.length, Math.max(0, ply));
    const stepSlides = getStepSlides(moves, shownPly, clamped);
    if (stepSlides.length > 0) {
      slideId.current += 1;
      setSlide({ id: slideId.current, moves: stepSlides, duration: 150 });
    } else {
      setSlide(null);
    }
    setViewPly(clamped === moves.length ? null : clamped);
    setSelected(null);
    setPendingPromotion(null);
  }

  // Takes back a full turn where possible and always returns control to the
  // human (see getUndoLength). Any in-flight engine search is cancelled by the
  // engine hook because the position changes.
  function undo() {
    if (!canUndo || undoLength === null) return;
    discardSavedGame(gameId);
    abortDrag();
    setArrows([]);
    setHighlights([]);
    setSlide(null);
    setMoves(moves.slice(0, undoLength));
    setViewPly(null);
    setSelected(null);
    setPendingPromotion(null);
    setPgnNotice("");
    setResultDismissed(false);
    restoreClock(undoLength, "run");
  }

  function clearBoard() {
    abortDrag();
    setArrows([]);
    setHighlights([]);
    setSlide(null);
    setMoves([]);
    setViewPly(null);
    setSelected(null);
    setPendingPromotion(null);
    setConfirmingNewGame(false);
    setTimedOut(null);
    setResigned(null);
    setConfirmingResign(false);
    setResultDismissed(false);
    setPgnNotice("");
  }

  // Ends the game in the opponent's favour. Ending it makes `status.isOver`
  // true, which blocks moves and undo and cancels any Stockfish search; the
  // clocks are frozen here. A second resignation, or one after the game ended
  // some other way, is ignored.
  function resign() {
    setConfirmingResign(false);
    if (!canResign) return;
    abortDrag();
    setResigned(humanColor);
    setPendingPromotion(null);
    setSelected(null);
    setResultDismissed(false);
    stopClock();
  }

  // Starts a game with the current setup. "Random" is resolved here, in an
  // event handler, never during render.
  function startGame() {
    const color: Color =
      setup.colorChoice === "random"
        ? Math.random() < 0.5
          ? "w"
          : "b"
        : setup.colorChoice;
    // A user gesture: unlock audio so the engine's first move can be heard.
    primeMoveSound();
    setHumanColor(color);
    setGameId(newGameId());
    setGameEpoch((epoch) => epoch + 1);
    clearBoard();
    setPhase("playing");
    // White moves first: the clock starts now if that is the human; if it is
    // Stockfish it starts when the search does.
    beginClock(initialMsOf(setup.clock), color === "w");
  }

  // Back to setup: the board is cleared, clocks freeze and the engine is
  // cancelled because no game is running any more.
  function toSetup() {
    clearBoard();
    setPhase("setup");
    stopClock();
  }

  function requestNewGame() {
    if (!playing) {
      // The setup panel is already showing over the board.
      return;
    }
    if (hasHumanMoved(moves.length, humanColor) && !status.isOver) {
      // A finished game, or one where the human has not moved yet (for example
      // only Stockfish's opening move), has nothing left to lose.
      setConfirmingNewGame(true);
    } else {
      toSetup();
    }
  }

  // Opens the analysis page on this game. The moves travel as PGN in
  // sessionStorage (see analysis-handoff.ts); if storage is blocked, stay here
  // rather than land on an empty analysis board.
  function analyzeGame() {
    if (moves.length === 0) return;
    const pgn = toPgn(moves, new Date(), pgnPlayers, timedOut, resigned);
    if (!saveHandoff(pgn)) {
      setResultDismissed(true);
      setPgnNotice("Couldn't open analysis — try Download instead");
      return;
    }
    router.push("/analysis");
  }

  const pgnPlayers =
    humanColor === "w"
      ? { white: "You", black: "Stockfish" }
      : { white: "Stockfish", black: "You" };

  async function copyPgn() {
    try {
      await navigator.clipboard.writeText(
        toPgn(moves, new Date(), pgnPlayers, timedOut, resigned),
      );
      setPgnNotice("PGN copied to clipboard");
    } catch {
      setPgnNotice("Couldn't copy — try Download instead");
    }
  }

  function downloadPgn() {
    const blob = new Blob([toPgn(moves, new Date(), pgnPlayers, timedOut, resigned)], {
      type: "application/x-chess-pgn",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "game.pgn";
    link.click();
    URL.revokeObjectURL(url);
    setPgnNotice("PGN downloaded");
  }

  // Before a game the strips show the chosen starting time on both sides.
  const shownClock = useMemo(
    () =>
      timed
        ? playing
          ? clock
          : createClock(initialMsOf(setup.clock))
        : null,
    [timed, playing, clock, setup.clock],
  );
  const levelName = level.label.split(" · ")[0];
  const toMove = (side: Color) =>
    playing && !status.isOver && status.turn === side;
  const opponentColor = engineColor;
  const opponentName = "Stockfish";
  const nameOf = (side: Color) => (side === humanColor ? "You" : "Stockfish");
  const detailOf = (side: Color) =>
    `${side === "w" ? "White" : "Black"}${side === humanColor ? "" : ` · ${levelName}`}`;

  const statusText = playing ? status.text : "Set up a game to begin";
  const showGameOver =
    playing && outcome !== null && !resultDismissed && !confirmingNewGame;

  return (
    <>
      {/* Both clocks sit against the board, the human's at the bottom, so
          they stay in view on a phone and follow the board when Black is at
          the bottom. */}
      <div className="relative mx-auto w-full max-w-[max(16rem,min(100%,calc(100dvh_-_14rem)))] lg:max-w-[max(24rem,calc(100dvh_-_14rem))]">
        {/* While no game is running the board is inert and the setup panel
            sits over it, so the header, Settings and Analysis stay usable. */}
        <div inert={!playing} className="flex flex-col gap-1.5">
        <PlayerStrip
          side={opponentColor}
          name={nameOf(opponentColor)}
          detail={detailOf(opponentColor)}
          clock={shownClock}
          toMove={toMove(opponentColor)}
        />
        <div className="relative">
        <Chessboard
          position={position}
          orientation={humanColor}
          turn={status.turn}
          interactive={canPlay}
          selected={
            isViewing ? null : canPlay && heldFrom ? heldFrom : selected
          }
          destinations={destinations}
          onSquareActivate={handleSquareActivate}
          onPieceDragStart={handlePieceDragStart}
          onPieceDrop={(from, to) => tryMove(from, to, false)}
          onClearSelection={() => setSelected(null)}
          lastMove={lastMove}
          holdColor={humanColor}
          holdEnabled={canHold}
          cancelDragSignal={dragCancelSignal}
          onPieceDragEnd={() => setHeldFrom(null)}
          arrows={arrows}
          onArrowsChange={setArrows}
          animatePieces
          slide={slide}
          dimmed={isViewing}
          highlights={highlights}
          onHighlightsChange={setHighlights}
        />
        {isViewing && (
          // Sits on the board's top edge, in the gap above it, so it never
          // shifts the layout. The panel's banner already announces the cursor.
          <span
            aria-hidden
            className="pointer-events-none absolute bottom-full left-1/2 z-20 -translate-x-1/2 translate-y-[5px] whitespace-nowrap rounded-full bg-background/90 px-2.5 text-[11px] font-medium leading-4 text-foreground shadow-sm ring-1 ring-line"
          >
            {describeHistoryPosition(shownPly, moves.length)}
          </span>
        )}
        </div>
        <PlayerStrip
          side={humanColor}
          name={nameOf(humanColor)}
          detail={detailOf(humanColor)}
          clock={shownClock}
          toMove={toMove(humanColor)}
        />
        </div>
        {!playing && (
          <div className="absolute inset-0 z-30 flex overflow-y-auto rounded-md bg-background/80 p-3 backdrop-blur-[2px]">
            <section
              aria-label="New game"
              className="m-auto w-full max-w-[22rem] rounded-md border border-line bg-surface p-5 shadow-[0_28px_60px_-20px_rgba(0,0,0,0.9)]"
            >
              <h2 className="text-base font-semibold text-foreground">
                New game
              </h2>
              <div className="mt-4">
                <GameSetup value={setup} onChange={setSetup} />
              </div>
              <button
                type="button"
                autoFocus
                onClick={startGame}
                className="mt-5 w-full rounded-md bg-accent px-4 py-2.5 text-sm font-semibold text-background transition-colors hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                Start game
              </button>
            </section>
          </div>
        )}
      </div>
      <GamePanel
        turn={status.turn}
        statusText={statusText}
        showTurn={playing && !status.isOver}
        moves={moves}
        shownPly={shownPly}
        isViewing={isViewing}
        onSelectPly={goToPly}
        onUndo={undo}
        onNewGame={requestNewGame}
        onCopyPgn={copyPgn}
        onDownloadPgn={downloadPgn}
        pgnNotice={pgnNotice}
        engineStatus={engine.status}
        onRetryEngine={engine.retry}
        canUndo={canUndo}
        canResign={canResign}
        onResign={() => setConfirmingResign(true)}
        onAnalyze={analyzeGame}
        newGameDisabled={!playing}
      />

      {pendingPromotion && (
        <PromotionPicker
          color={status.turn}
          onSelect={choosePromotion}
          onCancel={() => setPendingPromotion(null)}
        />
      )}

      {showGameOver && outcome && (
        <GameOverDialog
          outcome={outcome}
          humanColor={humanColor}
          plies={moves.length}
          onPlayAgain={startGame}
          onAnalyze={analyzeGame}
          onReview={() => {
            setResultDismissed(true);
            goToPly(0);
          }}
          onClose={() => setResultDismissed(true)}
        />
      )}

      {confirmingResign && canResign && (
        <Dialog
          label="Resign the game?"
          onClose={() => setConfirmingResign(false)}
        >
          <h2 className="text-sm font-semibold text-foreground">
            Resign the game?
          </h2>
          <p className="mt-2 text-sm text-muted">
            You will lose, and {opponentName} wins by resignation.
          </p>
          <div className="mt-5 grid grid-cols-2 gap-2">
            <button
              type="button"
              autoFocus
              onClick={() => setConfirmingResign(false)}
              className="rounded-md border border-line px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              Keep playing
            </button>
            <button
              type="button"
              onClick={resign}
              className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-background transition-colors hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              Resign
            </button>
          </div>
        </Dialog>
      )}

      {confirmingNewGame && (
        <Dialog
          label="Start a new game?"
          onClose={() => setConfirmingNewGame(false)}
        >
          <h2 className="text-sm font-semibold text-foreground">
            Start a new game?
          </h2>
          <p className="mt-2 text-sm text-muted">
            The game in progress will be discarded.
          </p>
          <div className="mt-5 grid grid-cols-2 gap-2">
            <button
              type="button"
              autoFocus
              onClick={() => setConfirmingNewGame(false)}
              className="rounded-md border border-line px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              Keep playing
            </button>
            <button
              type="button"
              onClick={toSetup}
              className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-background transition-colors hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              New game
            </button>
          </div>
        </Dialog>
      )}
    </>
  );
}
