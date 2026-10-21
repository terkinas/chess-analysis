const BUTTON =
  "rounded-md border border-line px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent aria-disabled:cursor-not-allowed aria-disabled:opacity-40 aria-disabled:hover:bg-transparent";

type GameNavigationProps = {
  /** The move the cursor is on (0 = start position). */
  ply: number;
  /** Number of moves on the shown line. */
  total: number;
  onSelectPly: (ply: number) => void;
  onReset: () => void;
  /** Layout classes: where and how the bar sits (see its two uses). */
  className?: string;
};

/**
 * Previous / Next / Reset. Used twice: under the board on small screens, so the
 * buttons are on screen together with the board, and at the bottom of the
 * analysis panel on large screens. Only one of the two is ever displayed.
 */
export default function GameNavigation({
  ply,
  total,
  onSelectPly,
  onReset,
  className = "",
}: GameNavigationProps) {
  const atStart = ply === 0;
  const atEnd = ply === total;
  const hasMoves = total > 0;

  return (
    <div
      role="group"
      aria-label="Game navigation"
      className={`grid grid-cols-3 gap-2 ${className}`}
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
  );
}
