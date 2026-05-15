---
tags:
  - guide
  - napkin
  - agent-docs
---

# Napkin Workflow

This repository uses napkin for agent-facing project documentation.

## Reading context

Follow progressive disclosure:

1. `napkin overview` — read `NAPKIN.md` plus the vault map.
2. `napkin search "<topic>"` — find relevant notes with snippets.
3. `napkin read "<note>"` — read full notes only when needed.

Start with [[NAPKIN]] for project context.

## Writing context

Capture durable context as notes, not hidden agent state.

Good note locations:

- `architecture/` — implementation structure and data flow.
- `decisions/` — durable decisions and tradeoffs.
- `guides/` — repeatable workflows for agents and maintainers.
- `changelog/` — narrative history that is useful beyond git commits.

Prefer short notes with clear headings and wikilinks. Capture why decisions were made; git already records exact file diffs.

## Commands

```bash
napkin overview
napkin search "token definitions"
napkin read "Token Budget Pipeline"
napkin create "New Decision" --path decisions --content "# New Decision\n\n..."
napkin append "Key Decisions" "\n## New section\n\n..."
```

Use `--json` for scripted reads/searches.

## Migration note

The old Brain `.memory/` system has been removed. Historical useful memory was migrated into [[changelog/Agent Memory History|Agent Memory History]].
