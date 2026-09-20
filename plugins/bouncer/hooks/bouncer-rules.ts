// Rule compilation (pure, no $ access): filename-derived names with
// first-wins dedup across provider-ordered input. Native Claude rules
// files are Bouncer rules only when carrying a `condition:`; their `paths:`
// doubles as the path gate.

import { compileCondition, isGlobShorthand } from "./bouncer-regex";
import { parseRuleFile } from "./bouncer-frontmatter";
import { parseScope } from "./bouncer-scope";
import type { ParsedScope } from "./bouncer-scope";

export interface RuleFile {
  /** Filename-derived rule name (without .md/.mdc). */
  name: string;
  /** Raw markdown file text. */
  text: string;
  /** Human provider label for diagnostics, e.g. "project .claude/rules". */
  label: string;
  /** Full path, for diagnostics. */
  file: string;
  /**
   * True for native Claude rules (`.claude/rules/`): the file is a Bouncer
   * rule only when its frontmatter carries a `condition:`; otherwise it is
   * an ordinary instruction file and is silently ignored here.
   */
  native: boolean;
}

export interface CompiledRule {
  name: string;
  description: string;
  body: string;
  sourceLabel: string;
  file: string;
  regexes: RegExp[];
  regexSources: string[];
  digest: string;
  scopes: ParsedScope;
  globs: string[];
  interruptMode: string | undefined;
  repeatMode: string | undefined;
  repeatGap: number | undefined;
}

export interface DiscoveryResult {
  rules: CompiledRule[];
  diagnostics: string[];
}

function fnv1a(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return ("0000000" + (h >>> 0).toString(16)).slice(-8);
}

export function ruleNameOf(filename: string): string | null {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".md")) return filename.slice(0, -3);
  if (lower.endsWith(".mdc")) return filename.slice(0, -4);
  return null;
}

/**
 * Compile already-read rule files. Input order is provider priority
 * (highest first); the first file per rule name wins, later duplicates
 * are reported as shadowed.
 */
export function compileRules(
  files: readonly RuleFile[],
  disabled: readonly string[],
): DiscoveryResult {
  const diagnostics: string[] = [];
  const disabledSet: Record<string, true> = {};
  for (const d of disabled) disabledSet[d.toLowerCase()] = true;
  const seen: Record<string, true> = {};
  const rules: CompiledRule[] = [];
  for (const rf of files) {
    const key = rf.name.toLowerCase();
    if (seen[key]) {
      diagnostics.push(
        `Bouncer: "${rf.name}" shadowed — first discovery wins (${rf.label}/${rf.file}).`,
      );
      continue;
    }
    seen[key] = true;
    if (disabledSet[key]) continue;
    const parsed = parseRuleFile(rf.text);
    if (!parsed) {
      if (!rf.native) diagnostics.push(`Bouncer: "${rf.name}" has no frontmatter block; skipped.`);
      continue;
    }
    const fm = parsed.frontmatter;
    if (fm.enabled === false) continue;
    const isBouncer = (fm.condition ?? []).length > 0;
    if (!isBouncer) {
      // Ordinary native rule, not a stream rule: ignore silently here.
      // (A bouncer-rules/ file without markers gets a diagnostic below.)
      if (!rf.native) diagnostics.push(`Bouncer: "${rf.name}" has no usable condition; skipped.`);
      continue;
    }
    const body = parsed.body;
    if (body.length === 0) {
      diagnostics.push(`Bouncer: "${rf.name}" has an empty body; skipped.`);
      continue;
    }
    // Native `paths:` doubles as the Bouncer path gate when no explicit
    // `globs:` is given.
    const pathGate = (fm.globs ?? []).length > 0 ? fm.globs! : (fm.paths ?? []);
    // Legacy glob shorthand: condition looks like "*.rs".
    let conditions = fm.condition ?? [];
    const scopes = parseScope(fm.scope);
    if (conditions.length === 1 && isGlobShorthand(conditions[0]!)) {
      const glob = conditions[0]!.trim();
      conditions = [".*"];
      scopes.entries.push({ kind: "tool", name: "edit", glob });
      scopes.entries.push({ kind: "tool", name: "write", glob });
      scopes.explicit = true;
    }
    const regexes: RegExp[] = [];
    const regexSources: string[] = [];
    for (const cond of conditions) {
      const re = compileCondition(cond);
      if (re === null) {
        diagnostics.push(`Bouncer: "${rf.name}" drops invalid regex ${JSON.stringify(cond)}.`);
        continue;
      }
      regexes.push(re);
      regexSources.push(cond);
    }
    if (regexes.length === 0) {
      diagnostics.push(`Bouncer: "${rf.name}" has no usable condition; skipped.`);
      continue;
    }
    rules.push({
      name: rf.name,
      description: typeof fm.description === "string" ? fm.description : "",
      body,
      sourceLabel: rf.label,
      file: rf.file,
      regexes,
      regexSources,
      digest: fnv1a(rf.name + "\n" + regexSources.join("\n") + "\n" + body),
      scopes,
      globs: pathGate,
      interruptMode: fm.interruptMode,
      repeatMode: fm.repeatMode,
      repeatGap: fm.repeatGap,
    });
  }
  return { rules, diagnostics };
}
