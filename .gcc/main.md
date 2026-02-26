# pi-token-burden — Roadmap

## Purpose

A pi-coding-agent extension that analyzes the system prompt's token budget,
breaking it down into sections (base prompt, AGENTS.md files, skills, metadata)
so the user can see where context window capacity is being spent.

## Current State

- v0.1.0 — functional `/context-budget` command
- Parses system prompt into sections using structural markers
- Estimates tokens via `ceil(chars / 4)` heuristic
- Renders an interactive TUI report via `showReport()`
- Full test coverage for parser, formatter, and report view
- Tooling: oxlint, oxfmt, TypeScript strict, Vitest, knip, jscpd, gitleaks, CI

## Architecture

- `src/parser.ts` — Splits the prompt into sections, extracts AGENTS.md and skill entries
- `src/formatter.ts` — Formats parsed data into report lines
- `src/report-view.ts` — TUI rendering using pi's custom component API
- `src/types.ts` — Shared types (PromptSection, SkillEntry, ParsedPrompt, ReportLine)
- `src/index.ts` — Extension entry point, registers `/context-budget` command

## Milestones

1. **Foundation** (done) — Parser, formatter, report view, tests, CI
2. **Refinements** — Better token estimation, injected-skill tracking, richer visuals
3. **Actionable insights** — Suggest which skills/files to trim when budget is tight
