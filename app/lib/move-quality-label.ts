// What the move-quality label says, as plain data, so the wording and the
// "never show another move's label" rule can be tested without rendering.

import { markFor } from "./quality-style.ts";
import type {
  ClassificationReason,
  MoveClassification,
  MoveQuality,
  UnavailableReason,
} from "./move-classification.ts";

/** What the hook reports for the move at the cursor. */
export type MoveClassificationStatus =
  | { phase: "idle" } // nothing to classify (start position, or not enabled)
  | { phase: "thinking" } // evaluations are missing and being fetched
  | {
      phase: "done";
      /** The `MoveContext.key` this result was computed for. */
      contextKey: string;
      classification: MoveClassification;
    }
  | { phase: "error"; contextKey: string; message: string };

export type LabelTone =
  | "brilliant"
  | "great"
  | "best"
  | "good"
  | "inaccuracy"
  | "mistake"
  | "blunder"
  | "pending"
  | "unavailable";

export type MoveQualityLabel = {
  /** Short text shown beside the move, e.g. "Inaccuracy". */
  text: string;
  tone: LabelTone;
  /** A fuller sentence for tooltips and screen readers. */
  description: string;
  /** The annotation mark (such as "??"), or null for unmarked qualities. */
  glyph: string | null;
  /** True while the label is a placeholder rather than a result. */
  pending: boolean;
};

const QUALITY_TEXT: Record<MoveQuality, string> = {
  brilliant: "Brilliant",
  great: "Great",
  best: "Best",
  excellent: "Excellent",
  good: "Good",
  inaccuracy: "Inaccuracy",
  mistake: "Mistake",
  blunder: "Blunder",
};

const QUALITY_TONE: Record<MoveQuality, LabelTone> = {
  brilliant: "brilliant",
  great: "great",
  best: "best",
  excellent: "best",
  good: "good",
  inaccuracy: "inaccuracy",
  mistake: "mistake",
  blunder: "blunder",
};

const REASON_TEXT: Record<ClassificationReason, string> = {
  "centipawn-loss": "",
  "mate-delivered": "reaches or keeps a forced mate",
  "mate-lost": "gives up a forced mate",
  "mate-allowed": "allows a forced mate",
  "mate-escaped": "escapes a forced mate",
  "mate-hastened": "lets the opponent mate sooner",
  "mate-unchanged": "the position was already lost to mate",
};

const UNAVAILABLE_TEXT: Record<UnavailableReason, string> = {
  "missing-evaluation": "no engine evaluation is available for this move",
  "invalid-evaluation": "the engine evaluation for this move could not be used",
};

const PENDING: MoveQualityLabel = {
  text: "Classifying…",
  tone: "pending",
  glyph: null,
  description: "Evaluating the positions before and after this move",
  pending: true,
};

/** `centipawns` as pawns with one or two decimals trimmed, e.g. 73 → "0.73". */
const pawns = (centipawns: number) => (centipawns / 100).toFixed(2);

/**
 * The label for the move whose context key is `contextKey`, or null when there
 * is nothing to label (no move selected, or classification is switched off).
 * A result computed for any other move, or a failure for one, is treated as
 * still pending, so navigating to another move can never show the previous
 * move's label.
 */
export function moveQualityLabel(
  status: MoveClassificationStatus,
  contextKey: string | null,
): MoveQualityLabel | null {
  if (contextKey === null || status.phase === "idle") return null;
  if (status.phase === "thinking") return PENDING;

  if (status.contextKey !== contextKey) return PENDING;

  if (status.phase === "error") {
    return {
      text: "Unavailable",
      tone: "unavailable",
      glyph: null,
      description: `Move quality is unavailable: ${status.message}`,
      pending: false,
    };
  }

  const result = status.classification;
  if (result.status === "unavailable") {
    return {
      text: "Unavailable",
      tone: "unavailable",
      glyph: null,
      description: `Move quality is unavailable: ${UNAVAILABLE_TEXT[result.reason]}`,
      pending: false,
    };
  }

  const text = QUALITY_TEXT[result.quality];
  const detail =
    result.centipawnLoss !== null
      ? result.centipawnLoss === 0
        ? "no evaluation lost"
        : `${pawns(result.centipawnLoss)} pawns lost`
      : REASON_TEXT[result.reason];
  return {
    text,
    tone: QUALITY_TONE[result.quality],
    glyph: markFor(result.quality)?.glyph ?? null,
    description: detail ? `${text}: ${detail}` : text,
    pending: false,
  };
}
