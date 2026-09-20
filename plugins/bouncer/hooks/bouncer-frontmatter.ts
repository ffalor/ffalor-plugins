// Line-oriented frontmatter parser for Bouncer rule files. No YAML
// dependency: supports the subset OMP rules use in practice — scalar
// strings (plain/single/double quoted), booleans, numbers, inline
// `[a, b]` lists and block `- item` lists. Unknown shapes survive as
// raw strings so consumers can ignore them; malformed typed fields
// never abort discovery.

export interface RuleFrontmatter {
  enabled?: boolean;
  description?: string;
  interruptMode?: string;
  repeatMode?: string;
  repeatGap?: number;
  condition?: string[];
  scope?: string[];
  globs?: string[];
  /** Native Claude rules path gate (`paths:`); used as Bouncer path gate when set. */
  paths?: string[];
  raw: Record<string, unknown>;
}

function unquote(s: string): string {
  const t = s.trim();
  if (t.length >= 2) {
    const first = t[0];
    const last = t[t.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      const inner = t.slice(1, -1);
      return first === '"' ? inner.replace(/\\(.)/g, "$1") : inner.replace(/''/g, "'");
    }
  }
  return t;
}

function splitCsv(s: string): string[] {
  const parts: string[] = [];
  let cur = "";
  let quote: string | null = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (quote !== null) {
      cur += c;
      if (c === quote) quote = null;
    } else if (c === '"' || c === "'") {
      quote = c;
      cur += c;
    } else if (c === ",") {
      parts.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  parts.push(cur);
  return parts.map((p) => unquote(p)).filter((p) => p.length > 0);
}

function parseInlineList(s: string): string[] | null {
  const t = s.trim();
  if (!t.startsWith("[") || !t.endsWith("]")) return null;
  const inner = t.slice(1, -1).trim();
  if (inner.length === 0) return [];
  return splitCsv(inner);
}

function toStringList(value: unknown): string[] | null {
  if (typeof value === "string") {
    const inline = parseInlineList(value);
    if (inline !== null) return inline;
    // A bare comma string counts as a list for scope/condition fields.
    if (value.includes(",")) return splitCsv(value);
    const single = unquote(value).trim();
    return single.length > 0 ? [single] : [];
  }
  if (Array.isArray(value)) {
    const out: string[] = [];
    for (const item of value) {
      if (typeof item === "string") {
        const one = unquote(item).trim();
        if (one.length > 0) out.push(one);
      } else if (typeof item === "number" || typeof item === "boolean") {
        out.push(String(item));
      }
    }
    return out;
  }
  return null;
}

export interface ParsedRuleFile {
  frontmatter: RuleFrontmatter;
  body: string;
}

/** Split `---` frontmatter from body. Returns null when no frontmatter. */
export function parseRuleFile(text: string): ParsedRuleFile | null {
  const lines = text.split("\n");
  if (lines.length === 0 || lines[0]!.trim() !== "---") return null;
  let close = -1;
  for (let i = 1; i < lines.length; i++) {
    const t = lines[i]!.trim();
    if (t === "---" || t === "...") {
      close = i;
      break;
    }
  }
  if (close < 0) return null;
  const raw: Record<string, unknown> = {};
  let i = 1;
  while (i < close) {
    const line = lines[i]!;
    i++;
    if (line.trim().length === 0 || line.trim().startsWith("#")) continue;
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const key = line.slice(0, colon).trim();
    if (key.length === 0) continue;
    let rest = line.slice(colon + 1);
    if (rest.trim().length === 0) {
      // Possible block list: consume following `- item` lines.
      const items: string[] = [];
      while (i < close && /^\s*-\s+/.test(lines[i]!)) {
        items.push(unquote(lines[i]!.replace(/^\s*-\s+/, "")).trim());
        i++;
      }
      raw[key] = items;
    } else {
      raw[key] = unquote(rest);
    }
  }
  const body = lines.slice(close + 1).join("\n").trim();
  const conditionRaw = raw["condition"];
  const frontmatter: RuleFrontmatter = { raw };
  if (typeof raw["enabled"] === "string") {
    const v = raw["enabled"].toLowerCase();
    if (v === "true") frontmatter.enabled = true;
    else if (v === "false") frontmatter.enabled = false;
  } else if (typeof raw["enabled"] === "boolean") {
    frontmatter.enabled = raw["enabled"];
  }
  if (typeof raw["description"] === "string") {
    frontmatter.description = raw["description"];
  }
  if (typeof raw["interruptMode"] === "string") {
    frontmatter.interruptMode = raw["interruptMode"].trim();
  }
  if (typeof raw["repeatMode"] === "string") {
    frontmatter.repeatMode = raw["repeatMode"].trim();
  }
  const gapRaw = raw["repeatGap"];
  const gapNum =
    typeof gapRaw === "number" ? gapRaw : typeof gapRaw === "string" ? Number(gapRaw.trim()) : NaN;
  if (Number.isFinite(gapNum) && gapNum >= 0) frontmatter.repeatGap = Math.floor(gapNum);
  const globs = toStringList(raw["globs"]);
  if (globs !== null) frontmatter.globs = globs;
  const paths = toStringList(raw["paths"]);
  if (paths !== null) frontmatter.paths = paths;
  const scope = toStringList(raw["scope"]);
  if (scope !== null) frontmatter.scope = scope;
  const condition = toStringList(conditionRaw);
  if (condition !== null) frontmatter.condition = condition;
  return { frontmatter, body };
}
