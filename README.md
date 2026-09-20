# ffalor-plugins

A personal Claude Code plugin marketplace. It holds plugins I maintain, plus vetted copies of
third-party plugins.

## Install

```bash
claude plugin marketplace add ffalor/ffalor-plugins
claude plugin install <plugin>@ffalor-plugins
```

## Plugins

| Plugin | What it does |
| :-- | :-- |
| `bouncer` | Denies or annotates risky Edit/Write/Bash calls matching markdown guardrail rules. `/bouncer:omfg` forges a new rule from a complaint about recurring behavior. |
| `session-insights` | `/session-insights:learn` extracts non-obvious learnings from the current session into AGENTS.md files at the right directory level. `/session-insights:improve-workflow` reads past sessions and suggests what should become a skill, plugin, or agent. |
| `submit-review` | Posts a code review with line-level comments to a GitHub PR via the `gh` CLI. |
| `terraform-framework-reference` | Vendors the Terraform Plugin Framework and plugin-testing docs at the exact version your provider's `go.mod` compiles against, so lookups are verbatim and offline. Sync with `/terraform-framework-reference:update`. |
| `track-implementation` | Implements a spec while maintaining a running `implementation-notes.html` of design decisions, deliberate deviations, tradeoffs, and open questions. |

## Layout

```text
.claude-plugin/marketplace.json   # the catalog
plugins/<name>/
├── .claude-plugin/plugin.json    # per-plugin manifest
├── commands/                     # flat .md commands
├── skills/<name>/SKILL.md        # skills
└── agents/                       # subagents
```

Components live at the plugin root. Only `plugin.json` belongs in `.claude-plugin/`.

## Versioning

Each plugin pins an explicit `version` in its own `plugin.json` and nowhere else. Claude Code uses
that string to decide whether a user is up to date, so **bump it in the same commit as any change to
the plugin**. Leave it alone and `/plugin update` reports "already at the latest version" and your
changes never reach anyone. Never set `version` in `marketplace.json`: `plugin.json` silently wins.

## Before pushing

```bash
claude plugin validate .                     # the catalog
claude plugin validate ./plugins/<name>      # a plugin's manifest, frontmatter, and hooks
```

The per-plugin form is the one that catches broken YAML frontmatter in skills, commands, and agents.
A file that fails to parse still loads, but with every frontmatter field silently dropped.
