"use client";

import { useLayoutEffect } from "react";
import { boardCssVariables } from "../lib/appearance";
import { useAppearance } from "../lib/use-appearance";

/**
 * Mirrors the saved board colours onto <html> as CSS custom properties, so
 * every board-coloured surface (Play, Analysis, the promotion picker, the
 * settings previews) follows one theme with no per-board logic. Renders
 * nothing. Mounted once, in the root layout.
 */
export default function AppearanceSync() {
  const { board } = useAppearance();
  useLayoutEffect(() => {
    const style = document.documentElement.style;
    for (const [name, value] of Object.entries(boardCssVariables(board))) {
      style.setProperty(name, value);
    }
  }, [board]);
  return null;
}
