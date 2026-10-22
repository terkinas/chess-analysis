"use client";

import { useSyncExternalStore } from "react";
import {
  DEFAULT_PREFERENCES,
  PREFERENCES_STORAGE_KEY,
  parsePreferences,
  samePreferences,
  serializePreferences,
  type Preferences,
} from "./preferences";

/**
 * The one copy of the gameplay preferences. The game and the settings page read
 * it through `usePreferences`, so a change shows up everywhere at once, also
 * after in-app navigation (this module outlives page changes). Other browser
 * tabs are kept in step via the `storage` event.
 */

let current: Preferences = DEFAULT_PREFERENCES;
let loaded = false;
const listeners = new Set<() => void>();

function readStored(): Preferences {
  try {
    return parsePreferences(
      window.localStorage.getItem(PREFERENCES_STORAGE_KEY),
    );
  } catch {
    // Storage blocked (private mode, policy): run on defaults.
    return DEFAULT_PREFERENCES;
  }
}

function emit() {
  for (const listener of listeners) listener();
}

function getSnapshot(): Preferences {
  if (!loaded) {
    loaded = true;
    current = readStored();
  }
  return current;
}

function getServerSnapshot(): Preferences {
  return DEFAULT_PREFERENCES;
}

function onStorage(event: StorageEvent) {
  // `key === null` means the whole storage was cleared.
  if (event.key !== null && event.key !== PREFERENCES_STORAGE_KEY) return;
  const next = readStored();
  if (samePreferences(next, current)) return;
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

export function setPremoveEnabled(premove: boolean) {
  const next = { ...getSnapshot(), premove };
  if (samePreferences(next, current)) return;
  current = next;
  try {
    window.localStorage.setItem(
      PREFERENCES_STORAGE_KEY,
      serializePreferences(next),
    );
  } catch {
    // Not persisted (quota / blocked), but still applied for this session.
  }
  emit();
}

export function usePreferences(): Preferences {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
