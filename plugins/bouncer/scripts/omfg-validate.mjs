#!/usr/bin/env node
// omfg-validate.mjs — validate an /omfg rule candidate the way OMP does,
// against Bouncer semantics.
//
// Mirrors, in dependency-free node:
//   OMP  modes/controllers/omfg-rule.ts:
//     extractGeneratedRuleJson, sanitizeRuleName, normalizeConditionRegex(es),
//     parseGeneratedRulePayload, assembleRuleMarkdown, repairEscapedConditions,
//     buildNoMatchFeedback / buildScopeFeedback (narrow-scope suggestion)
//   bouncer hooks/bouncer-regex.ts, bouncer-scope.ts, bouncer-rules.ts:
//     leading (?i)/(?m)/(?s) flags, tool-scope allowlist, glob shorthand,
//     text/thinking/prose tokens never match.
//
// Usage:
//   node omfg-validate.mjs <candidate.json> [offense.txt] [--emit <rule.md>]
//
// <candidate.json> holds the model's ONE JSON object
// {name, description, condition, scope, body}. It may be raw JSON or wrapped
// in a ```json fence / surrounding prose (balanced-object extraction, like OMP).
// [offense.txt] is the quoted offending tool-call content; when given, each
// condition must match it (raw or JSON-serialized form, mirroring OMP's
// serialized-argument note).
// --emit writes the assembled Bouncer rule file (no `name:` frontmatter line;
// the filename carries the name).
//
// Exit 0 = valid (and matched, when an offense is given). Exit 1 = invalid.

import { readFileSync, writeFileSync } from "node:fs";

const JSON_FENCE_PATTERN = /```(?:json)?\s*([\s\S]*?)```/i;

function extractBalancedJsonObject(text) {
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) { escaped = false; continue; }
      if (ch === "\\") { escaped = true; continue; }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === "{") { depth++; continue; }
    if (ch === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

function extractGeneratedRuleJson(text) {
  const trimmed = text.trim();
  const fenced = JSON_FENCE_PATTERN.exec(trimmed);
  if (fenced?.[1]) {
    const obj = extractBalancedJsonObject(fenced[1]);
    if (obj) return obj;
  }
  return extractBalancedJsonObject(trimmed);
}

function sanitizeRuleName(raw) {
  return String(raw)
    .trim()
    .toLowerCase()
    .replace(/["'`]/g, "")
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "");
}

// --- regex (bouncer-regex.ts) ---

function splitLeadingFlags(pattern) {
  let rest = pattern;
  let i = false, m = false, s = false;
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

function compileCondition(pattern) {
  if (typeof pattern !== "string" || pattern.length === 0) return null;
  try {
    const { flags, source } = splitLeadingFlags(pattern);
    if (source.length === 0) return null;
    return new RegExp(source, flags);
  } catch {
    return null;
  }
}

function isGlobShorthand(value) {
  if (typeof value !== "string") return false;
  const s = value.trim();
  if (s.length === 0) return false;
  if (!s.includes("*") && !s.includes("?")) return false;
  if (/[()\[\]\\|^$+{}]/.test(s)) return false;
  return true;
}

// --- scope (bouncer-scope.ts, simplified) ---

function splitScopeList(s) {
  const parts = [];
  let cur = "";
  let depth = 0;
  let quote = null;
  for (let idx = 0; idx < s.length; idx++) {
    const ch = s[idx];
    if (quote) {
      cur += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; cur += ch; continue; }
    if (ch === "(") { depth++; cur += ch; continue; }
    if (ch === ")") { depth = Math.max(0, depth - 1); cur += ch; continue; }
    if (ch === "," && depth === 0) { parts.push(cur); cur = ""; continue; }
    cur += ch;
  }
  parts.push(cur);
  return parts.map((p) => p.trim()).filter((p) => p.length > 0);
}

const LEGACY_PROSE = new Set(["text", "prose", "thinking"]);

function parseScopeToken(token) {
  const t = token.trim().replace(/^['"]|['"]$/g, "");
  const lower = t.toLowerCase();
  if (LEGACY_PROSE.has(lower)) return { kind: "prose", raw: token };
  if (lower === "tool" || lower === "toolcall" || lower === "tools") {
    return { kind: "tool", name: "*", raw: token };
  }
  const prefix = /^tool\s*:\s*(.+)$/i.exec(t);
  if (prefix) {
    const rest = prefix[1].trim();
    const paren = /^([^()]+?)\s*\(\s*(.*?)\s*\)$/.exec(rest);
    if (paren) {
      return { kind: "tool", name: paren[1].trim().toLowerCase(), glob: paren[2], raw: token };
    }
    if (rest.length === 0) return null;
    return { kind: "tool", name: rest.toLowerCase(), raw: token };
  }
  if (/^[a-z0-9_][a-z0-9_\-]*$/i.test(t) && !t.includes(" ")) {
    return { kind: "tool", name: lower, raw: token };
  }
  return null;
}

// --- payload (omfg-rule.ts parseGeneratedRulePayload) ---

function stringField(object, key) {
  const v = object[key];
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t.length > 0 ? t : undefined;
}

function stringArrayField(object, key) {
  const v = object[key];
  if (typeof v === "string") {
    const t = v.trim();
    return t.length > 0 ? [t] : undefined;
  }
  if (!Array.isArray(v)) return undefined;
  const items = [];
  for (const item of v) {
    if (typeof item !== "string") continue;
    const t = item.trim();
    if (t.length > 0 && !items.includes(t)) items.push(t);
  }
  return items.length > 0 ? items : undefined;
}

function formatFrontmatterStringArray(values) {
  if (values.length === 1) return JSON.stringify(values[0]);
  return `[${values.map((v) => JSON.stringify(v)).join(", ")}]`;
}

function assembleRuleMarkdown({ description, condition, scope, body, interruptMode }) {
  const lines = [
    "---",
    `description: ${JSON.stringify(description)}`,
    `condition: ${formatFrontmatterStringArray(condition)}`,
    `scope: ${formatFrontmatterStringArray(scope)}`,
  ];
  if (interruptMode === "never") lines.push(`interruptMode: never`);
  lines.push("---", "", body.trim().replace(/\r\n?/g, "\n"));
  return lines.join("\n") + "\n";
}

function extensionGlob(filePaths) {
  for (const fp of filePaths ?? []) {
    const base = String(fp).replaceAll("\\", "/").split("/").pop() ?? "";
    const dot = base.lastIndexOf(".");
    if (dot > 0 && dot < base.length - 1) return `*${base.slice(dot).toLowerCase()}`;
  }
  return undefined;
}

function main() {
  const argv = process.argv.slice(2);
  const errors = [];
  const warnings = [];
  let emitPath = null;
  const positional = [];
  for (let k = 0; k < argv.length; k++) {
    if (argv[k] === "--emit") {
      emitPath = argv[++k] ?? null;
      if (!emitPath) { console.error("Missing path after --emit"); process.exit(2); }
    } else {
      positional.push(argv[k]);
    }
  }
  if (positional.length < 1 || positional.length > 2) {
    console.error("Usage: node omfg-validate.mjs <candidate.json> [offense.txt] [--emit <rule.md>]");
    process.exit(2);
  }

  let candidateText;
  try {
    candidateText = readFileSync(positional[0], "utf8");
  } catch (e) {
    console.error(`FAIL: cannot read candidate file: ${e.message}`);
    process.exit(1);
  }
  const jsonText = extractGeneratedRuleJson(candidateText);
  if (!jsonText) {
    console.error("FAIL: Missing generated rule JSON object (no balanced {...} found).");
    process.exit(1);
  }
  let payload;
  try {
    payload = JSON.parse(jsonText);
  } catch (e) {
    console.error(`FAIL: Generated rule JSON is invalid: ${e.message}`);
    process.exit(1);
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    console.error("FAIL: Generated rule JSON must be an object.");
    process.exit(1);
  }

  const rawName = stringField(payload, "name");
  if (!rawName) { errors.push("Generated rule JSON must include a non-empty name."); }
  const name = rawName ? sanitizeRuleName(rawName) : "";
  if (rawName && name.length === 0) errors.push("Rule name must contain at least one letter or digit (kebab-case).");
  else if (rawName && name !== rawName.trim().toLowerCase().replace(/["'`]/g, "")) {
    warnings.push(`Name sanitized to kebab-case: ${JSON.stringify(rawName)} -> ${JSON.stringify(name)}. Filename will be ${name}.md.`);
  }

  const description = stringField(payload, "description") ?? stringField(payload, "desc");
  if (!description) errors.push("Generated rule JSON must include a non-empty description.");
  else if (description.includes("\n")) warnings.push("Description should be a one-line summary.");

  let conditions = stringArrayField(payload, "condition") ?? stringArrayField(payload, "cond");
  if (!conditions || conditions.length === 0) errors.push("Generated rule JSON must include at least one condition.");

  let scopes = stringArrayField(payload, "scope");
  if (!scopes || scopes.length === 0) errors.push("Generated rule JSON must include at least one scope (tool scopes only).");

  const body = stringField(payload, "body");
  if (!body) errors.push("Generated rule JSON must include a non-empty body.");

  const interruptModeRaw = stringField(payload, "interruptMode");
  let interruptMode = null;
  if (interruptModeRaw) {
    const v = interruptModeRaw.trim().toLowerCase();
    if (v === "never" || v === "always") interruptMode = v;
    else warnings.push(`Unknown interruptMode ${JSON.stringify(interruptModeRaw)}; using global default.`);
  }

  // Normalize conditions: compile, else try single-unescape repair (OMP).
  const goodConditions = [];
  if (conditions) {
    for (const cond of conditions) {
      if (isGlobShorthand(cond)) {
        warnings.push(`Condition ${JSON.stringify(cond)} looks like a file glob; Bouncer treats it as edit/write shorthand on that glob with condition ".*". Prefer explicit scope tool:edit(<glob>)/tool:write(<glob> instead.`);
        goodConditions.push({ source: ".*", re: /.*/, shorthandGlob: cond.trim() });
        continue;
      }
      const direct = compileCondition(cond);
      if (direct) { goodConditions.push({ source: cond, re: direct }); continue; }
      const repaired = cond.replace(/\\\\/g, "\\");
      if (repaired !== cond && compileCondition(repaired)) {
        warnings.push(`Condition ${JSON.stringify(cond)} only compiles after single-unescape repair. Use ${JSON.stringify(repaired)} (escape backslashes for JSON exactly once).`);
        goodConditions.push({ source: repaired, re: compileCondition(repaired), repairedFrom: cond });
        continue;
      }
      let detail = "";
      try { new RegExp(cond); } catch (e) { detail = `: ${e.message}`; }
      errors.push(`Invalid condition regex ${JSON.stringify(cond)}${detail}.`);
    }
    if (conditions.length > 0 && goodConditions.length === 0 && errors.length === 0) {
      errors.push("Rule has no usable condition; skipped.");
    }
  }

  // Validate scopes.
  let toolScopes = [];
  if (scopes) {
    const proseTokens = [];
    const unparsable = [];
    for (const entry of scopes) {
      for (const token of splitScopeList(entry)) {
        const parsed = parseScopeToken(token);
        if (!parsed) { unparsable.push(token); continue; }
        if (parsed.kind === "prose") { proseTokens.push(token); continue; }
        toolScopes.push(parsed);
      }
    }
    for (const t of proseTokens) {
      errors.push(`Scope ${JSON.stringify(t)} is a prose/thinking token: Bouncer ignores it, so it never matches. Use tool:<name>(<glob>) instead.`);
    }
    for (const t of unparsable) errors.push(`Scope token ${JSON.stringify(t)} is not a valid tool scope.`);
    if (toolScopes.length === 0 && proseTokens.length === 0 && unparsable.length === 0) {
      errors.push("Rule has no reachable scope.");
    } else if (toolScopes.length === 0) {
      errors.push("Rule has no reachable tool scope (all scopes rejected).");
    }
  }

  // Offense matching (OMP history validation, manual form).
  let offenseText = null;
  let offensePaths = [];
  if (positional[1]) {
    try {
      offenseText = readFileSync(positional[1], "utf8");
    } catch (e) {
      console.error(`FAIL: cannot read offense file: ${e.message}`);
      process.exit(1);
    }
    offensePaths = [...offenseText.matchAll(/[A-Za-z0-9_.\-]+\.[A-Za-z0-9]{1,8}/g)].map((m) => m[0]);
  }

  let matched = null;
  if (offenseText !== null && goodConditions.length > 0) {
    const serialized = JSON.stringify(offenseText);
    matched = goodConditions.some(({ re }) => re.test(offenseText) || re.test(serialized));
    if (!matched) {
      errors.push(
        `No condition matched the offense text. If the bad code contains quotes, remember tool arguments match serialized JSON, so quotes may appear as \\". ` +
        `If the condition looks right, fix the scope so it reaches the offending tool and file glob.`
      );
    }
  }

  // Narrow-scope suggestion (OMP buildScopeFeedback).
  if (matched && toolScopes.length > 0) {
    const broad = toolScopes.some((s) => s.name === "*" || (s.name !== "*" && !s.glob));
    const glob = extensionGlob(offensePaths);
    if (broad && glob) {
      const firstTool = toolScopes.find((s) => s.name !== "*")?.name;
      const hint = firstTool
        ? `a narrow scope such as ${JSON.stringify(`tool:${firstTool}(${glob})`)}`
        : `narrow scopes such as ${JSON.stringify([`tool:edit(${glob})`, `tool:write(${glob})`])}`;
      warnings.push(
        `Scope is broader than the matching file-specific offense (files: ${[...new Set(offensePaths)].slice(0, 3).join(", ")}). Use ${hint}.`
      );
    }
  }

  const ok = errors.length === 0;
  if (ok) {
    console.log(`PASS: rule ${JSON.stringify(name || rawName)} is a valid Bouncer guardrail.`);
    if (positional[1]) console.log(`PASS: condition matches the quoted offense.`);
  } else {
    console.log(`FAIL: rule ${JSON.stringify(rawName ?? "(unnamed)")} is invalid:`);
  }
  for (const e of errors) console.log(`  error: ${e}`);
  for (const w of warnings) console.log(`  warn: ${w}`);

  if (ok && emitPath) {
    const fileContent = assembleRuleMarkdown({
      description,
      condition: goodConditions.map((c) => c.source),
      scope: scopes,
      body,
      interruptMode,
    });
    try {
      writeFileSync(emitPath, fileContent);
      console.log(`Wrote ${emitPath} (save as ${name}.md in the chosen rules dir).`);
    } catch (e) {
      console.error(`FAIL: cannot write ${emitPath}: ${e.message}`);
      process.exit(1);
    }
  } else if (ok) {
    console.log(`Filename: ${name}.md`);
    console.log("--- assembled preview ---");
    console.log(assembleRuleMarkdown({
      description,
      condition: goodConditions.map((c) => c.source),
      scope: scopes,
      body,
      interruptMode,
    }));
  }
  process.exit(ok ? 0 : 1);
}

main();
