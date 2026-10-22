// Plain-language reasons for a move's rating, built only from numbers the game
// review already has (the engine's score before and after the move, its best
// move and lines). Pure data in, text and lines out: nothing here searches,
// plays a move, or touches the board, so the wording can be tested on its own.

import {
  scoreForPlayer,
  type ClassificationReason,
  type MoveClassification,
  type MoveQuality,
} from "./move-classification.ts";
import type { MoveContext } from "./move-context.ts";
import type { PvLine } from "./pv-format.ts";
import type { WhiteScore } from "./uci-info.ts";
import type { PositionEvaluation } from "./use-position-analysis.ts";

type Color = "w" | "b";

/** A line of engine moves the board can step through. */
export type ExplanationLine = {
  /** Button text, e.g. "Show the best line (Nf3)". */
  label: string;
  /** Starts from the position the line belongs to (index 0 on the board). */
  pv: PvLine;
};

export type LineKind = "best" | "next";

export type MoveExplanation = {
  /** The `MoveContext.key` this explanation was built for. */
  key: string;
  quality: MoveQuality;
  /** One sentence: what the rating means for this move. */
  headline: string;
  /** Supporting sentences, in reading order. */
  points: string[];
  /**
   * `best`: the engine's line from the position before the move (the move
   * itself, when it was the engine's choice). `next`: what the engine expects
   * after the move that was played; only for moves that were not the best.
   */
  lines: { best: ExplanationLine | null; next: ExplanationLine | null };
};

const colorName = (color: Color): string => (color === "w" ? "White" : "Black");

const pawns = (cp: number): string => (Math.abs(cp) / 100).toFixed(1);

/** A score from `player`'s side, e.g. "+0.4", "-2.8", "mate in 3". */
export function describeScore(score: WhiteScore, player: Color): string {
  const s = scoreForPlayer(score, player);
  if (s.kind === "mate") {
    if (s.moves === 0) return s.winning ? "checkmate" : "checkmated";
    return s.winning ? `mate in ${s.moves}` : `getting mated in ${s.moves}`;
  }
  const rounded = Math.round(s.cp / 10) / 10;
  if (rounded === 0) return "0.0";
  return `${rounded > 0 ? "+" : "-"}${pawns(s.cp)}`;
}

/** How the position stands for `player`, in words. */
export function describeStanding(score: WhiteScore, player: Color): string {
  const s = scoreForPlayer(score, player);
  if (s.kind === "mate") return s.winning ? "winning by force" : "lost to a forced mate";
  const cp = s.cp;
  if (cp >= 300) return "close to winning";
  if (cp >= 120) return "clearly better";
  if (cp >= 40) return "a little better";
  if (cp > -40) return "about equal";
  if (cp > -120) return "a little worse";
  if (cp > -300) return "clearly worse";
  return "close to lost";
}

const MATE_SENTENCE: Record<ClassificationReason, string | null> = {
  "centipawn-loss": null,
  "mate-delivered": "It reaches or keeps a forced mate.",
  "mate-lost": "It throws away a forced mate that was available.",
  "mate-allowed": "It allows a forced mate that was not there before.",
  "mate-escaped": "It escapes a forced mate against it.",
  "mate-hastened": "It lets the opponent deliver mate sooner.",
  "mate-unchanged": "The position was already lost to a forced mate.",
};

function line(
  label: string,
  pv: PvLine | undefined,
): ExplanationLine | null {
  return pv && pv.moves.length > 0 ? { label, pv } : null;
}

type Input = {
  context: MoveContext;
  classification: MoveClassification | null;
  /** The engine's evaluation of the position before the move, if known. */
  before: PositionEvaluation | null;
  /** The engine's evaluation of the position after the move, if known. */
  after: PositionEvaluation | null;
};

/** The explanation for a classified move, or null while there is none to give. */
export function buildMoveExplanation({
  context,
  classification,
  before,
  after,
}: Input): MoveExplanation | null {
  if (!classification || classification.status !== "classified") return null;
  const { quality, centipawnLoss, reason } = classification;
  const { san, mover } = context;
  const name = colorName(mover);
  const opponent = colorName(mover === "w" ? "b" : "w");
  const bestSan = before?.bestMoveSan ?? null;
  const playedBest = bestSan === san;
  const mateSentence = MATE_SENTENCE[reason];

  const beforeText = before ? describeScore(before.score, mover) : null;
  // The engine's own best move keeps the score of the position before it.
  const afterScore = playedBest ? before?.score : after?.score;
  const afterText = afterScore ? describeScore(afterScore, mover) : null;
  const swing =
    beforeText && afterText ? `${name}'s score went from ${beforeText} to ${afterText}.` : null;

  const points: string[] = [];
  let headline: string;

  if (quality === "brilliant") {
    headline = `${san} is brilliant: it gives up material, yet the engine finds that ${name} is still fine.`;
    if (afterScore) {
      points.push(
        `After the sacrifice ${name} is ${describeStanding(afterScore, mover)} (${afterText}).`,
      );
    }
    points.push(
      "Sacrifices usually look bad at first. The engine's line shows how the material comes back or what the move gains in return.",
    );
  } else if (quality === "great") {
    headline = `${san} is a great move: it holds on to what ${name} had when the alternatives do not.`;
    if (before?.secondScore) {
      points.push(
        `The engine's next-best move would leave ${name} at ${describeScore(before.secondScore, mover)}, compared with ${beforeText} for ${san}.`,
      );
    }
  } else if (quality === "best" || quality === "excellent") {
    headline = playedBest
      ? `${san} is the engine's top choice here.`
      : `${san} is almost as good as the engine's top choice${bestSan ? ` (${bestSan})` : ""}.`;
    if (afterScore) {
      points.push(`${name} is ${describeStanding(afterScore, mover)} (${afterText}).`);
    }
  } else if (quality === "good") {
    headline = `${san} is a reasonable move, a little weaker than the engine's choice.`;
    if (bestSan) points.push(`The engine preferred ${bestSan}.`);
    if (swing) points.push(swing);
  } else {
    // inaccuracy, mistake, blunder
    const what =
      quality === "blunder"
        ? "a blunder"
        : quality === "mistake"
          ? "a mistake"
          : "an inaccuracy";
    headline =
      centipawnLoss !== null
        ? `${san} is ${what}: it costs ${name} about ${pawns(centipawnLoss)} pawns of evaluation.`
        : `${san} is ${what}.`;
    if (mateSentence) points.push(mateSentence);
    if (swing) points.push(swing);
    if (bestSan && !playedBest) {
      points.push(
        beforeText
          ? `${bestSan} was better and would have kept ${name} at ${beforeText}.`
          : `${bestSan} was better.`,
      );
    }
    const reply = after?.pv.moves[0]?.san;
    if (reply) {
      points.push(`${opponent}'s best reply is ${reply}; the line shows how the engine expects it to go.`);
    }
  }

  if (
    (quality === "best" || quality === "excellent" || quality === "great") &&
    mateSentence &&
    reason !== "mate-unchanged"
  ) {
    points.push(mateSentence);
  }

  const best = line(
    playedBest ? "Show the engine's line" : `Show the better line${bestSan ? ` (${bestSan})` : ""}`,
    before?.pv,
  );
  const next = playedBest ? null : line("Show what happens next", after?.pv);

  return { key: context.key, quality, headline, points, lines: { best, next } };
}
