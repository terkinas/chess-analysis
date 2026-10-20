/**
 * Appearance settings (piece design + board colours): the catalogue of
 * choices, the saved shape, and safe parsing of whatever storage hands back.
 * Pure functions only, so it is unit-testable; the shared store that reads and
 * writes localStorage lives in `use-appearance.ts`.
 */

export const APPEARANCE_STORAGE_KEY = "gambit:appearance";

/** Bumped when the saved shape changes in a way parsing can't absorb. */
export const APPEARANCE_VERSION = 1;

// ---------------------------------------------------------------------------
// Piece sets
// ---------------------------------------------------------------------------

export type PieceSetId = "classic" | "flat" | "staunton" | "heritage" | "heritage3d";

export type PieceSetInfo = {
  id: PieceSetId;
  name: string;
  description: string;
  /** Folder under /public holding `wK.svg` ... `bP.svg` (no trailing slash). */
  basePath: string;
};

export const PIECE_SETS: readonly PieceSetInfo[] = [
  {
    id: "classic",
    name: "Classic",
    description: "The original Gambit ivory and ink pieces.",
    // The first set predates the picker, so it stays where it always lived.
    basePath: "/pieces",
  },
  {
    id: "flat",
    name: "Flat",
    description: "Clean, unshaded silhouettes with no inner detail.",
    basePath: "/pieces/flat",
  },
  {
    id: "staunton",
    name: "Staunton",
    description: "Basic, bold silhouettes with a short crown and a left-facing knight.",
    basePath: "/pieces/staunton",
  },
  {
    id: "heritage",
    name: "Heritage",
    description: "Classic outlined silhouettes with a clear horse-head knight, built to read at small sizes.",
    basePath: "/pieces/heritage",
  },
  {
    id: "heritage3d",
    name: "Heritage 3D",
    description: "Heritage pieces with soft shading, rounded highlights and a ground shadow.",
    basePath: "/pieces/heritage-3d",
  },
];

export const DEFAULT_PIECE_SET: PieceSetId = "classic";

export function isPieceSetId(value: unknown): value is PieceSetId {
  return PIECE_SETS.some((set) => set.id === value);
}

export function getPieceSet(id: PieceSetId): PieceSetInfo {
  return PIECE_SETS.find((set) => set.id === id) ?? PIECE_SETS[0];
}

/** URL of one piece image, e.g. `pieceImageUrl("flat", "wK")`. */
export function pieceImageUrl(id: PieceSetId, piece: string): string {
  return `${getPieceSet(id).basePath}/${piece}.svg`;
}

// ---------------------------------------------------------------------------
// Board colours
// ---------------------------------------------------------------------------

export type BoardColors = {
  /** `#rrggbb`, lower case. */
  light: string;
  dark: string;
};

export type BoardPreset = BoardColors & {
  id: string;
  name: string;
  /**
   * Coordinate-label colours. Optional: when omitted they are derived (see
   * `boardInk`). Only the default sets them, to keep its look byte-identical.
   */
  ink?: { onLight: string; onDark: string };
};

export const BOARD_PRESETS: readonly BoardPreset[] = [
  {
    id: "gambit",
    name: "Gambit Green",
    light: "#ebe6d3",
    dark: "#6a8a6e",
    ink: { onLight: "#4d6a52", onDark: "#ebe6d3" },
  },
  { id: "walnut", name: "Walnut", light: "#f0d9b5", dark: "#b58863" },
  { id: "slate", name: "Slate Blue", light: "#dee3e6", dark: "#8ca2ad" },
  { id: "lagoon", name: "Lagoon", light: "#e0efe9", dark: "#5c9a95" },
  { id: "rose", name: "Rosewood", light: "#f1e1d8", dark: "#a8665c" },
  { id: "amethyst", name: "Amethyst", light: "#e8e1f0", dark: "#8b78a8" },
  { id: "midnight", name: "Midnight", light: "#c6ccd6", dark: "#566a85" },
];

export const DEFAULT_BOARD_PRESET: BoardPreset = BOARD_PRESETS[0];

export const DEFAULT_BOARD_COLORS: BoardColors = {
  light: DEFAULT_BOARD_PRESET.light,
  dark: DEFAULT_BOARD_PRESET.dark,
};

const HEX = /^#[0-9a-f]{6}$/;

/** Normalises `#RRGGBB` / `#RGB` to lower-case `#rrggbb`, or null if invalid. */
export function normalizeHex(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim().toLowerCase();
  if (HEX.test(text)) return text;
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(text);
  return short ? `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}` : null;
}

export function findBoardPreset(colors: BoardColors): BoardPreset | undefined {
  return BOARD_PRESETS.find(
    (preset) => preset.light === colors.light && preset.dark === colors.dark,
  );
}

type Rgb = readonly [number, number, number];

function toRgb(hex: string): Rgb {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

function toHex([r, g, b]: Rgb): string {
  const part = (n: number) =>
    Math.round(Math.min(255, Math.max(0, n)))
      .toString(16)
      .padStart(2, "0");
  return `#${part(r)}${part(g)}${part(b)}`;
}

/** `top` laid over `base` at the given opacity. */
function over(base: Rgb, top: Rgb, alpha: number): Rgb {
  return [
    base[0] + (top[0] - base[0]) * alpha,
    base[1] + (top[1] - base[1]) * alpha,
    base[2] + (top[2] - base[2]) * alpha,
  ];
}

/** Colours of the coordinate labels printed on each kind of square. */
export function boardInk(colors: BoardColors): { onLight: string; onDark: string } {
  const preset = findBoardPreset(colors);
  if (preset?.ink) return preset.ink;
  // On a light square: the dark square colour, deepened. On a dark square:
  // the light square colour. Mirrors how the default palette is built.
  return {
    onLight: toHex(over(toRgb(colors.dark), [0, 0, 0], 0.3)),
    onDark: colors.light,
  };
}

// ---------------------------------------------------------------------------
// Readability of board overlays
// ---------------------------------------------------------------------------

/**
 * The overlays the board paints over a square, kept here so the readability
 * check below tracks them. These must match Chessboard / ArrowOverlay:
 * `bg-board-select/55`, `bg-board-last/45`, `bg-red-600/45`, `bg-black/30`
 * (move hints), `text-amber-500` (drawn arrows) and `text-board-last` at 80%
 * (engine arrow).
 */
const OVERLAYS: readonly { name: string; rgb: Rgb; alpha: number; minDelta: number }[] = [
  { name: "selected square", rgb: [0xf2, 0xcd, 0x4c], alpha: 0.55, minDelta: 14 },
  { name: "last move", rgb: [0x5f, 0x9f, 0xd6], alpha: 0.45, minDelta: 12 },
  { name: "marked square", rgb: [0xdc, 0x26, 0x26], alpha: 0.45, minDelta: 14 },
  { name: "move hints", rgb: [0, 0, 0], alpha: 0.3, minDelta: 12 },
  { name: "drawn arrows", rgb: [0xf5, 0x9e, 0x0b], alpha: 1, minDelta: 22 },
  { name: "engine arrow", rgb: [0x5f, 0x9f, 0xd6], alpha: 0.8, minDelta: 14 },
];

function srgbToLinear(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** CIE Lab of an sRGB colour (D65). */
function toLab([r, g, b]: Rgb): readonly [number, number, number] {
  const [lr, lg, lb] = [srgbToLinear(r), srgbToLinear(g), srgbToLinear(b)];
  const x = (0.4124564 * lr + 0.3575761 * lg + 0.1804375 * lb) / 0.95047;
  const y = 0.2126729 * lr + 0.7151522 * lg + 0.072175 * lb;
  const z = (0.0193339 * lr + 0.119192 * lg + 0.9503041 * lb) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const [fx, fy, fz] = [f(x), f(y), f(z)];
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

function deltaE(a: Rgb, b: Rgb): number {
  const [l1, a1, b1] = toLab(a);
  const [l2, a2, b2] = toLab(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}

function luminance(hex: string): number {
  const [r, g, b] = toRgb(hex);
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}

/**
 * Human-readable problems with a colour pair, or an empty list when every
 * board marker (selection, last move, hints, arrows, ...) stays distinguishable
 * on both square colours. Used to vet the presets and to warn on custom colours.
 */
export function boardReadabilityIssues(colors: BoardColors): string[] {
  const issues: string[] = [];
  const light = toRgb(colors.light);
  const dark = toRgb(colors.dark);

  if (luminance(colors.light) <= luminance(colors.dark)) {
    issues.push("The light squares should be lighter than the dark squares.");
  } else if (deltaE(light, dark) < 12) {
    issues.push("The two square colours are very close, so the board is hard to read.");
  }
  if (luminance(colors.dark) < 0.04 || luminance(colors.light) > 0.92) {
    issues.push("A square colour is so extreme that pieces and hints may blend in.");
  }

  const weak: string[] = [];
  for (const overlay of OVERLAYS) {
    for (const square of [light, dark]) {
      if (deltaE(square, over(square, overlay.rgb, overlay.alpha)) < overlay.minDelta) {
        if (!weak.includes(overlay.name)) weak.push(overlay.name);
      }
    }
  }
  if (weak.length > 0) {
    issues.push(`These colours may make ${weak.join(", ")} hard to see.`);
  }
  return issues;
}

// ---------------------------------------------------------------------------
// Saved shape + parsing
// ---------------------------------------------------------------------------

export type Appearance = {
  pieceSet: PieceSetId;
  board: BoardColors;
};

export const DEFAULT_APPEARANCE: Appearance = Object.freeze({
  pieceSet: DEFAULT_PIECE_SET,
  board: Object.freeze({ ...DEFAULT_BOARD_COLORS }),
});

/**
 * Turns whatever was stored (anything at all) into a valid `Appearance`. Each
 * field is checked on its own, so one bad or outdated value costs only that
 * field its default, never the whole setting.
 */
export function parseAppearance(raw: unknown): Appearance {
  let data: unknown = raw;
  if (typeof raw === "string") {
    try {
      data = JSON.parse(raw);
    } catch {
      return DEFAULT_APPEARANCE;
    }
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return DEFAULT_APPEARANCE;
  }
  const record = data as Record<string, unknown>;
  const board =
    typeof record.board === "object" && record.board !== null
      ? (record.board as Record<string, unknown>)
      : {};

  // A pair is only usable as a pair: half a theme would mismatch.
  const light = normalizeHex(board.light);
  const dark = normalizeHex(board.dark);
  return {
    pieceSet: isPieceSetId(record.pieceSet) ? record.pieceSet : DEFAULT_PIECE_SET,
    board: light && dark ? { light, dark } : DEFAULT_BOARD_COLORS,
  };
}

export function serializeAppearance(appearance: Appearance): string {
  return JSON.stringify({ version: APPEARANCE_VERSION, ...appearance });
}

export function sameAppearance(a: Appearance, b: Appearance): boolean {
  return (
    a.pieceSet === b.pieceSet &&
    a.board.light === b.board.light &&
    a.board.dark === b.board.dark
  );
}

/** CSS custom properties that carry the board colours (see globals.css). */
export function boardCssVariables(colors: BoardColors): Record<string, string> {
  const ink = boardInk(colors);
  return {
    "--board-light": colors.light,
    "--board-dark": colors.dark,
    "--board-light-ink": ink.onLight,
    "--board-dark-ink": ink.onDark,
  };
}
