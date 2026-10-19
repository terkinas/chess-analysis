"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { saveHandoff } from "../lib/analysis-handoff";
import type { StoredGame } from "../lib/game-record";
import { deleteGame, listGames } from "../lib/games-api";
import {
  RESULT_LABELS,
  clockLabel,
  humanResult,
  levelName,
  moveCount,
  pgnFileName,
  terminationLabel,
  type HumanResult,
} from "../lib/history-format";

const RESULT_STYLES: Record<HumanResult, string> = {
  win: "text-accent",
  loss: "text-danger",
  draw: "text-muted",
};

const BUTTON =
  "rounded-md border border-line px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

type Status = "loading" | "ready" | "error";

// The saved games, newest first, loaded a page at a time from /api/games. Each
// game can be opened in the analysis page, downloaded as PGN or deleted.
export default function HistoryList() {
  const router = useRouter();
  const [games, setGames] = useState<readonly StoredGame[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  // Bumped by "Try again" to run the first-page load once more.
  const [attempt, setAttempt] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let cancelled = false;
    listGames(null)
      .then((page) => {
        if (cancelled) return;
        setGames(page.games);
        setNextCursor(page.nextCursor);
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  async function loadMore() {
    if (nextCursor === null || loadingMore) return;
    setLoadingMore(true);
    setNotice("");
    try {
      const page = await listGames(nextCursor);
      setGames((current) => [...current, ...page.games]);
      setNextCursor(page.nextCursor);
    } catch {
      setNotice("Couldn't load more games.");
    } finally {
      setLoadingMore(false);
    }
  }

  async function remove(id: string) {
    setConfirmingId(null);
    setNotice("");
    if (await deleteGame(id)) {
      setGames((current) => current.filter((game) => game.id !== id));
    } else {
      setNotice("Couldn't delete that game.");
    }
  }

  function analyze(game: StoredGame) {
    if (!saveHandoff(game.pgn)) {
      setNotice("Couldn't open analysis — try Download instead.");
      return;
    }
    router.push("/analysis");
  }

  function download(game: StoredGame) {
    const blob = new Blob([game.pgn], { type: "application/x-chess-pgn" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = pgnFileName(game.playedAt, game.id);
    link.click();
    URL.revokeObjectURL(url);
  }

  if (status === "loading") {
    return <p className="mt-4 text-sm text-muted">Loading games…</p>;
  }

  if (status === "error") {
    return (
      <div className="mt-4 text-sm">
        <p className="text-muted">
          Couldn&apos;t load your games. Check that the database is running and
          DATABASE_URL is set.
        </p>
        <button
          type="button"
          className={`${BUTTON} mt-3`}
          onClick={() => {
            setStatus("loading");
            setAttempt((n) => n + 1);
          }}
        >
          Try again
        </button>
      </div>
    );
  }

  if (games.length === 0) {
    return (
      <p className="mt-4 text-sm text-muted">
        No finished games yet. Finish a game on the Play page and it will show
        up here.
      </p>
    );
  }

  return (
    <div className="mt-4">
      {notice !== "" && (
        <p role="status" className="mb-3 text-sm text-muted">
          {notice}
        </p>
      )}
      <ul className="flex flex-col gap-2">
        {games.map((game) => {
          const result = humanResult(game.result, game.humanColor);
          const confirming = confirmingId === game.id;
          return (
            <li
              key={game.id}
              className="flex flex-col gap-3 rounded-md border border-line bg-surface p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">
                  <span className={RESULT_STYLES[result]}>
                    {RESULT_LABELS[result]}
                  </span>
                  <span className="font-normal text-muted">
                    {" "}
                    · {terminationLabel(game.termination)}
                  </span>
                </p>
                <p className="mt-1 text-xs text-muted">
                  {game.humanColor === "WHITE" ? "White" : "Black"} vs{" "}
                  {levelName(game.engineLevel)} Stockfish ·{" "}
                  {moveCount(game.plies)} moves ·{" "}
                  {clockLabel(game.clockMinutes, game.clockIncrementSeconds)} ·{" "}
                  {new Date(game.playedAt).toLocaleString(undefined, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </p>
              </div>
              {confirming ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted">Delete this game?</span>
                  <button
                    type="button"
                    autoFocus
                    className={BUTTON}
                    onClick={() => setConfirmingId(null)}
                  >
                    Keep
                  </button>
                  <button
                    type="button"
                    className={`${BUTTON} text-danger`}
                    onClick={() => remove(game.id)}
                  >
                    Delete
                  </button>
                </div>
              ) : (
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    className={BUTTON}
                    onClick={() => analyze(game)}
                  >
                    Analyze
                  </button>
                  <button
                    type="button"
                    className={BUTTON}
                    onClick={() => download(game)}
                  >
                    PGN
                  </button>
                  <button
                    type="button"
                    className={BUTTON}
                    onClick={() => setConfirmingId(game.id)}
                  >
                    Delete
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {nextCursor !== null && (
        <button
          type="button"
          className={`${BUTTON} mt-4`}
          disabled={loadingMore}
          onClick={loadMore}
        >
          {loadingMore ? "Loading…" : "Load more"}
        </button>
      )}
    </div>
  );
}
