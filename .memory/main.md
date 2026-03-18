# pi-token-burden — Roadmap

## Purpose

A pi-coding-agent extension that analyzes the system prompt's token budget,
breaking it down into sections (base prompt, AGENTS.md files, skills, metadata)
so the user can see where context window capacity is being spent.

## Current State

- v0.4.0 released and published to npm
- Parses system prompt into sections using structural markers
- Token estimation via BPE tokenization (gpt-tokenizer, o200k_base encoding)
- Interactive TUI overlay via `BudgetOverlay`:
  - Keyboard nav, drill-down into children, fuzzy search
  - Skill-toggle mode: enable/disable/hide skills, see token impact in graphs, persist via Ctrl+S
  - Open-in-editor: press `e` to edit skill SKILL.md files or AGENTS.md files in $VISUAL/$EDITOR
  - **Base prompt source tracing**: press `t` on Base prompt to attribute lines to extensions
  - **Tool definitions section**: shows token cost of LLM function schemas, drillable with `e` to view JSON
- 111 unit tests (10 test files), 29 e2e tests (4 test files via TmuxHarness)
- Tooling: oxlint, oxfmt, TypeScript strict, Vitest, knip, jscpd, husky, CI

## Architecture

- `src/index.ts` — Extension entry point, registers `/token-burden` command, wires trace handler
- `src/parser.ts` — Splits the prompt into sections, extracts AGENTS.md and skill entries; `estimateTokens()`
- `src/report-view.ts` — `BudgetOverlay` class, ANSI rendering, keyboard input handling, trace/drilldown/skill-toggle modes
- `src/utils.ts` — `fuzzyFilter()` for search, `buildBarSegments()` for bar chart
- `src/types.ts` — Shared types (ParsedPrompt, TableItem, PromptSection, SkillInfo, SkillToggleResult)
- `src/enums.ts` — DisableMode enum (Enabled, Hidden, Disabled)
- `src/skills.ts` — Skill discovery module (filesystem scanning)
- `src/skills-persistence.ts` — Settings and frontmatter persistence for skill toggle
- `src/base-trace/` — Source tracing subsystem:
  - `types.ts` — TraceLineEvidence, TraceBucket, BasePromptTraceResult, LoadedExtension
  - `base-lines.ts` — Extracts tool/guideline bullet lines from Base prompt text
  - `attribution.ts` — Normalizes, matches, and buckets lines against extension contributions
  - `extension-inspector.ts` — Extracts promptSnippet/promptGuidelines from loaded extensions
  - `cache.ts` — In-memory fingerprint-keyed trace cache
  - `index.ts` — Barrel exports
- `src/e2e/tmux-harness.ts` — TmuxHarness class for e2e TUI testing

## Key Decisions

- BPE tokenization (o200k_base) for accurate token counts
- tui.stop()/start() pattern for opening external editor
- One-pass extension introspection for trace (not subprocess diffing)
- Trace is user-triggered only (`t` key) to keep default overlay fast
- Attribution uses exact normalized matching — unmatched lines labeled "Unattributed"
- Shared bucket for identical lines from multiple extensions (counted once, all sources listed)

## Milestones

1. **Foundation** (done) — Parser, report view, utils, tests, CI
2. **Skill management** (done) — Skill discovery, toggle mode, persistence, token impact visualization
3. **Open-in-editor** (done) — Edit skills and AGENTS.md files directly from the overlay
4. **E2e test infrastructure** (done) — TmuxHarness, overlay/skill-toggle/editor e2e tests
5. **Base prompt source tracing** (done) — On-demand attribution of Base prompt lines to extensions
6. **E2e tests for trace** (done) — 8 tests covering hint visibility, trace view, drilldown, navigation, refresh
7. **Actionable insights** (next) — Suggest which skills/files to trim when budget is tight

## Open Problems

- Base prompt is 100% built-in pi-core content; extensions contribute tools via LLM function-calling API, not system prompt text. Trace architecture supports extension attribution if pi adds this in the future.
- "Deep diff mode" (subprocess counterfactual) deferred for pathological cases
