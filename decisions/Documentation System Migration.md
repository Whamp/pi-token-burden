---
tags:
  - decisions
  - napkin
  - migration
---

# Documentation System Migration

## Decision

Migrate project agent documentation from Brain `.memory/` files to a repository-local napkin vault.

## Rationale

- Napkin stores context as ordinary Markdown notes that are readable without a special memory extension.
- The root `NAPKIN.md` provides a lightweight level-0 project summary.
- Search/read workflows let agents retrieve context incrementally instead of loading all historical memory.
- Topic folders make durable context easier to maintain than append-only branch memory logs.

## Scope

Migrated:

- Roadmap and current state from `.memory/main.md` to `NAPKIN.md`.
- Durable architecture and decision context to `architecture/` and `decisions/` notes.
- Brain commit history to `changelog/Agent Memory History.md`.
- Agent instructions in `AGENTS.md` from Brain tools to napkin workflow.

Not migrated:

- Brain session state from `.memory/state.yaml`.
- Auto-maintained Brain `log.md` traces.
- Empty branch metadata.

## Follow-up

Use `napkin overview`, `napkin search`, and `napkin read` for future agent onboarding.
