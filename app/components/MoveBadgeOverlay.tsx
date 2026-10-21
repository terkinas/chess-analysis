import type { Color, Square } from "chess.js";

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;
const RANKS = [8, 7, 6, 5, 4, 3, 2, 1] as const;

export type MoveBadge = {
  /** The square the move landed on. */
  square: Square;
  /** The annotation mark, such as "??". */
  glyph: string;
  /** A text-colour class; the badge is filled with that colour. */
  className: string;
};

/**
 * A small round badge in the top-right corner of one square, showing how good
 * or bad the move that landed there was. It fills its positioned parent, never
 * takes pointer events, and follows the board's orientation like the arrows do.
 */
export default function MoveBadgeOverlay({
  badge,
  orientation,
}: {
  badge: MoveBadge;
  orientation: Color;
}) {
  const files = orientation === "w" ? [...FILES] : [...FILES].reverse();
  const ranks = orientation === "w" ? [...RANKS] : [...RANKS].reverse();
  const column = files.indexOf(badge.square[0] as (typeof FILES)[number]);
  const row = ranks.indexOf(Number(badge.square[1]) as (typeof RANKS)[number]);
  if (column < 0 || row < 0) return null;
  const radius = 0.25;
  // Tucked inside the square, so a badge on the edge of the board is not cut off.
  const cx = column + 1 - radius;
  const cy = row + radius;
  return (
    <svg
      aria-hidden
      viewBox="0 0 8 8"
      className={`pointer-events-none absolute inset-0 z-[11] h-full w-full ${badge.className}`}
    >
      <circle
        cx={cx}
        cy={cy}
        r={radius}
        strokeWidth={0.04}
        className="fill-current stroke-background"
      />
      <text
        x={cx}
        y={cy}
        fontSize={0.3}
        fontWeight={800}
        textAnchor="middle"
        dominantBaseline="central"
        className="fill-background"
      >
        {badge.glyph}
      </text>
    </svg>
  );
}
