// Move sounds, synthesized with the Web Audio API: no audio files, no network,
// no dependencies. Every entry point swallows its own errors, so a missing or
// blocked audio device can never interrupt the game.

export type MoveSoundKind = "move" | "check";

/** A SAN ending in "+" (check) or "#" (checkmate) gets the check sound. */
export function soundForSan(san: string): MoveSoundKind {
  return /[+#]$/.test(san) ? "check" : "move";
}

// undefined = not created yet; null = unavailable in this browser.
let context: AudioContext | null | undefined;

function getContext(): AudioContext | null {
  if (context !== undefined) return context;
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    context = Ctor ? new Ctor() : null;
  } catch {
    context = null;
  }
  return context;
}

/**
 * Creates and unlocks the audio context. Call it from a user gesture (starting
 * a game) so sounds are allowed even when Stockfish makes the first move.
 */
export function primeMoveSound(): void {
  try {
    const ctx = getContext();
    if (ctx?.state === "suspended") ctx.resume().catch(() => {});
  } catch {
    // Sound is optional.
  }
}

/** One short tone: starts at `start` seconds from now and fades out quickly. */
function tone(
  ctx: AudioContext,
  type: OscillatorType,
  from: number,
  to: number,
  start: number,
  duration: number,
  volume: number,
): void {
  const t0 = ctx.currentTime + start;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t0);
  osc.frequency.exponentialRampToValueAtTime(to, t0 + duration);
  gain.gain.setValueAtTime(volume, t0);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

function play(ctx: AudioContext, kind: MoveSoundKind): void {
  if (kind === "check") {
    // Two rising tones: clearly different from the plain move thud.
    tone(ctx, "sine", 660, 660, 0, 0.1, 0.1);
    tone(ctx, "sine", 880, 880, 0.1, 0.14, 0.1);
  } else {
    tone(ctx, "triangle", 220, 110, 0, 0.09, 0.12);
  }
}

/** Plays the sound for a move that has just been made, given its SAN. */
export function playMoveSound(san: string): void {
  try {
    const ctx = getContext();
    if (!ctx) return;
    const kind = soundForSan(san);
    if (ctx.state === "suspended") {
      // Still locked by the browser: play once if it unlocks, otherwise stay silent.
      ctx.resume().then(() => play(ctx, kind)).catch(() => {});
    } else {
      play(ctx, kind);
    }
  } catch {
    // Sound is optional.
  }
}
