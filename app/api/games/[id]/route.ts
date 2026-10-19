import { getPrisma } from "../../../lib/db";
import { GAME_ID_PATTERN } from "../../../lib/game-record";
import { findOwnerKey } from "../../../lib/owner-key";

// Deleting a game that is already gone still succeeds, so a retry is harmless.
// Only the caller's own games can be deleted; someone else's id deletes nothing
// and looks exactly like an id that does not exist.
export async function DELETE(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await ctx.params;
  if (!GAME_ID_PATTERN.test(id)) {
    return Response.json({ error: "Invalid game id." }, { status: 400 });
  }
  try {
    // Without a visitor cookie there is nothing of theirs to delete.
    const ownerKey = findOwnerKey(request);
    if (ownerKey) {
      await getPrisma().game.deleteMany({ where: { id, ownerKey } });
    }
    return new Response(null, {
      status: 204,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    console.error("Game history database error:", error);
    return Response.json({ error: "Database unavailable." }, { status: 503 });
  }
}
