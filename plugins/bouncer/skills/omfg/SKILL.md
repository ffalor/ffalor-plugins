---
name: omfg
description: Forge a Bouncer guardrail rule from a complaint to stop a recurring behavior. Use when the user complains about recurring agent behavior — "keeps doing X", "stop using Y again", "every time you...", "you did it again".
version: 1.0.0
---

# Omfg — forge a guardrail rule from a complaint

The user is frustrated about recurring agent behavior.
Author ONE Bouncer guardrail rule that would have caught the offending behavior earlier in this conversation.

The complaint is the message that invoked this skill (everything after
`/omfg`, or the complaint phrasing in context when auto-activated).

## Bouncer rule mechanics

- A rule is a markdown file with YAML frontmatter. The rule NAME is the
  filename (`<name>.md`); NEVER emit a `name:` frontmatter line.
- `condition` is one or more JavaScript regex patterns tested against tool-call
  content. Alternatives are ORed. Only leading inline flags `(?i)`, `(?m)`,
  `(?s)` are supported; anything else is left to the JS compiler and can
  reject the rule.
- `scope` is a string or list of tool tokens: `tool` (= every tool),
  `tool:<name>`, `tool:<name>(<glob>)`, or a bare tool name such as `bash`.
  Examples: `tool:write(*.rb)`, `tool:edit(*.ts)`.
- Every rule MUST carry at least one tool scope. `text`/`thinking`/`prose`
  tokens never match anything — NEVER emit them.
- Use file-specific tool scopes for code complaints. Ruby code generated
  through `write` → `tool:write(*.rb)`, not bare `tool`.
- Tool arguments may be serialized when matched. Conditions for code
  containing quotes SHOULD tolerate JSON escaping (quotes may appear as `\"`).
- When `condition` matches within `scope`, Bouncer denies the call with the
  markdown body as the error (`interruptMode: always`, default), or lets it run
  and appends the body as model-only result context (`interruptMode: never`).
- Rules load per session, so a forged rule takes effect on the NEXT session,
  not this one. Always say so after saving.

## Output contract

- Emit exactly one JSON object and nothing else (no frontmatter, no fenced
  block around it — you assemble the file yourself in step 4).
- JSON fields: `name`, `description`, `condition`, `scope`, `body`.
- `name` MUST be kebab-case. It becomes the filename `<name>.md`.
- `description` MUST be a one-line summary.
- `condition` MUST be a string or string array of JavaScript regex patterns.
- `condition` MUST match the specific offending tool-call content visible
  earlier in this conversation.
- Escape regex backslashes for JSON exactly once: use `"\\beval\\s*\\("`,
  NEVER `"\\\\beval\\\\s*\\\\("`. If validation reports a double-escape,
  apply the suggested single-escape repair and do not repeat the bad form.
- Keep `condition` precise; NEVER use broad catch-alls.
- `scope` MUST be a string or string array of tool scopes only.
- Keep `scope` as narrow as the complaint allows. NEVER use bare `tool` when
  the offense is file-specific — use `tool:<name>(*.ext)`.
- `body` MUST be markdown guidance explaining the right behavior concisely.
- Optional: `interruptMode: always` (deny, default) vs `never` (advise
  after the run). Mention it in the assembled file only when `never` is wanted.
- Optional: `repeatMode: once` (fire once per session, default) vs `after-gap`
  (re-fire after `repeatGap` user turns), and `repeatGap` (default 10).
  Mention them only when overriding the global repeat policy.

Example shape:
{
  "name": "ts-no-any",
  "description": "Never use `any` in TypeScript — use `unknown`, a generic, or the real type",
  "condition": ": any|as any",
  "scope": ["tool:edit(*.ts)", "tool:edit(*.tsx)", "tool:write(*.ts)", "tool:write(*.tsx)"],
  "body": "Never use `: any` or `as any`. Use `unknown`, a domain type, a generic, or a type guard."
}

## Procedure

0. If there is no complaint (invoked bare), reply only with usage
   `Usage: /omfg <complaint>` and stop.
1. Find the offending behavior earlier in THIS conversation's transcript and
   QUOTE it (tool name + arguments excerpt). The rule must match that quoted
   offense. If no offense is visible, ask the user to paste it; do not invent
   a rule.
2. Draft the ONE JSON candidate per the contract above.
3. Validate it (up to 3 attempts). You have `Read`, `Grep`, `Write`, `Bash`,
   and `AskUserQuestion` for this:
   - Write the candidate JSON to a temp file and run:
     `node ${CLAUDE_PLUGIN_ROOT}/scripts/omfg-validate.mjs <candidate.json>`
     For history matching, save the quoted offense to a temp file and run:
     `node ${CLAUDE_PLUGIN_ROOT}/scripts/omfg-validate.mjs <candidate.json> <offense.txt>`
   - On failure, treat the script output as feedback: fix the listed errors,
     NEVER repeat failed scopes or conditions, and re-validate. After 3 failed
     attempts, present the last candidate and ask whether to save anyway.
4. Save:
   - Ask where via AskUserQuestion (or plain question if unavailable):
     a. `This project, guardrail-only (recommended)` —
        `<project>/.claude/bouncer-rules/<name>.md` (never injected as
        context).
     b. `This project, also native context` —
        `<project>/.claude/rules/<name>.md` (Bouncer-enforced AND injected
        as always-on context).
     c. `Global guardrail-only` — `~/.claude/bouncer-rules/<name>.md`.
     d. `Amend with feedback…` — take amendment text and go back to step 2
        with the previous candidate as context.
   - If the target exists, confirm overwrite before writing.
   - Assemble the file (Bouncer frontmatter — NO `name:` line):
     ---
     description: "<description>"
     condition: "<condition>"   # or ["a", "b"] for lists
     scope:
       - "tool:edit(*.ext)"
    # interruptMode: never    # only when advising, else omit
    # repeatMode: after-gap   # only when overriding the global repeat policy, else omit
    # repeatGap: 5            # only with after-gap, else omit
     ---
     <body>
     You MAY copy the script's printed file preview instead of hand-writing it.
   - Write with the Write tool, then report the saved path, the rule name,
     and that a NEW session is required to activate it. If placed under
     `.claude/rules/`, note it also becomes native context.
