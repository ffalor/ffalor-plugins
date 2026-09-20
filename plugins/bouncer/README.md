# Bouncer for Claude Code

A markdown rule names a recognizable mistake as a regex; when a tool call
introduces matching content, the mod denies the call with the rule body as
the error (default), or lets it run and appends the body as model-only
result context (`interruptMode: never`).

Inspired by [oh-my-pi's Time-Traveling Stream Rules (TTSR)](https://omp.sh/docs/ttsr).

## Requirements

Function-hook mods are early access and only load with
`CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` in the environment. Without it,
Claude Code ignores the hooks and no rules are enforced.

## Install

```sh
claude plugin marketplace add ffalor/ffalor-plugins
claude plugin install bouncer@ffalor-plugins
```

Or session-only: `claude --plugin-dir <checkout>/ffalor-plugins/plugins/bouncer`.

## Rule locations

Rules are ordinary Claude rules files — the mod reuses the native path and
detects guardrails by frontmatter. Any `.claude/rules/*.md` file carrying
a `condition:` is also a Bouncer rule; files without one are plain instruction
files and are ignored here.

1. `<project>/.claude/rules/*.md` (also loaded as native context)
2. `<project>/.claude/bouncer-rules/*.md` (Bouncer-only; never loaded as context)
3. `~/.claude/rules/*.md`
4. `~/.claude/bouncer-rules/*.md`

When two files share a rule name, the first location in this list wins and
the other is reported as shadowed. The rule name is the filename
(`<name>.md`); there is no `name:` frontmatter field.

Use `bouncer-rules/` for guardrails you don't want injected as always-on
context. Start a new session after adding or changing a rule (per-session load).

## Rule format

```md
---
description: "Do not extract 1-2 line functions that only wrap an expression — inline them"
condition: "(?m)\\{\\s*return [^;{}\\n]+;?\\s*\\}|\\b(?:const|let|var)\\s+[\\w$]+\\s*=\\s*(\\([^)]*\\)|[a-zA-Z_$][\\w$]*)\\s*=>\\s*[^{\\n]+$"
scope: "tool:edit(*.ts), tool:edit(*.tsx), tool:write(*.ts), tool:write(*.tsx)"
interruptMode: never
---

Inline functions whose whole body: one expression or `return`, unless name creates a durable contract.

## Why

- One-line wrappers: no real behavior.
- Readers: jump to verify trivial code.
- Signature: freezes shape too early.
- Inline expressions: better search and type flow.

## Avoid

```typescript
// Bad — pure rename, no behavior added.
function isEmpty(value: string): boolean {
	return value.length === 0;
}

const getDisplayName = (user: User) => user.profile.displayName;
```

## Use

```typescript
if (name.length === 0) { ... }
const displayName = user.profile.displayName;
```

## Allowed tiny functions

- Three or more call sites need lockstep behavior.
- Exported name: stable domain concept.
- Type guard preserves narrowing.
- Public API, test seam, or DI boundary needs indirection.

If none apply, inline it.
```

### Per-rule fields

- `description`: one-line summary, shown in diagnostics.
- `condition`: JavaScript regex, or list of regexes (alternatives are ORed).
  Must match the offending tool-call content. Leading `(?i)`/`(?m)`/`(?s)`
  flags are supported. A condition that looks like a bare file glob
  (e.g. `*.rs`) is shorthand for matching any edit/write to that glob.
- `scope`: which tools the rule watches. Tokens: `tool` (every tool),
  `tool:<name>`, `tool:<name>(<glob>)`, or a bare tool name such as `bash`.
  Omit it to watch all tools. `text`/`thinking`/`prose` tokens are ignored,
  so a rule naming only those never matches.
- `globs`: optional extra path gate. Native `paths:` doubles as the gate
  when no `globs:` is given.
- `interruptMode`: `always` denies the call (default); `never` lets it run
  and appends the body as result context instead. Overrides the plugin default.
- `agents`: optional gate to main/subagent sessions, e.g. `['main']`.
- `enabled: false`: disables the rule.

## Plugin options

These are session policy and defaults; per-rule frontmatter above is where
individual rules vary. `interruptMode` here is the default that a rule's own
`interruptMode` overrides.

`enabled` (default true), `interruptMode` (`always` default; `never` advises),
`repeatMode` (`once` per session default; `after-gap` with `repeatGap` user
turns, default 10), `disabledRules` (comma-separated rule names).

## Behavior notes

- A denied call stays in the transcript as a tool error; the model reads the
  rule body and retries through the normal tool loop.
- `once`/`after-gap` suppression is per session (survives resume) and resets
  when a rule's content changes.
- Enforcement never depends on UI; toasts/logs are diagnostics only.

## Forging rules with /omfg

Complaining about recurring behavior? The `omfg` skill turns the complaint
into a rule file. Run `/omfg <complaint>`, or just complain in plain words
("keeps doing X") and the skill picks it up on its own.

It finds the offending output in the transcript, drafts a rule, checks the
regex and scope with `scripts/omfg-validate.mjs`, asks where to save it, and
writes the file. Prefer `.claude/bouncer-rules/` unless you also want the
rule injected as always-on context. New session required to activate it.

## Verify

```sh
claude plugin validate ./plugins/bouncer --strict --json
```
