// Normalized plugin configuration. Manifest userConfig avoids array
// types (validator-safe): disabledRules is a comma-separated string.

export type GlobalInterruptMode = "always" | "never";
export type RepeatMode = "once" | "after-gap";

export interface BouncerConfig {
  enabled: boolean;
  interruptMode: GlobalInterruptMode;
  repeatMode: RepeatMode;
  repeatGap: number;
  disabledRules: string[];
}

export type PluginOptionsLike = Readonly<
  Record<string, string | number | boolean | readonly string[]>
>;

function readString(
  options: PluginOptionsLike,
  key: string,
  fallback: string,
): string {
  const v = options[key];
  return typeof v === "string" && v.length > 0 ? v : fallback;
}

export function normalizeConfig(options: PluginOptionsLike): BouncerConfig {
  const enabledRaw = options["enabled"];
  const enabled = typeof enabledRaw === "boolean" ? enabledRaw : enabledRaw !== "false";
  const interruptRaw = readString(options, "interruptMode", "always").toLowerCase();
  const interruptMode: GlobalInterruptMode =
    interruptRaw === "never" ? "never" : "always";
  const repeatRaw = readString(options, "repeatMode", "once").toLowerCase();
  const repeatMode: RepeatMode = repeatRaw === "after-gap" ? "after-gap" : "once";
  const gapRaw = options["repeatGap"];
  const repeatGap =
    typeof gapRaw === "number" && Number.isFinite(gapRaw) && gapRaw >= 0
      ? Math.floor(gapRaw)
      : 10;
  const disabledRaw = options["disabledRules"];
  const disabledText =
    typeof disabledRaw === "string"
      ? disabledRaw
      : Array.isArray(disabledRaw)
        ? disabledRaw.join(",")
        : "";
  const disabledRules = disabledText
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return { enabled, interruptMode, repeatMode, repeatGap, disabledRules };
}

/**
 * For a tool source, does this rule/global mode pair interrupt (deny)
 * or only advise (run, then attach context)? A rule interruptMode
 * overrides the global one. Only `always` and `never` exist;
 * anything else falls back to global.
 */
export function toolShouldInterrupt(
  global: GlobalInterruptMode,
  rule: string | undefined,
): boolean {
  const mode = (rule ?? "").trim().toLowerCase();
  if (mode === "always") return true;
  if (mode === "never") return false;
  return global === "always";
}
