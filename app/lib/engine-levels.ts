import type { SearchLimit } from "./stockfish-engine";

// Difficulty is expressed purely as a Stockfish search limit (depth or time);
// the engine always plays the best move it finds within it. No random or
// deliberately bad moves.
export type EngineLevel = {
  id: string;
  label: string;
  limit: SearchLimit;
};

export const ENGINE_LEVELS: readonly EngineLevel[] = [
  { id: "beginner", label: "Beginner · depth 1", limit: { depth: 1 } },
  { id: "easy", label: "Easy · depth 3", limit: { depth: 3 } },
  { id: "standard", label: "Standard · 1 s", limit: { moveTimeMs: 1000 } },
  { id: "hard", label: "Hard · 3 s", limit: { moveTimeMs: 3000 } },
  { id: "expert", label: "Expert · 8 s", limit: { moveTimeMs: 8000 } },
];

/** The 1-second behaviour from the engine foundation step. */
export const DEFAULT_LEVEL_ID = "standard";

export function getLevel(id: string): EngineLevel {
  return (
    ENGINE_LEVELS.find((level) => level.id === id) ??
    ENGINE_LEVELS.find((level) => level.id === DEFAULT_LEVEL_ID)!
  );
}
