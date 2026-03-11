# pi-token-burden — Roadmap

## Purpose

A pi-coding-agent extension that analyzes the system prompt's token budget,
breaking it down into sections (base prompt, AGENTS.md files, skills, metadata)
so the user can see where context window capacity is being spent.

## Current State

- v0.3.0 released and published to npm
- Parses system prompt into sections using structural markers
- Token estimation via BPE tokenization (gpt-tokenizer, o200k_base encoding)
- Interactive TUI overlay via `BudgetOverlay`:
  - Keyboard nav, drill-down into children, fuzzy search
  - Skill-toggle mode: enable/disable/hide skills, see token impact in graphs, persist via Ctrl+S
  - Open-in-editor: press `e` to edit skill SKILL.md files or AGENTS.md files in $VISUAL/$EDITOR
- 71 unit tests (6 test files), 19 e2e tests (3 test files via TmuxHarness)
- Tooling: oxlint, oxfmt, TypeScript strict, Vitest, knip, jscpd, husky, CI

## Architecture

- `src/index.ts` — Extension entry point, registers `/token-burden` command
- `src/parser.ts` — Splits the prompt into sections, extracts AGENTS.md and skill entries; `estimateTokens()`
- `src/report-view.ts` — `BudgetOverlay` class, ANSI rendering, keyboard input handling, `getEditor()`, `launchEditor()`
- `src/utils.ts` — `fuzzyFilter()` for search, `buildBarSegments()` for bar chart
- `src/types.ts` — Shared types (ParsedPrompt, TableItem, PromptSection, SkillInfo, SkillToggleResult)
- `src/enums.ts` — DisableMode enum (Enabled, Hidden, Disabled)
- `src/skills.ts` — Skill discovery module (filesystem scanning)
- `src/skills-persistence.ts` — Settings and frontmatter persistence for skill toggle
- `src/e2e/tmux-harness.ts` — TmuxHarness class for e2e TUI testing

## Key Decisions

- BPE tokenization (o200k_base) for accurate token counts
- tui.stop()/start() pattern for opening external editor (matches pi's own ctrl+g)
- `EDITOR=true` trick for e2e testing of editor launch without blocking
- Drilldown items with absolute-path labels (AGENTS.md files) are editable; others are not
- oxlint `prefer-describe-function-title` conflicts with string titles matching imports — use suffixed names

## Milestones

1. **Foundation** (done) — Parser, report view, utils, tests, CI
2. **Skill management** (done) — Skill discovery, toggle mode, persistence, token impact visualization
3. **Open-in-editor** (done) — Edit skills and AGENTS.md files directly from the overlay
4. **E2e test infrastructure** (done) — TmuxHarness, overlay/skill-toggle/editor e2e tests
5. **Actionable insights** — Suggest which skills/files to trim when budget is tight
