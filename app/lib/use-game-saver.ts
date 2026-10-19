"use client";

import { useCallback, useEffect, useRef } from "react";
import { deleteGame, saveGame } from "./games-api";
import type { SaveGameRequest } from "./game-record";

export type SaveStatus = "saved" | "failed";

// Saves a game to the history database once it has finished. Pass the request
// for a finished game, or null while nothing is finished. The same ending is
// saved once (React's double effects and re-renders are harmless); a different
// ending for the same game id (undo after checkmate, then a new result) is saved
// again and replaces the earlier row on the server. Requests run one after
// another so a delete from `discard` can never overtake the save it follows.
export function useGameSaver(
  request: SaveGameRequest | null,
  onStatus: (status: SaveStatus) => void,
) {
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const savedKey = useRef<string | null>(null);
  const savedId = useRef<string | null>(null);
  const onStatusRef = useRef(onStatus);
  useEffect(() => {
    onStatusRef.current = onStatus;
  });

  useEffect(() => {
    if (!request) return;
    const key = `${request.id}|${request.moves.length}|${request.timedOut}|${request.resigned}`;
    if (savedKey.current === key) return;
    savedKey.current = key;
    savedId.current = request.id;
    queue.current = queue.current.then(async () => {
      const ok = await saveGame(request);
      onStatusRef.current(ok ? "saved" : "failed");
    });
  }, [request]);

  // Removes the saved row of `gameId`, if this hook saved one for it. Used when
  // an undo reopens a game that had already been saved as finished.
  const discard = useCallback((gameId: string) => {
    if (savedId.current !== gameId) return;
    savedId.current = null;
    savedKey.current = null;
    queue.current = queue.current.then(() => deleteGame(gameId));
  }, []);

  return { discard };
}
