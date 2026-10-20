"use server";

import { revalidatePath } from "next/cache";
import { db } from "../lib/db";
import { buildGameRecord } from "../lib/game-record";

export type SaveGameResult = { ok: true; id: string } | { ok: false; error: string };

/**
 * Saves a game, or updates it if the same id was saved before (the game is
 * saved when it ends and again from "Analyze", and an undone checkmate is
 * saved over). There are no accounts yet, so any visitor can save and delete;
 * add authentication here before exposing the app publicly.
 */
export async function saveGame(input: unknown): Promise<SaveGameResult> {
  const built = buildGameRecord(input, new Date());
  if (!built.ok) return built;
  const { id, ...fields } = built.record;
  try {
    await db().game.upsert({
      where: { id },
      create: { id, ...fields },
      update: fields,
    });
  } catch (error) {
    console.error("saveGame failed", error);
    return { ok: false, error: "Couldn't save the game to the database." };
  }
  revalidatePath("/games");
  return { ok: true, id };
}

export async function deleteGame(formData: FormData): Promise<void> {
  const id = formData.get("id");
  if (typeof id !== "string" || id.length > 64) return;
  try {
    await db().game.deleteMany({ where: { id } });
  } catch (error) {
    console.error("deleteGame failed", error);
    return;
  }
  revalidatePath("/games");
}
