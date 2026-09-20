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

## Forging rules with /omfg

When the agent keeps repeating a mistake, run `/omfg` with a short complaint
(e.g. `/omfg keeps using any in TypeScript`). It drafts a rule that would
have caught it, asks where to keep it, and saves the file. Rules take effect
in new sessions.

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

## Configuration

### Per-rule fields

- `description`: one-line summary, shown in diagnostics.
- `condition`: JavaScript regex, or list of regexes (alternatives are ORed).
  Must match the offending tool-call content. Leading `(?i)`/`(?m)`/`(?s)`
  flags are supported. A bare file glob (e.g. `*.rs`) matches any edit/write
  to that glob.
- `scope`: which tools the rule watches. A comma-separated string or YAML
  list of tokens: `tool` (every tool), `tool:<name>`,
  `tool:<name>(<glob>)`, or a bare tool name such as `bash`.
  Omit it to watch all tools.
- `globs`: optional extra path gate. Native `paths:` doubles as the gate
  when no `globs:` is given.
- `interruptMode`: `always` denies the call with the rule body as the error;
  `never` lets it run and appends the body as model-only result context.
  Falls back to the global `interruptMode` when unset.
- `repeatMode`: `once` fires this rule once per session; `after-gap` re-arms
  after `repeatGap` user turns. Falls back to the global `repeatMode` when
  unset or unknown.
- `repeatGap`: completed user turns before this `after-gap` rule may fire
  again. Falls back to the global `repeatGap` when unset or invalid.
- `enabled: false`: disables the rule.

### Plugin options

Session defaults, set in plugin `userConfig`:

- `enabled` (default `true`): master switch. `false` disables all rule matching.
- `interruptMode` (default `always`): enforcement for rules without their own
  `interruptMode`. `always` denies the call; `never` advises.
- `repeatMode` (default `once`): `once` fires each rule once per session;
  `after-gap` re-arms after `repeatGap` completed user turns. A rule's own
  `repeatMode` overrides this. Suppression is per session (survives resume)
  and resets when a rule's content changes.
- `repeatGap` (default `10`): completed user turns before an `after-gap` rule
  may fire again. A rule's own `repeatGap` overrides this.
- `disabledRules` (default `""`): comma-separated rule names to skip.

### Example

Adapted from oh-my-pi's [`ts-no-tiny-functions`](https://github.com/can1357/oh-my-pi/blob/main/packages/coding-agent/src/discovery/builtin-rules/ts-no-tiny-functions.md) builtin rule (MIT).

````md
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
````

## Verify

```sh
claude plugin validate ./plugins/bouncer --strict --json
```
