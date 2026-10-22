"use client";

import type { ReactNode } from "react";
import { BOARD_PRESETS, PIECE_SETS, findBoardPreset } from "../lib/appearance";
import {
  setBoardColors,
  setPieceSet,
  useAppearance,
} from "../lib/use-appearance";
import { setPremoveEnabled, usePreferences } from "../lib/use-preferences";
import { BoardPreview, PieceStrip } from "./AppearancePreview";

const FOCUS =
  "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent";

function Card({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="min-w-0 rounded-xl border border-line bg-surface p-4 sm:p-6">
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      <p className="mt-1 text-sm text-muted">{description}</p>
      <div className="mt-5 grid gap-6">
        {children}
      </div>
    </section>
  );
}

function PieceDesignCard() {
  const { pieceSet } = useAppearance();
  return (
    <Card
      title="Piece Design"
      description="Pick the look of the pieces on every board."
    >
      <BoardPreview pieceSet={pieceSet} className="mx-auto max-w-xs" />
      <fieldset className="min-w-0">
        <legend className="sr-only">Piece design</legend>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-3">
          {PIECE_SETS.map((set) => (
            <label key={set.id} className="block cursor-pointer">
              <input
                type="radio"
                name="piece-set"
                value={set.id}
                checked={pieceSet === set.id}
                onChange={() => setPieceSet(set.id)}
                className="peer sr-only"
              />
              <span
                className={`block rounded-lg border border-line bg-background p-2.5 transition-colors hover:border-muted peer-checked:border-accent peer-checked:ring-1 peer-checked:ring-accent ${FOCUS}`}
              >
                <PieceStrip pieceSet={set.id} />
                <span className="mt-2 flex flex-wrap items-center justify-between gap-x-2 text-sm font-medium text-foreground">
                  {set.name}
                  {pieceSet === set.id && (
                    <span className="text-xs font-normal text-accent">
                      Selected
                    </span>
                  )}
                </span>
                <span className="mt-0.5 block text-xs text-muted">
                  {set.description}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
    </Card>
  );
}

function BoardAppearanceCard() {
  const { pieceSet, board } = useAppearance();
  const activePreset = findBoardPreset(board);

  return (
    <Card
      title="Board Appearance"
      description="Choose the colours of the board squares."
    >
      <BoardPreview pieceSet={pieceSet} className="mx-auto max-w-xs" />
      <div className="min-w-0 space-y-5">
        <fieldset>
          <legend className="flex w-full flex-wrap items-center justify-between gap-2 text-xs font-medium uppercase tracking-wide text-muted">
            Board colours
          </legend>
          <div className="mt-2 grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-2">
            {BOARD_PRESETS.map((preset) => (
              <label key={preset.id} className="block cursor-pointer">
                <input
                  type="radio"
                  name="board-preset"
                  value={preset.id}
                  checked={activePreset?.id === preset.id}
                  onChange={() =>
                    setBoardColors({ light: preset.light, dark: preset.dark })
                  }
                  className="peer sr-only"
                />
                <span
                  className={`flex items-center gap-2.5 rounded-lg border border-line bg-background p-2 transition-colors hover:border-muted peer-checked:border-accent peer-checked:ring-1 peer-checked:ring-accent ${FOCUS}`}
                >
                  <span
                    aria-hidden
                    className="grid size-8 shrink-0 grid-cols-2 overflow-hidden rounded-sm"
                  >
                    <span style={{ background: preset.light }} />
                    <span style={{ background: preset.dark }} />
                    <span style={{ background: preset.dark }} />
                    <span style={{ background: preset.light }} />
                  </span>
                  <span className="min-w-0 break-words text-xs font-medium text-foreground">
                    {preset.name}
                    {preset.id === "gambit" && (
                      <span className="block font-normal text-muted">
                        Default
                      </span>
                    )}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      </div>
    </Card>
  );
}

function PremoveCard() {
  const { premove } = usePreferences();
  return (
    <Card
      title="Premoves"
      description="Choose moves while your opponent is still thinking; the first is played the moment it is your turn."
    >
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          role="switch"
          checked={premove}
          onChange={(event) => setPremoveEnabled(event.target.checked)}
          className="peer sr-only"
        />
        <span
          aria-hidden
          className={`relative mt-0.5 inline-block h-6 w-11 shrink-0 rounded-full border border-line bg-background transition-colors peer-checked:border-accent peer-checked:bg-accent ${FOCUS} after:absolute after:left-0.5 after:top-0.5 after:size-4.5 after:rounded-full after:bg-muted after:transition-transform after:content-[''] peer-checked:after:translate-x-5 peer-checked:after:bg-background`}
        />
        <span className="min-w-0">
          <span className="block text-sm font-medium text-foreground">
            Enable premoves
          </span>
          <span className="mt-0.5 block text-xs text-muted">
            During the opponent&apos;s turn, click or drag one of your pieces to a
            square. The piece moves to its new square on the board and the
            squares are marked in red. You can queue several moves in a row: one
            is played each time it is your turn, as long as it is still legal
            then. Click any empty square on the board (or use the Cancel
            button above it) to cancel them all.
          </span>
        </span>
      </label>
    </Card>
  );
}

export default function SettingsPanel() {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">
        Settings
      </h1>
      <p className="mt-1 text-sm text-muted">
        Changes apply instantly and are saved on this device.
      </p>
      <div className="mt-6 grid gap-6 lg:grid-cols-2 lg:items-start [&>*]:min-w-0">
        <PieceDesignCard />
        <BoardAppearanceCard />
        <PremoveCard />
      </div>
    </>
  );
}
