---
tags:
  - decisions
  - pi-token-burden
---

# Key Decisions

## Token counting

Use BPE tokenization with `gpt-tokenizer` and `o200k_base` instead of a character-count heuristic. This keeps reported budget numbers close to the model-facing token cost.

## Overlay design

Use one `BudgetOverlay` TUI with drill-downs rather than separate commands for every feature. This keeps the top-level command simple while exposing deeper views for AGENTS files, skills, trace buckets, and tool definitions.

## Skill management

Skill management is integrated into the Skills drill-down. Skills use a three-state model:

- Enabled — included normally.
- Hidden — removed from model invocation / system prompt burden.
- Disabled — unavailable.

The overlay updates token impact immediately and persists changes only when the user saves.

## Skill discovery

Use filesystem discovery that matches pi's scan order: project-local, ancestor, then user-global. Duplicate skills with the same name are handled coherently so toggling affects all relevant copies.

## Editor handoff

Use the `tui.stop()` / `tui.start()` pattern when launching external editors. File-backed items (`SKILL.md`, `AGENTS.md`) open directly; generated prompt sections and tool JSON open as temporary content files.

Temp files are not explicitly deleted after editor launch because asynchronous editors such as VS Code can fork and return before reading the file.

## Base prompt tracing

Use deterministic one-pass introspection rather than subprocess diffing. Attribution normalizes lines with whitespace collapsing and exact matching. Unmatched lines are labeled `Unattributed`.

## Tool definitions count

Include tool/function schemas from `pi.getAllTools()` in the budget. These schemas are sent through the LLM tool-calling API and can be a substantial hidden context cost even when absent from literal system-prompt text.

## Documentation system

Agent-facing project documentation now uses napkin instead of Brain `.memory/` files. The root `NAPKIN.md` is the level-0 overview, with topic notes under `architecture/`, `decisions/`, `guides/`, and `changelog/`.
