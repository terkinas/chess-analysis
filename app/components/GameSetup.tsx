import { ENGINE_LEVELS, DEFAULT_LEVEL_ID } from "../lib/engine-levels";
import {
  DEFAULT_CLOCK_SETTINGS,
  INCREMENT_OPTIONS,
  MINUTE_OPTIONS,
  isTimed,
  type ClockSettings,
} from "../lib/chess-clock";

export type ColorChoice = "w" | "b" | "random";

/** Everything the player picks before a game starts. */
export type SetupSettings = {
  colorChoice: ColorChoice;
  levelId: string;
  clock: ClockSettings;
};

/** White, the 1-second level and 10 minutes with no increment, as before. */
export const DEFAULT_SETUP: SetupSettings = {
  colorChoice: "w",
  levelId: DEFAULT_LEVEL_ID,
  clock: DEFAULT_CLOCK_SETTINGS,
};

const COLOR_OPTIONS: readonly { value: ColorChoice; label: string }[] = [
  { value: "w", label: "White" },
  { value: "b", label: "Black" },
  { value: "random", label: "Random" },
];

type GameSetupProps = {
  value: SetupSettings;
  onChange: (next: SetupSettings) => void;
};

const SELECT_CLASS =
  "min-w-0 flex-1 rounded-md border border-line bg-surface px-2 py-2 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-40";

// The pre-game form. It is only shown while no game is running, so every
// choice applies to the game that starts next.
export default function GameSetup({ value, onChange }: GameSetupProps) {
  const timed = isTimed(value.clock);

  return (
    <div className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1.5 text-xs font-medium text-muted">
          Play as
        </legend>
        <div className="grid grid-cols-3 gap-1 rounded-md border border-line p-0.5">
          {COLOR_OPTIONS.map((option) => (
            <label
              key={option.value}
              className="cursor-pointer rounded px-2 py-2 text-center text-sm font-medium text-foreground transition-colors hover:bg-background has-[:checked]:bg-accent has-[:checked]:text-background has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-1 has-[:focus-visible]:outline-accent"
            >
              <input
                type="radio"
                name="play-as"
                value={option.value}
                checked={value.colorChoice === option.value}
                onChange={() =>
                  onChange({ ...value, colorChoice: option.value })
                }
                className="sr-only"
              />
              {option.label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex items-center justify-between gap-3">
        <label htmlFor="engine-level" className="text-xs font-medium text-muted">
          Level
        </label>
        <select
          id="engine-level"
          value={value.levelId}
          onChange={(event) =>
            onChange({ ...value, levelId: event.target.value })
          }
          className={SELECT_CLASS}
        >
          {ENGINE_LEVELS.map((level) => (
            <option key={level.id} value={level.id}>
              {level.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center justify-between gap-3">
        <label htmlFor="clock-minutes" className="text-xs font-medium text-muted">
          Time
        </label>
        <select
          id="clock-minutes"
          value={value.clock.minutes}
          onChange={(event) =>
            onChange({
              ...value,
              clock: { ...value.clock, minutes: Number(event.target.value) },
            })
          }
          className={SELECT_CLASS}
        >
          {MINUTE_OPTIONS.map((minutes) => (
            <option key={minutes} value={minutes}>
              {minutes === 0 ? "No clock" : `${minutes} min`}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center justify-between gap-3">
        <label
          htmlFor="clock-increment"
          className="text-xs font-medium text-muted"
        >
          Increment
        </label>
        <select
          id="clock-increment"
          value={value.clock.incrementSeconds}
          disabled={!timed}
          onChange={(event) =>
            onChange({
              ...value,
              clock: {
                ...value.clock,
                incrementSeconds: Number(event.target.value),
              },
            })
          }
          className={SELECT_CLASS}
        >
          {INCREMENT_OPTIONS.map((seconds) => (
            <option key={seconds} value={seconds}>
              {seconds === 0 ? "None" : `+${seconds} s per move`}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
