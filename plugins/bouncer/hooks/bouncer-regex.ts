// Bouncer regex conditions: leading (?i)(?m)(?s) translated to JS flags.
// Anything else is left to the JS RegExp compiler; invalid patterns
// compile to null and the rule is skipped with a diagnostic.

export interface SplitFlags {
  flags: string;
  source: string;
}

/** Strip leading inline flag groups like (?i), (?im), (?i)(?s). */
export function splitLeadingFlags(pattern: string): SplitFlags {
  let rest = pattern;
  let i = false;
  let m = false;
  let s = false;
  for (;;) {
    const m0 = /^\(\?([ims]+)\)/.exec(rest);
    if (!m0) break;
    for (const ch of m0[1]) {
      if (ch === "i") i = true;
      else if (ch === "m") m = true;
      else if (ch === "s") s = true;
    }
    rest = rest.slice(m0[0].length);
  }
  let flags = "";
  if (i) flags += "i";
  if (m) flags += "m";
  if (s) flags += "s";
  return { flags, source: rest };
}

/** Compile one condition. Returns null when unusable (warn + skip). */
export function compileCondition(pattern: string): RegExp | null {
  if (typeof pattern !== "string" || pattern.length === 0) return null;
  try {
    const { flags, source } = splitLeadingFlags(pattern);
    if (source.length === 0) return null;
    return new RegExp(source, flags);
  } catch {
    return null;
  }
}

/**
 * Conservative legacy-glob heuristic: a condition that looks like a file
 * glob (e.g. "*.rs") is shorthand for edit/write on that glob with `.*`.
 * Only fires on strings with glob characters and none of the common
 * regex-only metacharacters.
 */
export function isGlobShorthand(value: string): boolean {
  if (typeof value !== "string") return false;
  const s = value.trim();
  if (s.length === 0) return false;
  if (!s.includes("*") && !s.includes("?")) return false;
  if (/[()\[\]\\|^$+{}]/.test(s)) return false;
  return true;
}
