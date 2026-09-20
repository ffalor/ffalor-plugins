// Matching rule conditions against tool calls.
// Tool matching denies/annotates before execution.

import { anyGlobMatches } from "./bouncer-glob";
import type { CompiledRule } from "./bouncer-rules";
export interface ToolCandidate {
  /** File path when the tool names one, else undefined. */
  path?: string;
  /** Introduced content (Edit new_string, Write content, Bash command…). */
  text: string;
}

function stringField(args: Record<string, unknown>, keys: readonly string[]): string | undefined {
  for (const k of keys) {
    const v = args[k];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return undefined;
}

/** Extract matchable (path, text) pairs from a tool.call event. */
export function toolCandidates(tool: string, args: Record<string, unknown>): ToolCandidate[] {
  const lower = tool.toLowerCase();
  if (lower === "edit") {
    const path = stringField(args, ["file_path", "filePath", "path"]);
    const introduced = stringField(args, ["new_string", "newString", "content"]);
    if (introduced === undefined) return [];
    return [{ path, text: introduced }];
  }
  if (lower === "write") {
    const path = stringField(args, ["file_path", "filePath", "path"]);
    const content = stringField(args, ["content", "new_string", "newString", "text"]);
    if (content === undefined) return [];
    return [{ path, text: content }];
  }
  if (lower === "notebookedit" || lower === "notebook_edit") {
    const path = stringField(args, ["notebook_path", "notebookPath", "file_path"]);
    const src = stringField(args, ["new_source", "newSource", "content"]);
    if (src === undefined) return [];
    return [{ path, text: src }];
  }
  if (lower === "bash" || lower === "powershell") {
    const cmd = stringField(args, ["command", "cmd", "script"]);
    return cmd === undefined ? [] : [{ text: cmd }];
  }
  const path = stringField(args, ["file_path", "filePath", "path", "filename", "file"]);
  const parts: string[] = [];
  for (const v of Object.values(args)) {
    if (typeof v === "string" && v.length > 0 && v.length <= 200000) parts.push(v);
  }
  if (parts.length === 0) return [];
  return [{ path, text: parts.join("\n") }];
}

function agentLabelMatches(agents: readonly string[] | undefined, agentId: string | undefined): boolean {
  if (!agents || agents.length === 0) return true;
  const labels = ["*", "main", "subagent"];
  const id = (agentId ?? "").toLowerCase();
  if (id) labels.push(id);
  else labels.push("main");
  const loop = agentId ? "subagent" : "main";
  for (const pattern of agents) {
    const p = pattern.trim().toLowerCase();
    if (p === "main" && loop === "main") return true;
    if (p === "subagent" && loop === "subagent") return true;
    if (p === id && id.length > 0) return true;
    // Small glob over the loop/id labels (no path semantics needed).
    try {
      const src = "^" + p.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".") + "$";
      const re = new RegExp(src);
      if (labels.some((l) => re.test(l))) return true;
    } catch {
      if (labels.includes(p)) return true;
    }
  }
  return false;
}

/**
 * Match fully-typed tool input against every rule. Returns distinct
 * matching rules in discovery order. ast-only rules never match.
 */
export function matchToolRules(
  rules: readonly CompiledRule[],
  tool: string,
  candidates: readonly ToolCandidate[],
  agentId: string | undefined,
): CompiledRule[] {
  const toolLower = tool.toLowerCase();
  const matched: CompiledRule[] = [];
  for (const rule of rules) {
    if (rule.regexes.length === 0) continue;
    if (!agentLabelMatches(rule.agents, agentId)) continue;
    let hit = false;
    for (const candidate of candidates) {
      if (hit) break;
      for (const entry of rule.scopes.entries) {
        if (hit) break;
        if (entry.name !== "*" && entry.name !== toolLower) continue;
        if (entry.glob) {
          if (!candidate.path || !anyGlobMatches([entry.glob], candidate.path)) continue;
        } else if (rule.globs.length > 0) {
          if (!candidate.path || !anyGlobMatches(rule.globs, candidate.path)) continue;
        }
        for (const re of rule.regexes) {
          let ok = false;
          try {
            ok = re.test(candidate.text);
          } catch {
            ok = false;
          }
          if (ok) {
            hit = true;
            break;
          }
        }
      }
    }
    if (hit) matched.push(rule);
  }
  return matched;
}

/** Render the denial/correction text the model reads as an error result. */
export function renderCorrection(rules: readonly CompiledRule[]): string {
  const blocks = rules.map((r) => {
    const head = r.description ? `${r.name}: ${r.description}` : r.name;
    return `[Bouncer ${head}]\n${r.body}`;
  });
  return (
    "Bouncer rule matched; the tool call was not executed. Read the rule instruction(s) below, then retry the corrected call immediately in this turn using your best judgment. " +
    "Do not ask the user to choose between alternatives and do not wait for input — proceed with the compliant option that fits, and mention the substitution briefly as you do it.\n\n" +
    blocks.join("\n\n---\n\n")
  );
}

