// How each noteworthy move quality looks, in one place: its annotation mark, its
// colour classes, and whether it gets an arrow. Pure data with no React, so the
// move list, the board badge, the graph and the accuracy table all agree.
//
// Class names are written out in full (never built from pieces) so Tailwind can
// find them.

import type { MoveQuality } from "./move-classification.ts";

/** The qualities that are called out; best, excellent and good stay unmarked. */
export type NotableQuality =
  | "brilliant"
  | "great"
  | "inaccuracy"
  | "mistake"
  | "blunder";

export type QualityMark = {
  /** Plain word, e.g. for tooltips and screen readers. */
  label: string;
  /** Chess annotation symbol shown beside the move. */
  glyph: string;
  /** Coloured text. */
  text: string;
  /** Solid fill, for dots and badges. */
  fill: string;
  /** True for the bad moves, which also get an arrow on the board. */
  arrow: boolean;
};

export const QUALITY_MARK: Record<NotableQuality, QualityMark> = {
  brilliant: {
    label: "Brilliant",
    glyph: "!!",
    text: "text-brilliant",
    fill: "bg-brilliant",
    arrow: false,
  },
  great: {
    label: "Great",
    glyph: "!",
    text: "text-board-last",
    fill: "bg-board-last",
    arrow: false,
  },
  inaccuracy: {
    label: "Inaccuracy",
    glyph: "?!",
    text: "text-board-select",
    fill: "bg-board-select",
    arrow: true,
  },
  mistake: {
    label: "Mistake",
    glyph: "?",
    text: "text-mistake",
    fill: "bg-mistake",
    arrow: true,
  },
  blunder: {
    label: "Blunder",
    glyph: "??",
    text: "text-danger",
    fill: "bg-danger",
    arrow: true,
  },
};

/** Display order, best news first. */
export const NOTABLE_ORDER: readonly NotableQuality[] = [
  "brilliant",
  "great",
  "inaccuracy",
  "mistake",
  "blunder",
];

export function isNotable(
  quality: MoveQuality | null | undefined,
): quality is NotableQuality {
  return quality != null && quality in QUALITY_MARK;
}

/** The mark for `quality`, or null for best, excellent, good and unjudged moves. */
export function markFor(
  quality: MoveQuality | null | undefined,
): QualityMark | null {
  return isNotable(quality) ? QUALITY_MARK[quality] : null;
}
