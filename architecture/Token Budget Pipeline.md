---
tags:
  - architecture
  - pi-token-burden
---

# Token Budget Pipeline

## Purpose

`pi-token-burden` shows a token-budget breakdown of the assembled pi system prompt so users can see where context-window capacity is spent.

## Architecture

```text
index.ts ──→ parser.ts ──→ types.ts
   │              │
   ├──→ report-view.ts ──→ utils.ts ──→ types.ts
   │
   └──→ base-trace/ ──→ attribution.ts, extractBaseLines.ts, extractContributions.ts, cache.ts
```

## Data flow

1. `src/index.ts` registers `/token-burden` and asks pi for the assembled prompt with `ctx.getSystemPrompt()`.
2. `src/parser.ts` parses the prompt into sections and estimates tokens with `gpt-tokenizer` using `o200k_base`.
3. `src/index.ts` augments parsed prompt data with `pi.getAllTools()` so tool definitions are included in the total budget.
4. `src/report-view.ts` renders the parsed data in `BudgetOverlay` using a TUI custom overlay.
5. `src/utils.ts` supports fuzzy filtering and proportional bar segments.

## Source tracing flow

1. `discoverAndLoadExtensions()` loads extension metadata.
2. `extractContributions()` reads prompt snippets and guidelines from loaded extensions.
3. `extractBaseLines()` extracts attributable base-prompt lines.
4. `attributeBasePrompt()` normalizes and matches evidence into buckets.
5. `BasePromptTraceResult` is cached by fingerprint in `base-trace/cache.ts`.

Tracing is user-triggered with `t` on the Base prompt so the default overlay stays fast.

## Key modules

- `src/index.ts` — extension entry point and command registration.
- `src/parser.ts` — prompt section parser and token estimation.
- `src/report-view.ts` — stateful TUI overlay, keyboard handling, drill-downs, editor handoff, trace mode.
- `src/types.ts` — shared types such as `ParsedPrompt`, `PromptSection`, and `TableItem`.
- `src/enums.ts` — `DisableMode` enum for skill states.
- `src/skills.ts` — filesystem skill discovery matching pi scan order.
- `src/skills-persistence.ts` — settings/frontmatter persistence for skill toggles.
- `src/base-trace/` — attribution subsystem for base-prompt source tracing.
- `src/e2e/tmux-harness.ts` — tmux automation for e2e TUI tests.

## Verification

- Unit tests: `pnpm run test`.
- E2e TUI tests: `pnpm run test:e2e`.
- Full gate: `pnpm run check`.
- Manual extension test: `pi -e ./src/index.ts`, then run `/token-burden`.
