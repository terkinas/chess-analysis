"use client";

import { useId, useState, type FormEvent } from "react";
import type { PgnImportFailure } from "../lib/pgn-import";
import Dialog from "./Dialog";

type PgnImportDialogProps = {
  /**
   * Tries to load the pasted text. Returns why it could not, or null once the
   * game has been loaded (the parent then closes the dialog). The text stays in
   * the box after a failure so it can be fixed.
   */
  onImport: (text: string) => PgnImportFailure | null;
  onClose: () => void;
};

export default function PgnImportDialog({
  onImport,
  onClose,
}: PgnImportDialogProps) {
  const id = useId();
  const inputId = `${id}-pgn`;
  const helpId = `${id}-help`;
  const errorId = `${id}-error`;
  const [text, setText] = useState("");
  const [failure, setFailure] = useState<PgnImportFailure | null>(null);
  // Changes on every failed attempt so a repeated error is announced again.
  const [attempt, setAttempt] = useState(0);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = onImport(text);
    if (result) {
      setFailure(result);
      setAttempt((count) => count + 1);
    }
  }

  return (
    <Dialog label="Import PGN" onClose={onClose}>
      <form onSubmit={handleSubmit} noValidate>
        <h2 className="text-base font-semibold text-foreground">Import PGN</h2>
        <label
          htmlFor={inputId}
          className="mt-4 block text-xs font-medium text-muted"
        >
          Paste a single game
        </label>
        <textarea
          id={inputId}
          autoFocus
          rows={10}
          spellCheck={false}
          autoComplete="off"
          autoCapitalize="off"
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setFailure(null);
          }}
          aria-invalid={failure !== null}
          aria-describedby={failure ? `${helpId} ${errorId}` : helpId}
          placeholder={'[Event "Casual game"]\n\n1. e4 e5 2. Nf3 Nc6 *'}
          className="mt-1.5 block w-full resize-y rounded-md border border-line bg-background px-3 py-2 font-mono text-xs text-foreground placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        />
        <p id={helpId} className="mt-2 text-xs text-muted">
          Headers and comments are fine. Only the main line is imported;
          variations are ignored. Your current analysis is replaced only if the
          import succeeds.
        </p>

        {failure && (
          <div
            key={attempt}
            id={errorId}
            role="alert"
            className="mt-3 rounded-md border border-danger/50 bg-background px-3 py-2 text-xs text-danger"
          >
            <p>{failure.error}</p>
            {failure.detail && (
              <p className="mt-1 break-words font-mono text-muted">
                {failure.detail}
              </p>
            )}
          </div>
        )}

        <div className="mt-5 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-line px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-background transition-colors hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Import
          </button>
        </div>
      </form>
    </Dialog>
  );
}
