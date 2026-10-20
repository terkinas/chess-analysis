import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import DeleteGameButton from "../components/DeleteGameButton";
import LocalDate from "../components/LocalDate";
import SiteHeader from "../components/SiteHeader";
import { describeClock } from "../lib/chess-clock";
import { getLevel } from "../lib/engine-levels";
import { verdictFor, type Verdict } from "../lib/game-record";
import { listGames, type GameSummary } from "../lib/games";

export const metadata: Metadata = {
  title: "History — Gambit",
};

const VERDICT_LABEL: Record<Verdict, string> = {
  win: "Win",
  loss: "Loss",
  draw: "Draw",
  unfinished: "Unfinished",
};

const VERDICT_STYLE: Record<Verdict, string> = {
  win: "text-accent",
  loss: "text-foreground",
  draw: "text-muted",
  unfinished: "text-muted",
};

const TERMINATION_LABEL: Record<string, string> = {
  checkmate: "Checkmate",
  stalemate: "Stalemate",
  draw: "Draw",
  timeout: "On time",
  resignation: "Resignation",
};

function Message({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-md border border-line bg-surface p-5 text-sm text-muted">
      {children}
    </p>
  );
}

function GameRow({ game }: { game: GameSummary }) {
  const human = game.humanColor === "b" ? "b" : "w";
  const verdict = verdictFor(game.result, human);
  const level = getLevel(game.levelId).label.split(" · ")[0];
  const clock = describeClock({
    minutes: game.clockMinutes,
    incrementSeconds: game.clockIncrementSeconds,
  });
  const how = game.termination ? TERMINATION_LABEL[game.termination] : null;
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line bg-surface px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">
          <span className={VERDICT_STYLE[verdict]}>{VERDICT_LABEL[verdict]}</span>
          {how && <span className="text-muted"> · {how}</span>}
        </p>
        <p className="mt-0.5 text-xs text-muted">
          {human === "w" ? "White" : "Black"} vs Stockfish {level} · {clock} ·{" "}
          {Math.ceil(game.plies / 2)} moves ·{" "}
          <LocalDate iso={game.createdAt.toISOString()} />
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Link
          href={`/analysis?game=${game.id}`}
          className="rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-background transition-colors hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Analyze
        </Link>
        <DeleteGameButton id={game.id} />
      </div>
    </li>
  );
}

// Reads the database on every request, so it sits inside <Suspense> and the
// page header appears straight away.
async function GameList() {
  let games: GameSummary[] | null = null;
  try {
    games = await listGames();
  } catch (error) {
    console.error("Loading history failed", error);
  }
  if (games === null) {
    return (
      <Message>
        Couldn&apos;t reach the database. Check that Postgres is running and
        that DATABASE_URL in .env is correct (see the README).
      </Message>
    );
  }
  if (games.length === 0) {
    return (
      <Message>
        No games yet. Finished games, and any game you open with Analyze, are
        saved here.
      </Message>
    );
  }
  return (
    <ul className="flex flex-col gap-2">
      {games.map((game) => (
        <GameRow key={game.id} game={game} />
      ))}
    </ul>
  );
}

export default function GamesPage() {
  return (
    <>
      <SiteHeader current="history" />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-6">
        <h1 className="mb-4 text-xl font-semibold tracking-tight text-foreground">
          History
        </h1>
        <Suspense fallback={<Message>Loading games…</Message>}>
          <GameList />
        </Suspense>
      </main>
    </>
  );
}
