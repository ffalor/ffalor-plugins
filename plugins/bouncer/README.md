# Bouncer mod for Claude Code (tool-call subset)

A markdown rule names a
recognizable mistake as a regex; when a tool call introduces matching content,
the mod denies the call with the rule body as the error (default), or lets it
run and appends the body as model-only result context (`interruptMode: never`).

Inspired by [oh-my-pi's Time-Traveling Stream Rules (TTSR)](https://omp.sh/docs/ttsr).
Bouncer is a subset: it ports what Claude Code function-hook mods can enforce —
tool-call matching, denial, and result context. Prose/thinking-stream
interruption and same-turn transcript surgery have no Claude mod equivalent,
so those parts of TTSR don't port.

Rules are ordinary Claude rules files — the mod reuses the native path and
detects stream rules by frontmatter. Any `.claude/rules/*.md` file carrying
a `condition:` is also a Bouncer rule; files without one are plain instruction
files and are ignored here.
Native `paths:` doubles as the Bouncer path gate when no `globs:` is given.

## Install

```sh
claude plugin marketplace add ffalor/ffalor-plugins
claude plugin install bouncer@ffalor-plugins
```

Or session-only: `claude --plugin-dir <checkout>/ffalor-plugins/plugins/bouncer`.
Function-hook mods are early access and only load with
`CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` in the environment.

## Rule locations (first discovery wins per rule name)

1. `<project>/.claude/rules/*.md` (native rules; Bouncer when `condition:` present)
2. `<project>/.claude/bouncer-rules/*.md` (Bouncer-only; never loaded as context)
3. `~/.claude/rules/*.md`
4. `~/.claude/bouncer-rules/*.md`

Use `bouncer-rules/` for guardrails you don't want injected as always-on
context. Start a new session after adding or changing a rule (per-session load).

## Rule format

```md
---
description: Short summary shown in diagnostics
condition: 'Box::leak\('        # string or list; alternatives (OR)
scope:                          # omit for all tools
  - 'tool:edit(*.rs)'
  - 'tool:write(*.rs)'
globs: 'src/**'                 # optional extra path gate
interruptMode: always           # always (deny) vs never (advise)
agents: ['main']                # optional main/subagent/id gate
---

Body: the corrective instruction the model reads when the rule fires.
```

Supported: `condition` regex with leading `(?i)`/`(?m)`/`(?s)` flags,
`scope` tool tokens with optional `(glob)`, top-level `globs`,
`interruptMode` override, `enabled: false`,
glob-looking conditions as edit/write shorthand. Only tool scopes are
supported: legacy `text`/`thinking`/`prose` tokens are ignored, so a rule
naming only those never matches.

## Plugin options

`enabled` (default true), `interruptMode` (`always` default; `never` advises),
`repeatMode` (`once` per session default; `after-gap` with `repeatGap` user
turns, default 10), `disabledRules` (comma-separated rule names).

## Behavior notes (vs OMP)

- Denial keeps the attempted call in the transcript as a tool error; OMP's
  `contextMode: discard` (removing the partial message) has no Claude
  equivalent — there is no hidden same-turn retry, only the normal tool loop.
- `once`/`after-gap` persist per session (survives resume) and reset when a
  rule's content changes.
- Enforcement never depends on UI; toasts/logs are diagnostics only.

## Forging rules with /omfg

The `omfg` skill (`skills/omfg/SKILL.md`) forges one guardrail from a
complaint about recurring behavior — invoked explicitly as `/omfg <complaint>`
(skills match by bare name) or auto-activated on complaint phrasing ("keeps
doing X", "you did it again"). Loop: quote the offense from the transcript,
draft ONE JSON `{name, description, condition, scope, body}`, validate (≤3
attempts), pick a save location, write the file.

Validate candidates with:

```sh
node bouncer/scripts/omfg-validate.mjs <candidate.json> [offense.txt] [--emit <rule.md>]
```

It checks kebab-case name, regex compile (+ single-escape repair),
tool-scope allowlist (`text`/`thinking` rejected — they never match),
offense matching incl. serialized-JSON quote forms, and narrow-scope hints
(`tool:<name>(*.ext)` over bare `tool`).
Exit 0 = valid (+ matched, when an offense is given).

Notes: rule name is filename-derived (no `name:` frontmatter line); scopes are
tool-only; saving takes effect on the NEXT session (per-session load, no live
registration). Prefer `.claude/bouncer-rules/` for guardrails you don't want
as always-on context.

## Verify

```sh
claude plugin validate ./bouncer --strict --json
```
