# pi-token-burden

## What is this?

`pi-token-burden` is a pi coding-agent extension that parses the assembled system prompt and shows where context-window tokens are being spent. The `/token-burden` slash command opens an interactive TUI overlay with a stacked bar visualization, drill-down tables, fuzzy search, skill management, and source-tracing views.

## Current state

- v0.4.0+ feature set released and published to npm.
- Parses the assembled system prompt into base prompt, AGENTS files, skills, metadata, and tool definitions.
- Estimates tokens with `gpt-tokenizer` using the `o200k_base` encoding.
- Provides `BudgetOverlay` TUI interactions:
  - keyboard navigation and drill-down;
  - fuzzy search via `/`;
  - skill toggle mode with Enabled / Hidden / Disabled states;
  - open-in-editor with `e` for skills, AGENTS files, raw sections, and tool-definition JSON;
  - base prompt source tracing with `t` on the Base prompt.
- Current automated coverage: 166 unit tests and 34 e2e TUI tests.

## Tech stack

- Language: TypeScript with strict mode.
- Runtime/package manager: Node.js, pnpm.
- Test framework: Vitest; e2e tests use tmux via `TmuxHarness`.
- Quality gate: TypeScript 7, type-aware oxlint/tsgolint, oxfmt, knip 6.25+, and packaged Factory rules.
- Tokenizer: `gpt-tokenizer` (`o200k_base`).
- Agent docs: napkin vault in this repository.

## Start here

Use napkin's progressive-disclosure workflow:

1. `napkin overview` for the vault map.
2. `napkin search "<topic>"` for relevant project notes.
3. `napkin read "<note>"` for full context.

Useful notes:

- [[architecture/Token Budget Pipeline]] — implementation data flow and modules.
- [[decisions/Key Decisions]] — architectural and product decisions worth preserving.
- [[guides/Napkin Workflow]] — how agents should maintain project notes.
- [[changelog/Agent Memory History]] — preserved Brain commit history from `.memory/`.

## Active work

Next milestone from migrated memory: **Actionable insights** — suggest which skills/files to trim when the context budget is tight.

## Open problems

- Base prompt tracing currently finds mostly built-in pi-core content; extension tools are sent via the LLM function-calling API rather than literal system-prompt text.
- Deep diff mode using subprocess counterfactuals remains deferred for pathological attribution cases.
