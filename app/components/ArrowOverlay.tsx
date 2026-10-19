import type { Color, Square } from "chess.js";

export type ArrowAnnotation = { from: Square; to: Square };

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;
const RANKS = [8, 7, 6, 5, 4, 3, 2, 1] as const;

// Arrow geometry, in square widths (a square is 1 unit in the SVG's viewBox).
// The tail starts this far inside the border facing the first leg.
const TAIL_BORDER_GAP = 0.08;
const TIP_GAP = 0; // the head points into the destination centre
const SHAFT_HALF_WIDTH = 0.085;
const HEAD_LENGTH = 0.4;
const HEAD_HALF_WIDTH = 0.27;

/**
 * Arrow from near the border of one square to the centre of the next, in board
 * units. A knight move is drawn as an L: two squares along the axis with the
 * larger displacement, then one square turning toward the destination. Every
 * other arrow is a straight line. Works in visual coordinates, so it is the
 * same in both orientations. The outline is a filled shape with a thin,
 * screen-sized (non-scaling) round-joined stroke, which gives every corner a
 * radius of about 1px at any board size.
 */
function ArrowShape({
  x1,
  y1,
  x2,
  y2,
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}) {
  const adx = Math.abs(x2 - x1);
  const ady = Math.abs(y2 - y1);
  const isKnight = (adx === 2 && ady === 1) || (adx === 1 && ady === 2);
  // The bend: along x first when x is the long axis, otherwise along y first.
  const corner: [number, number] | null = isKnight
    ? adx > ady
      ? [x2, y1]
      : [x1, y2]
    : null;

  // First leg: the tail starts just inside the border of the source square
  // that the leg leaves through (0.5 / max(|ux|,|uy|) from the centre).
  const [firstX, firstY] = corner ?? [x2, y2];
  const firstLength = Math.hypot(firstX - x1, firstY - y1);
  const fx = (firstX - x1) / firstLength;
  const fy = (firstY - y1) / firstLength;
  const tail = 0.5 / Math.max(Math.abs(fx), Math.abs(fy)) - TAIL_BORDER_GAP;
  const startX = x1 + fx * tail;
  const startY = y1 + fy * tail;

  // Final leg: the head points along it into the destination centre.
  const [fromX, fromY] = corner ?? [x1, y1];
  const length = Math.hypot(x2 - fromX, y2 - fromY);
  const ux = (x2 - fromX) / length;
  const uy = (y2 - fromY) / length;
  const tipX = x2 - ux * TIP_GAP;
  const tipY = y2 - uy * TIP_GAP;
  const baseX = tipX - ux * HEAD_LENGTH;
  const baseY = tipY - uy * HEAD_LENGTH;
  // The shaft runs slightly into the head so the two shapes overlap.
  const endX = baseX + ux * 0.02;
  const endY = baseY + uy * 0.02;

  // Shaft outline: offset the centre line by the half width on both sides. At
  // the 90° bend the offset corner is (n1 + n2) * w.
  const w = SHAFT_HALF_WIDTH;
  const n1x = -fy;
  const n1y = fx;
  const n2x = -uy;
  const n2y = ux;
  const shaft = corner
    ? [
        [startX + n1x * w, startY + n1y * w],
        [corner[0] + (n1x + n2x) * w, corner[1] + (n1y + n2y) * w],
        [endX + n2x * w, endY + n2y * w],
        [endX - n2x * w, endY - n2y * w],
        [corner[0] - (n1x + n2x) * w, corner[1] - (n1y + n2y) * w],
        [startX - n1x * w, startY - n1y * w],
      ]
    : [
        [startX + n1x * w, startY + n1y * w],
        [endX + n1x * w, endY + n1y * w],
        [endX - n1x * w, endY - n1y * w],
        [startX - n1x * w, startY - n1y * w],
      ];
  const head = [
    [tipX, tipY],
    [baseX + n2x * HEAD_HALF_WIDTH, baseY + n2y * HEAD_HALF_WIDTH],
    [baseX - n2x * HEAD_HALF_WIDTH, baseY - n2y * HEAD_HALF_WIDTH],
  ];
  const toPoints = (points: number[][]) =>
    points.map(([x, y]) => `${x},${y}`).join(" ");
  const shapeProps = {
    strokeWidth: 2, // px, thanks to non-scaling-stroke: ~1px corner radius
    strokeLinejoin: "round" as const,
    vectorEffect: "non-scaling-stroke" as const,
    className: "fill-current stroke-current",
  };
  return (
    <>
      <polygon points={toPoints(shaft)} {...shapeProps} />
      <polygon points={toPoints(head)} {...shapeProps} />
    </>
  );
}

/**
 * One SVG layer of arrows above a board's squares and pieces. It fills its
 * positioned parent, never receives pointer events, and works in the board's
 * visual coordinates, so it follows `orientation` and any board size. Colour
 * comes from the text colour in `className`.
 */
export default function ArrowOverlay({
  arrows,
  orientation,
  className,
  opacity = 0.68,
}: {
  arrows: readonly ArrowAnnotation[];
  orientation: Color;
  className?: string;
  opacity?: number;
}) {
  const files = orientation === "w" ? [...FILES] : [...FILES].reverse();
  const ranks = orientation === "w" ? [...RANKS] : [...RANKS].reverse();
  const center = (square: Square): [number, number] => [
    files.indexOf(square[0] as (typeof FILES)[number]) + 0.5,
    ranks.indexOf(Number(square[1]) as (typeof RANKS)[number]) + 0.5,
  ];
  return (
    <svg
      aria-hidden
      viewBox="0 0 8 8"
      className={`pointer-events-none absolute inset-0 z-10 h-full w-full ${className ?? ""}`}
    >
      {arrows.map((arrow) => {
        const [x1, y1] = center(arrow.from);
        const [x2, y2] = center(arrow.to);
        return (
          <g key={`${arrow.from}${arrow.to}`} opacity={opacity}>
            <ArrowShape x1={x1} y1={y1} x2={x2} y2={y2} />
          </g>
        );
      })}
    </svg>
  );
}
