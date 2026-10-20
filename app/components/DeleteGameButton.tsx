"use client";

import { deleteGame } from "../actions/games";

export default function DeleteGameButton({ id }: { id: string }) {
  return (
    <form
      action={deleteGame}
      onSubmit={(event) => {
        if (!window.confirm("Delete this game from your history?")) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        className="rounded-md border border-line px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:bg-background hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        Delete
      </button>
    </form>
  );
}
