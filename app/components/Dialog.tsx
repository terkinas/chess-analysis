"use client";

import { useEffect, useRef, type ReactNode } from "react";

type DialogProps = {
  /** Accessible name for the dialog. */
  label: string;
  /** Escape, or a click on the backdrop. */
  onClose: () => void;
  children: ReactNode;
};

// A modal built on the native <dialog>, which supplies the focus trap, inert
// background and Escape handling. Render it only while it should be open; it
// opens on mount. Give one child `autoFocus` to choose where focus lands.
export default function Dialog({ label, onClose, children }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  // What had focus when the dialog opened, so focus can be handed back.
  const openerRef = useRef<HTMLElement | null>(null);
  // True only when a press began on the backdrop (see onClick below).
  const pressedBackdropRef = useRef(false);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) {
      // Captured only on the real open, so StrictMode's second run keeps it.
      openerRef.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      dialog.showModal();
    }
    return () => {
      // Escape restores focus natively, but a dialog that is merely unmounted
      // (a choice was made) leaves it on <body>. Give it back to the opener.
      const opener = openerRef.current;
      const lost =
        document.activeElement === null ||
        document.activeElement === document.body;
      if (lost && opener?.isConnected) opener.focus();
    };
  }, []);

  return (
    <dialog
      ref={ref}
      aria-label={label}
      onClose={onClose}
      onPointerDown={(event) => {
        pressedBackdropRef.current = event.target === event.currentTarget;
      }}
      onClick={(event) => {
        // The inner wrapper has the padding, so a hit on the <dialog> itself
        // is a click on the backdrop. A text selection that starts inside and
        // is released over the backdrop also reports the <dialog> as target,
        // so require the press to have begun on the backdrop too.
        const startedOnBackdrop = pressedBackdropRef.current;
        pressedBackdropRef.current = false;
        if (startedOnBackdrop && event.target === event.currentTarget) {
          onClose();
        }
      }}
      className="m-auto w-[min(22rem,calc(100vw-2rem))] max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-md border border-line bg-surface p-0 text-foreground shadow-[0_28px_60px_-20px_rgba(0,0,0,0.9)] backdrop:bg-black/60"
    >
      <div className="p-5">{children}</div>
    </dialog>
  );
}
