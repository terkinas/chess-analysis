import { getPrisma, isUniqueViolation } from "../../lib/db";
import { GAME_ID_PATTERN, parseSaveRequest } from "../../lib/game-record";
import { getOwnerKey } from "../../lib/owner-key";

const PAGE_SIZE = 20;

// Every answer depends on who is asking, so none may be kept by a shared cache
// (a CDN would otherwise hand one visitor's history to another).
const PRIVATE = { "Cache-Control": "private, no-store" } as const;

const STORED_GAME_SELECT = {
  id: true,
  playedAt: true,
  pgn: true,
  plies: true,
  humanColor: true,
  result: true,
  termination: true,
  engineLevel: true,
  clockMinutes: true,
  clockIncrementSeconds: true,
} as const;

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: PRIVATE });
}

function unavailable(error: unknown): Response {
  console.error("Game history database error:", error);
  return json({ error: "Database unavailable." }, 503);
}

// The caller's own games, newest first. `?cursor=<id>` continues after that
// game; `nextCursor` is null on the last page.
export async function GET(request: Request): Promise<Response> {
  const cursor = new URL(request.url).searchParams.get("cursor");
  if (cursor !== null && !GAME_ID_PATTERN.test(cursor)) {
    return json({ error: "Invalid cursor." }, 400);
  }

  try {
    const ownerKey = getOwnerKey(request);
    const rows = await getPrisma().game.findMany({
      where: { ownerKey },
      orderBy: [{ playedAt: "desc" }, { id: "desc" }],
      take: PAGE_SIZE + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: STORED_GAME_SELECT,
    });
    const games = rows.slice(0, PAGE_SIZE);
    const nextCursor =
      rows.length > PAGE_SIZE ? games[games.length - 1].id : null;
    return json({ games, nextCursor });
  } catch (error) {
    return unavailable(error);
  }
}

// Saves a finished game for the caller. The same id can be posted again (for
// example when an undo after checkmate leads to a different ending) and
// replaces the caller's row. An id that already belongs to someone else is
// refused, and never touches their row.
export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Body must be JSON." }, 400);
  }

  const now = new Date();
  const parsed = parseSaveRequest(body, now);
  if (!parsed.ok) {
    return json({ error: parsed.error }, 400);
  }

  const { id, ...data } = parsed.record;
  try {
    const ownerKey = getOwnerKey(request);
    const games = getPrisma().game;
    const replaceOwn = async () =>
      (await games.updateMany({ where: { id, ownerKey }, data: { ...data, playedAt: now } })).count;

    let saved = await replaceOwn();
    if (saved === 0) {
      try {
        await games.create({ data: { id, ownerKey, ...data, playedAt: now } });
        saved = 1;
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        // The id exists: either this caller's own save landed a moment ago, or
        // it belongs to someone else.
        saved = await replaceOwn();
      }
    }
    if (saved === 0) return json({ error: "Game id already in use." }, 409);
    return json({ id });
  } catch (error) {
    return unavailable(error);
  }
}
