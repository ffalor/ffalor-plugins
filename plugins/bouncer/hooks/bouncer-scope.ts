// Scope parsing for Bouncer rules. Tokens (comma-aware, parens/quotes
// respected): `tool`/`toolcall`, `tool:<name>`,
// `tool:<name>(<glob>)`, or a bare tool name such as `bash`.
// No explicit scope means every tool. Legacy `text`/`thinking`/`prose`
// tokens are ignored and never match.

export interface ToolScope {
  kind: "tool";
  /** Lower-cased tool name, or "*" for every tool. */
  name: string;
  glob?: string;
}

export type ScopeEntry = ToolScope;

export interface ParsedScope {
  explicit: boolean;
  entries: ScopeEntry[];
}

/** Split on commas ignoring commas inside parens and quotes. */
export function splitScopeList(s: string): string[] {
  const parts: string[] = [];
  let cur = "";
  let depth = 0;
  let quote: string | null = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (quote !== null) {
      cur += c;
      if (c === quote) quote = null;
    } else if (c === '"' || c === "'") {
      quote = c;
      cur += c;
    } else if (c === "(") {
      depth++;
      cur += c;
    } else if (c === ")") {
      if (depth > 0) depth--;
      cur += c;
    } else if (c === "," && depth === 0) {
      parts.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  parts.push(cur);
  return parts.map((p) => p.trim()).filter((p) => p.length > 0);
}

function parseToken(token: string): ScopeEntry | null {
  const t = token.trim().replace(/^['"]|['"]$/g, "");
  const lower = t.toLowerCase();
  // Legacy prose/thinking scopes are unsupported: ignore them so a
  // prose-only rule matches nothing instead of every tool.
  if (lower === "text" || lower === "prose" || lower === "thinking") return null;
  if (lower === "tool" || lower === "toolcall" || lower === "tools") {
    return { kind: "tool", name: "*" };
  }
  const toolPrefix = /^tool\s*:\s*(.+)$/i.exec(t);
  if (toolPrefix) {
    const rest = toolPrefix[1]!.trim();
    const paren = /^([^()]+)\((.+)\)$/.exec(rest);
    if (paren) {
      const name = paren[1]!.trim().toLowerCase();
      const glob = paren[2]!.trim().replace(/^['"]|['"]$/g, "");
      if (name.length === 0 || glob.length === 0) return null;
      return { kind: "tool", name, glob };
    }
    const name = rest.replace(/^['"]|['"]$/g, "").trim().toLowerCase();
    if (name.length === 0) return null;
    return { kind: "tool", name };
  }
  // Bare tool name such as `bash` (OMP accepts it).
  if (/^[a-z0-9_][a-z0-9_\-]*$/i.test(t) && !t.includes(" ")) {
    return { kind: "tool", name: lower };
  }
  return null;
}

export function parseScope(raw: readonly string[] | undefined): ParsedScope {
  if (!raw || raw.length === 0) {
    return {
      explicit: false,
      entries: [{ kind: "tool", name: "*" }],
    };
  }
  const joined = raw.length === 1 && raw[0]!.includes(",") ? splitScopeList(raw[0]!) : raw.flatMap((s) => splitScopeList(s));
  const entries: ScopeEntry[] = [];
  for (const token of joined) {
    const entry = parseToken(token);
    if (entry !== null) entries.push(entry);
  }
  if (entries.length === 0) {
    return {
      explicit: true,
      entries: [],
    };
  }
  return { explicit: true, entries };
}
