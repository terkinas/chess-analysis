import type { SaveGameRequest, StoredGame } from "./game-record";

// Browser-side calls to the history API (app/api/games). Saving and deleting
// never throw: the game is already over, so a failed request must not break
// the page. They report success as a boolean and the caller decides what to say.

/** A fresh id for one game, made when it starts. */
export function newGameId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

export async function saveGame(request: SaveGameRequest): Promise<boolean> {
  try {
    const response = await fetch("/api/games", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function deleteGame(id: string): Promise<boolean> {
  try {
    const response = await fetch(`/api/games/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    return response.ok;
  } catch {
    return false;
  }
}

export type GamesPage = { games: StoredGame[]; nextCursor: string | null };

/** One page of history, newest first. Throws if the request fails. */
export async function listGames(cursor: string | null): Promise<GamesPage> {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  const response = await fetch(`/api/games${query}`);
  if (!response.ok) throw new Error(`History request failed (${response.status})`);
  return (await response.json()) as GamesPage;
}
