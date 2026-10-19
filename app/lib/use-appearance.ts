"use client";

import { useSyncExternalStore } from "react";
import {
  APPEARANCE_STORAGE_KEY,
  DEFAULT_APPEARANCE,
  parseAppearance,
  sameAppearance,
  serializeAppearance,
  type Appearance,
  type BoardColors,
  type PieceSetId,
} from "./appearance";

/**
 * The one copy of the appearance settings. Every board, the promotion picker
 * and the settings page read it through `useAppearance`, so a change made
 * anywhere shows up everywhere at once, including after in-app navigation
 * (this module outlives page changes). Other browser tabs are kept in step via
 * the `storage` event.
 */

let current: Appearance = DEFAULT_APPEARANCE;
let loaded = false;
const listeners = new Set<() => void>();

function readStored(): Appearance {
  try {
    return parseAppearance(window.localStorage.getItem(APPEARANCE_STORAGE_KEY));
  } catch {
    // Storage blocked (private mode, policy): run on defaults.
    return DEFAULT_APPEARANCE;
  }
}

function emit() {
  for (const listener of listeners) listener();
}

function getSnapshot(): Appearance {
  if (!loaded) {
    loaded = true;
    current = readStored();
  }
  return current;
}

function getServerSnapshot(): Appearance {
  return DEFAULT_APPEARANCE;
}

function onStorage(event: StorageEvent) {
  // `key === null` means the whole storage was cleared.
  if (event.key !== null && event.key !== APPEARANCE_STORAGE_KEY) return;
  const next = readStored();
  if (sameAppearance(next, current)) return;
  current = next;
  emit();
}

function subscribe(listener: () => void): () => void {
  if (listeners.size === 0) window.addEventListener("storage", onStorage);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener("storage", onStorage);
  };
}

function update(change: (appearance: Appearance) => Appearance) {
  const next = change(getSnapshot());
  if (sameAppearance(next, current)) return;
  current = next;
  try {
    window.localStorage.setItem(APPEARANCE_STORAGE_KEY, serializeAppearance(next));
  } catch {
    // Not persisted (quota / blocked), but still applied for this session.
  }
  emit();
}

export function setPieceSet(pieceSet: PieceSetId) {
  update((appearance) => ({ ...appearance, pieceSet }));
}

export function setBoardColors(board: BoardColors) {
  update((appearance) => ({ ...appearance, board: { ...board } }));
}

export function useAppearance(): Appearance {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
