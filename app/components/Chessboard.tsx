"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import type { Color, Square } from "chess.js";
import type {
  Destinations,
  LastMove,
  MoveSlide,
  Position,
} from "../lib/chess-game";
import ArrowOverlay, { type ArrowAnnotation } from "./ArrowOverlay";
import MoveBadgeOverlay, { type MoveBadge } from "./MoveBadgeOverlay";
import ChessPiece, { describePiece, type PieceCode } from "./ChessPiece";

// With White at the bottom, ranks run 8 → 1 from top to bottom and files run
// a → h from left to right; with Black at the bottom the board is turned 180°.
// `position` is always indexed from White's side (row 0 = rank 8, column 0 = file a).
const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;
const RANKS = [8, 7, 6, 5, 4, 3, 2, 1] as const;

// Roving tabindex: the board is a single tab stop and arrow keys move within it.
const INITIAL_FOCUS: Square = "a1";

type ChessboardProps = {
  position: Position;
  /** Which side is at the bottom. Defaults to White. */
  orientation?: Color;
  /** Side to move; only its pieces can be selected or dragged. */
  turn: Color;
  /** False once the game is over: nothing can be picked up. */
  interactive: boolean;
  selected: Square | null;
  /** Legal destinations for the selected piece. */
  destinations: Destinations;
  /** A square was clicked, or Enter/Space was pressed on it. */
  onSquareActivate: (square: Square) => void;
  onPieceDragStart: (square: Square) => void;
  /** A dragged piece was dropped on a legal destination. */
  onPieceDrop: (from: Square, to: Square) => void;
  onClearSelection: () => void;
  /** Squares of the last move in the position shown; omitted for no highlight. */
  lastMove?: LastMove | null;
  /**
   * Premoves waiting for the opponent to move, in the order they will be
   * played. The squares of every one are tinted red; `position` is expected to
   * already show the pieces where the premoves will leave them.
   */
  premoves?: readonly { from: Square; to: Square }[];
  /**
   * Opt-in "hold" dragging, driven by pointer events instead of native
   * drag-and-drop. The side given here can pick up its own pieces at any time
   * while `holdEnabled` is true, even when it is not `turn`; the piece stays on
   * its square (dimmed) and a copy follows the pointer. On release the board
   * reports `onPieceDrop(from, to)` for whatever square is under the pointer,
   * legal or not, and the owner decides whether to play it. Omit for the
   * default native drag-and-drop (used by the Analysis page).
   */
  holdColor?: Color;
  holdEnabled?: boolean;
  /** Changing this value cancels any drag in progress. */
  cancelDragSignal?: number;
  /** A held drag ended for any reason (drop, cancel, lost capture, ...). */
  onPieceDragEnd?: () => void;
  /**
   * Opt-in right-click arrow annotations. Right-drag from one square to
   * another toggles an arrow between them; the owner keeps the list (arrows
   * are purely visual) and receives the next list here. Providing
   * `onArrowsChange` also suppresses the browser context menu on the board.
   */
  arrows?: readonly ArrowAnnotation[];
  onArrowsChange?: (arrows: readonly ArrowAnnotation[]) => void;
  /**
   * Squares highlighted by right-clicking them (a right-click that doesn't
   * leave the square). Same ownership and opt-in as the arrows.
   */
  highlights?: readonly Square[];
  /**
   * Opt-in piece animation: when `slide` changes the pieces it names glide from
   * their old square to their new one. Set it for a move just played, or for
   * a single step through history (then `from` is where the piece stood in the
   * old view); each distinct `id` animates once, and any change of `position`
   * ends glides still in flight. `duration` overrides the default, in ms.
   */
  animatePieces?: boolean;
  slide?: { id: number; moves: readonly MoveSlide[]; duration?: number } | null;
  /**
   * Shades the squares and pieces (arrows stay on top) to mark a position that
   * is not the live one. Purely visual: it never takes pointer events.
   */
  dimmed?: boolean;
  /** A read-only arrow (e.g. the engine's best move), drawn above the squares. */
  engineArrow?: ArrowAnnotation | null;
  /**
   * A read-only arrow marking a move (e.g. a flagged move in game analysis),
   * drawn in `moveArrowClassName`'s text colour above the engine arrow.
   */
  moveArrow?: ArrowAnnotation | null;
  moveArrowClassName?: string;
  /** A read-only badge on a square, e.g. "??" on the landing square of a blunder. */
  moveBadge?: MoveBadge | null;
  onHighlightsChange?: (squares: readonly Square[]) => void;
};

export type { ArrowAnnotation };

const NO_PREMOVES: readonly { from: Square; to: Square }[] = [];

/** Which end of a premove each marked square is (a square used twice counts as "to"). */
function premoveRoles(
  premoves: readonly { from: Square; to: Square }[],
): ReadonlyMap<Square, "from" | "to"> {
  const roles = new Map<Square, "from" | "to">();
  for (const { from, to } of premoves) {
    if (!roles.has(from)) roles.set(from, "from");
    roles.set(to, "to");
  }
  return roles;
}

const sameArrow = (a: ArrowAnnotation, b: ArrowAnnotation) =>
  a.from === b.from && a.to === b.to;

/** Pointer travel (px) before a mouse press on a piece becomes a drag. */
const DRAG_THRESHOLD = 4;
/**
 * A finger wobbles far more than a mouse, so a touch or pen press needs more
 * travel to count as a drag; otherwise ordinary taps turn into drags.
 */
const TOUCH_DRAG_THRESHOLD = 10;
/**
 * After a press on a piece ends, the browser's own click on the same square is
 * part of that gesture (already handled from the pointer events) for this long.
 */
const CLICK_ECHO_MS = 500;
/** Only called from event handlers; a named helper keeps the purity lint quiet. */
const clockNow = () => performance.now();

type HeldDrag = {
  from: Square;
  piece: PieceCode;
  pointerId: number;
  /** "mouse", "touch" or "pen". Only a mouse lifts the piece before it moves. */
  pointerType: string;
  /** Square under the pointer, or null when it is off the board. */
  over: Square | null;
  /** Edge length of one square, in px. */
  size: number;
  /** Where the button went down, to tell a click from a real drag. */
  startX: number;
  startY: number;
  /** True once the pointer travelled past DRAG_THRESHOLD. */
  moved: boolean;
};
/** Row/column step for an arrow key, or null for any other key. */
function arrowStep(key: string): readonly [row: number, col: number] | null {
  switch (key) {
    case "ArrowUp":
      return [-1, 0];
    case "ArrowDown":
      return [1, 0];
    case "ArrowLeft":
      return [0, -1];
    case "ArrowRight":
      return [0, 1];
    default:
      return null;
  }
}

function describeSquare(
  square: Square,
  piece: Position[number][number],
  isSelected: boolean,
  destination: { capture: boolean } | undefined,
  lastMoveRole?: "from" | "to",
  premoveRole?: "from" | "to",
): string {
  const parts: string[] = [square, piece ? describePiece(piece) : "empty"];
  if (isSelected) parts.push("selected");
  if (destination) parts.push(destination.capture ? "capture" : "legal move");
  if (lastMoveRole) parts.push(`last move ${lastMoveRole}`);
  if (premoveRole) parts.push(`premove ${premoveRole}`);
  return parts.join(", ");
}

export default function Chessboard({
  position,
  orientation = "w",
  turn,
  interactive,
  selected,
  destinations,
  onSquareActivate,
  onPieceDragStart,
  onPieceDrop,
  onClearSelection,
  lastMove = null,
  premoves = NO_PREMOVES,
  holdColor,
  holdEnabled = false,
  cancelDragSignal = 0,
  onPieceDragEnd,
  arrows,
  onArrowsChange,
  highlights,
  onHighlightsChange,
  engineArrow = null,
  moveArrow = null,
  moveArrowClassName = "text-danger",
  moveBadge = null,
  animatePieces = false,
  slide = null,
  dimmed = false,
}: ChessboardProps) {
  const gridRef = useRef<HTMLDivElement>(null);
  const dragFrom = useRef<Square | null>(null);
  const premoveRoleOf = premoveRoles(premoves);
  const [focusSquare, setFocusSquare] = useState<Square>(INITIAL_FOCUS);

  // Hold-drag state. `heldRef` is the source of truth for event handlers (it
  // is current even between renders); `held` mirrors it for rendering.
  const holdMode = holdColor !== undefined;
  const pointerMode = holdMode || onArrowsChange !== undefined;
  const heldRef = useRef<HeldDrag | null>(null);
  const [held, setHeld] = useState<HeldDrag | null>(null);
  const pointerPos = useRef({ x: 0, y: 0 });
  // Squares of the press that just ended and when it ended, so the click the
  // browser sends for the same gesture is not counted a second time.
  const recentPointer = useRef<{ squares: readonly Square[]; at: number } | null>(
    null,
  );

  // Right-button arrow in progress: where it started and the square under the
  // pointer now is only read on release: nothing is drawn while dragging. The
  // ref is current between renders; `annotating` just tracks that a gesture is on.
  const arrowsEnabled = onArrowsChange !== undefined;
  const arrowRef = useRef<{
    from: Square;
    pointerId: number;
  } | null>(null);
  const [annotating, setAnnotating] = useState(false);

  // Glide pieces that just moved (FLIP): they are already on their new square,
  // so animate a transform from the old square's offset back to zero. Pieces
  // that did not move are never touched. Mounting with a slide already set
  // (e.g. a remount) does not animate.
  // Glides still running are cancelled whenever the position changes or a new
  // slide arrives: a piece element is reused for whatever stands on its square
  // next, so a leftover transform would drag the wrong piece across the board.
  const lastSlideId = useRef<number | null>(slide?.id ?? null);
  const lastPosition = useRef<Position>(position);
  const gliding = useRef<{ animation: Animation; cell: HTMLElement }[]>([]);
  useLayoutEffect(() => {
    const positionChanged = lastPosition.current !== position;
    lastPosition.current = position;
    const fresh =
      animatePieces && slide !== null && slide.id !== lastSlideId.current;
    if (positionChanged || fresh) {
      for (const { animation, cell } of gliding.current) {
        animation.onfinish = null;
        animation.oncancel = null;
        animation.cancel();
        cell.style.zIndex = "";
      }
      gliding.current = [];
    }
    if (!fresh || !slide) return;
    lastSlideId.current = slide.id;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const grid = gridRef.current;
    if (!grid) return;
    for (const { from, to } of slide.moves) {
      const toCell = grid.querySelector<HTMLElement>(`[data-square="${to}"]`);
      const fromCell = grid.querySelector<HTMLElement>(`[data-square="${from}"]`);
      const piece = toCell?.querySelector<HTMLElement>("[data-piece]");
      if (!toCell || !fromCell || !piece || typeof piece.animate !== "function") {
        continue;
      }
      const a = fromCell.getBoundingClientRect();
      const b = toCell.getBoundingClientRect();
      // Keep the gliding piece above its neighbours (but under the arrows).
      toCell.style.zIndex = "5";
      const animation = piece.animate(
        [
          { transform: `translate(${a.left - b.left}px, ${a.top - b.top}px)` },
          { transform: "translate(0, 0)" },
        ],
        {
          duration: slide.duration ?? 180,
          easing: "cubic-bezier(0.2, 0.7, 0.3, 1)",
        },
      );
      const entry = { animation, cell: toCell };
      gliding.current.push(entry);
      const done = () => {
        toCell.style.zIndex = "";
        gliding.current = gliding.current.filter((e) => e !== entry);
      };
      animation.onfinish = done;
      animation.oncancel = done;
    }
  }, [animatePieces, slide, position]);

  // Visual order of files/ranks (left → right, top → bottom).
  const files = orientation === "w" ? FILES : [...FILES].reverse();
  const ranks = orientation === "w" ? RANKS : [...RANKS].reverse();

  function focusCell(square: Square) {
    setFocusSquare(square);
    gridRef.current
      ?.querySelector<HTMLElement>(`[data-square="${square}"]`)
      ?.focus();
  }

  function handleKeyDown(
    event: KeyboardEvent<HTMLDivElement>,
    square: Square,
    row: number,
    col: number,
  ) {
    const step = arrowStep(event.key);
    if (step) {
      event.preventDefault();
      const nextRow = Math.min(7, Math.max(0, row + step[0]));
      const nextCol = Math.min(7, Math.max(0, col + step[1]));
      focusCell(`${files[nextCol]}${ranks[nextRow]}` as const);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSquareActivate(square);
    } else if (event.key === "Escape") {
      onClearSelection();
    }
  }

  function squareAt(x: number, y: number): Square | null {
    const rect = gridRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return null;
    if (x < rect.left || x >= rect.right || y < rect.top || y >= rect.bottom) {
      return null;
    }
    const col = Math.floor(((x - rect.left) / rect.width) * 8);
    const row = Math.floor(((y - rect.top) / rect.height) * 8);
    return `${files[Math.min(7, col)]}${ranks[Math.min(7, row)]}` as const;
  }

  // A press on a piece is fully handled from pointer events (a tap selects, a
  // drop moves). The browser then also sends a click for it. With a mouse that
  // click comes straight away, but on a touch screen it can arrive later than a
  // zero-delay timer, so it is matched by square and time instead of a flag.
  // Counting it would select the piece and then deselect it again.
  function markPointerHandled(...squares: Square[]) {
    recentPointer.current = { squares, at: clockNow() };
  }

  function isEchoClick(square: Square): boolean {
    const recent = recentPointer.current;
    if (!recent) return false;
    if (clockNow() - recent.at > CLICK_ECHO_MS) {
      recentPointer.current = null;
      return false;
    }
    if (!recent.squares.includes(square)) return false;
    recentPointer.current = null;
    return true;
  }

  function setHeldDrag(next: HeldDrag | null) {
    heldRef.current = next;
    setHeld(next);
  }

  // Ends any press or drag without playing anything. Safe to call at any time.
  function endHold(): HeldDrag | null {
    const drag = heldRef.current;
    if (!drag) return null;
    try {
      gridRef.current?.releasePointerCapture(drag.pointerId);
    } catch {
      // Capture was already gone.
    }
    setHeldDrag(null);
    onPieceDragEnd?.();
    return drag;
  }

  function cancelArrow() {
    if (!arrowRef.current) return;
    try {
      gridRef.current?.releasePointerCapture(arrowRef.current.pointerId);
    } catch {
      // Capture was already gone.
    }
    arrowRef.current = null;
    setAnnotating(false);
  }

  // A plain left-click on a square: wipes the arrows and highlights, then
  // carries on as the normal select / move click.
  function activateSquare(square: Square) {
    if (arrows && arrows.length > 0) onArrowsChange?.([]);
    if (highlights && highlights.length > 0) onHighlightsChange?.([]);
    onSquareActivate(square);
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    // Right button: start an arrow. It never selects, picks up or moves
    // anything, and is ignored while a piece is being dragged.
    if (arrowsEnabled && event.pointerType === "mouse" && event.button === 2) {
      if (heldRef.current || arrowRef.current) return;
      const cell = (event.target as Element).closest<HTMLElement>("[data-square]");
      const from = cell?.dataset.square as Square | undefined;
      if (!from) return;
      arrowRef.current = { from, pointerId: event.pointerId };
      setAnnotating(true);
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // Drawing still works while the pointer stays over the board.
      }
      return;
    }
    if (!holdMode || !holdEnabled || heldRef.current) return;
    if (!event.isPrimary || (event.pointerType === "mouse" && event.button !== 0)) {
      return;
    }
    const cell = (event.target as Element).closest<HTMLElement>("[data-square]");
    const square = cell?.dataset.square as Square | undefined;
    if (!square) return;
    const piece = position[8 - Number(square[1])][FILES.indexOf(square[0] as (typeof FILES)[number])];
    if (!piece || piece[0] !== holdColor) return;
    // Pick the piece up right away: its copy is centred under the pointer from
    // this very event. The press only becomes a real drag (selection, hints,
    // a possible move) once the pointer moves; until then a release is a click.
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Dragging still works while the pointer stays over the board.
    }
    pointerPos.current = { x: event.clientX, y: event.clientY };
    setHeldDrag({
      from: square,
      piece,
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      over: square,
      size: event.currentTarget.getBoundingClientRect().width / 8,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
    });
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (arrowRef.current) {
      // Right-button gestures never pick up or move pieces, and show nothing
      // until release.
      return;
    }
    const drag = heldRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    pointerPos.current = { x: event.clientX, y: event.clientY };
    placeFloater(floaterRef.current);
    const over = squareAt(event.clientX, event.clientY);
    const threshold =
      drag.pointerType === "mouse" ? DRAG_THRESHOLD : TOUCH_DRAG_THRESHOLD;
    const moved =
      drag.moved ||
      Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) >=
        threshold;
    if (moved && !drag.moved) {
      // The press became a drag.
      onPieceDragStart(drag.from);
    }
    if (moved !== drag.moved || over !== drag.over) {
      setHeldDrag({ ...drag, over, moved });
    }
  }

  function handlePointerUp(event: PointerEvent<HTMLDivElement>) {
    const arrow = arrowRef.current;
    if (arrow) {
      if (event.pointerId !== arrow.pointerId || event.button !== 2) return;
      const to = squareAt(event.clientX, event.clientY);
      cancelArrow();
      if (to && to === arrow.from) {
        // A right-click that never left its square toggles the highlight.
        const current = highlights ?? [];
        onHighlightsChange?.(
          current.includes(to)
            ? current.filter((square) => square !== to)
            : [...current, to],
        );
      } else if (to && onArrowsChange) {
        // Releasing off the board draws nothing.
        const next = { from: arrow.from, to };
        const current = arrows ?? [];
        onArrowsChange(
          current.some((a) => sameArrow(a, next))
            ? current.filter((a) => !sameArrow(a, next))
            : [...current, next],
        );
      }
      return;
    }
    const drag = heldRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    // Only releasing the left button drops; another button is not the drag's.
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const over = squareAt(event.clientX, event.clientY);
    endHold();
    // The click that follows this press must not count a second time.
    markPointerHandled(drag.from, ...(over ? [over] : []));
    if (!drag.moved) {
      // Never really dragged: a plain click or tap on the piece. Capture can
      // redirect the browser's own click, so run the click handling here.
      if (holdEnabled) activateSquare(drag.from);
      return;
    }
    // The owner re-checks whose turn it is and whether the move is legal.
    if (over && over !== drag.from && holdEnabled) onPieceDrop(drag.from, over);
  }

  function handlePointerAbort(event: PointerEvent<HTMLDivElement>) {
    if (arrowRef.current?.pointerId === event.pointerId) cancelArrow();
    if (heldRef.current?.pointerId !== event.pointerId) return;
    endHold();
  }

  const floaterRef = useRef<HTMLDivElement | null>(null);
  function placeFloater(element: HTMLDivElement | null) {
    floaterRef.current = element;
    if (!element) return;
    element.style.left = `${pointerPos.current.x}px`;
    element.style.top = `${pointerPos.current.y}px`;
  }

  // Drag teardown when the game takes the piece away: play is no longer
  // allowed (game over, resign, new game, history browsing) or the owner asked
  // for a reset (undo, restart, flag).
  useEffect(() => {
    if (!holdEnabled) endHold();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [holdEnabled]);
  useEffect(() => {
    endHold();
    cancelArrow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cancelDragSignal]);

  // Escape or losing window focus cancels a drag in progress.
  const dragging = held !== null || annotating;
  useEffect(() => {
    if (!dragging) return;
    const cancel = () => {
      endHold();
      cancelArrow();
    };
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") cancel();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("blur", cancel);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("blur", cancel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragging]);

  function handleDragStart(event: DragEvent<HTMLDivElement>, square: Square) {
    dragFrom.current = square;
    event.dataTransfer.effectAllowed = "move";
    // Firefox won't start a drag unless some data is set.
    event.dataTransfer.setData("text/plain", square);

    // Drag just the piece, not the whole coloured square.
    const image = event.currentTarget.querySelector("img");
    if (image) {
      const { width, height } = image.getBoundingClientRect();
      event.dataTransfer.setDragImage(image, width / 2, height / 2);
    }
    onPieceDragStart(square);
  }

  // A mouse lifts the piece the moment it is pressed. A finger does not: until
  // it has really moved, a touch is still a tap, so the piece stays put (no
  // ghost copy under the finger) and releasing just selects it.
  const lifted =
    held !== null && (held.moved || held.pointerType === "mouse");

  return (
    <div
      ref={gridRef}
      role="grid"
      aria-label={`Chessboard, ${orientation === "w" ? "White" : "Black"} at the bottom`}
      onPointerDown={pointerMode ? handlePointerDown : undefined}
      onPointerMove={pointerMode ? handlePointerMove : undefined}
      onPointerUp={pointerMode ? handlePointerUp : undefined}
      onPointerCancel={pointerMode ? handlePointerAbort : undefined}
      onLostPointerCapture={pointerMode ? handlePointerAbort : undefined}
      onContextMenu={arrowsEnabled ? (event) => event.preventDefault() : undefined}
      className={`relative grid aspect-square w-full grid-cols-8 grid-rows-8 overflow-hidden rounded-sm ${lifted ? "cursor-grabbing" : ""} shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_28px_60px_-28px_rgba(0,0,0,0.9)]`}
    >
      {ranks.map((rank, row) => (
        // `contents` keeps the row wrapper out of the layout: the squares
        // remain direct grid items of the board.
        <div key={rank} role="row" className="contents">
          {files.map((file, col) => {
            const square = `${file}${rank}` as const;
            const isDark = (row + col) % 2 === 1;
            const ink = isDark ? "text-square-dark-ink" : "text-square-light-ink";
            const piece = position[8 - rank][FILES.indexOf(file)];

            const isSelected = selected === square;
            const destination = destinations.get(square);
            const lastMoveRole =
              lastMove?.from === square
                ? "from"
                : lastMove?.to === square
                  ? "to"
                  : undefined;
            const premoveRole = premoveRoleOf.get(square);
            const canPick = interactive && piece?.[0] === turn;
            const isClickable = canPick || destination !== undefined;
            const canHold =
              holdMode && holdEnabled && piece?.[0] === holdColor;
            const isHeldSource = lifted && held?.from === square;
            const isOver = held?.moved === true && held.over === square;

            return (
              <div
                key={square}
                role="gridcell"
                data-square={square}
                aria-label={describeSquare(
                  square,
                  piece,
                  isSelected,
                  destination,
                  lastMoveRole,
                  premoveRole,
                )}
                aria-selected={isSelected}
                tabIndex={square === focusSquare ? 0 : -1}
                draggable={!holdMode && canPick}
                onClick={() => {
                  // The click echo of a press the pointer handlers already
                  // handled (a tap or a drop) is not a second click.
                  if (isEchoClick(square)) return;
                  activateSquare(square);
                }}
                onFocus={() => setFocusSquare(square)}
                onKeyDown={(event) => handleKeyDown(event, square, row, col)}
                onDragStart={
                  canPick ? (event) => handleDragStart(event, square) : undefined
                }
                onDragOver={(event) => {
                  // Only legal destinations accept a drop.
                  if (dragFrom.current && destination) {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                  }
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  const from = dragFrom.current;
                  dragFrom.current = null;
                  if (from && destination) onPieceDrop(from, square);
                }}
                onDragEnd={() => {
                  dragFrom.current = null;
                }}
                className={`relative ${canHold ? "touch-none" : "touch-manipulation"} select-none outline-none [-webkit-tap-highlight-color:transparent] focus-visible:shadow-[inset_0_0_0_2px_var(--background),inset_0_0_0_4px_var(--foreground)] ${
                  isDark ? "bg-square-dark" : "bg-square-light"
                } ${canHold && !held ? "cursor-grab" : isClickable ? "cursor-pointer" : ""}`}
              >
                {lastMoveRole && (
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-0 bg-board-last/45"
                  />
                )}
                {premoveRole && (
                  <span
                    aria-hidden
                    data-premove={premoveRole}
                    className="pointer-events-none absolute inset-0 bg-red-600/55"
                  />
                )}
                {highlights?.includes(square) && (
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-0 bg-red-600/45"
                  />
                )}
                {isSelected && (
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-0 bg-board-select/55"
                  />
                )}
                {isOver && (
                  <span
                    aria-hidden
                    className={`pointer-events-none absolute inset-0 shadow-[inset_0_0_0_3px_rgba(255,255,255,0.7)] ${
                      destination ? "bg-board-select/40" : ""
                    }`}
                  />
                )}
                {piece && (
                  <span
                    data-piece=""
                    className={`absolute inset-0 ${isHeldSource ? "opacity-0" : ""}`}
                  >
                    <ChessPiece piece={piece} square={square} decorative />
                  </span>
                )}
                {destination &&
                  (destination.capture ? (
                    <span
                      aria-hidden
                      className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_closest-side,transparent_78%,rgb(0_0_0/0.3)_80%,rgb(0_0_0/0.3)_96%,transparent_98%)]"
                    />
                  ) : (
                    <span
                      aria-hidden
                      className="pointer-events-none absolute inset-[35%] rounded-full bg-black/30"
                    />
                  ))}
                {col === 0 && (
                  <span
                    aria-hidden
                    className={`absolute left-[6%] top-[4%] select-none font-mono text-[10px] font-medium leading-none sm:text-xs ${ink}`}
                  >
                    {rank}
                  </span>
                )}
                {row === 7 && (
                  <span
                    aria-hidden
                    className={`absolute bottom-[4%] right-[6%] select-none font-mono text-[10px] font-medium leading-none sm:text-xs ${ink}`}
                  >
                    {file}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      ))}
      {dimmed && (
        // Above the squares and pieces (even a gliding one), below the arrows.
        <span
          aria-hidden
          data-history-dim=""
          className="pointer-events-none absolute inset-0 z-[6] bg-black/30"
        />
      )}
      {arrows && arrows.length > 0 && (
        <ArrowOverlay
          arrows={arrows}
          orientation={orientation}
          className="text-amber-500"
        />
      )}
      {moveArrow && (
        <ArrowOverlay
          arrows={[moveArrow]}
          orientation={orientation}
          className={moveArrowClassName}
          opacity={0.85}
        />
      )}
      {engineArrow && (
        // The engine's suggestion: a different colour from the drawn arrows.
        <ArrowOverlay
          arrows={[engineArrow]}
          orientation={orientation}
          className="text-board-last"
          opacity={0.8}
        />
      )}
      {moveBadge && (
        <MoveBadgeOverlay badge={moveBadge} orientation={orientation} />
      )}
      {held && lifted && (
        // The piece that follows the pointer. It is positioned imperatively on
        // pointer moves (see placeFloater) so re-renders never snap it back.
        <div
          ref={placeFloater}
          aria-hidden
          className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-1/2 drop-shadow-[0_6px_8px_rgba(0,0,0,0.45)]"
          style={{ width: held.size, height: held.size }}
        >
          <ChessPiece piece={held.piece} decorative />
        </div>
      )}
    </div>
  );
}
