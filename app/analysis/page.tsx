import type { Metadata } from "next";
import { Suspense } from "react";
import AnalysisBoard, {
  type AnalysisSource,
} from "../components/AnalysisBoard";
import SiteHeader from "../components/SiteHeader";
import { getGamePgn } from "../lib/games";

export const metadata: Metadata = {
  title: "Analysis — Gambit",
};

const GAME_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function loadSource(
  searchParams: PageProps<"/analysis">["searchParams"],
): Promise<AnalysisSource | null> {
  const { game } = await searchParams;
  if (typeof game !== "string") return null;
  if (!GAME_ID.test(game)) {
    return { id: game, error: "That game link isn't valid." };
  }
  try {
    const pgn = await getGamePgn(game);
    return pgn === null
      ? { id: game, error: "That game was not found. It may have been deleted." }
      : { id: game, pgn };
  } catch (error) {
    console.error("Loading game failed", error);
    return {
      id: game,
      error: "Couldn't reach the database to load that game.",
    };
  }
}

// Reading the URL is request-time work, so it happens inside <Suspense> and
// the header can show immediately while the game loads.
async function Board({
  searchParams,
}: Pick<PageProps<"/analysis">, "searchParams">) {
  return <AnalysisBoard source={await loadSource(searchParams)} />;
}

export default function AnalysisPage({ searchParams }: PageProps<"/analysis">) {
  return (
    <>
      <SiteHeader current="analysis" />
      <main className="mx-auto grid w-full max-w-6xl flex-1 content-start gap-6 px-4 py-4 sm:px-6 sm:py-6 lg:grid-cols-[minmax(0,1fr)_21rem] lg:gap-8">
        <Suspense fallback={null}>
          <Board searchParams={searchParams} />
        </Suspense>
      </main>
    </>
  );
}
