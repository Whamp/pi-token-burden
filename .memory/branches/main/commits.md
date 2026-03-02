# main

**Purpose:** Main project memory branch

---

## Commit 9848829a | 2026-02-26T21:47:18.744Z

### Branch Purpose

Primary development branch for `pi-token-burden`, a `pi` extension designed to analyze and visualize the system prompt's token budget and section breakdown.

### Previous Progress Summary

Initial commit.

### This Commit's Contribution

- Initialized GCC memory management to track project architectural decisions and roadmap evolution.
- Developed a v0.1.0 core including a `/context-budget` command for real-time visibility into session context usage.
- Implemented a decoupled architecture (Parser/Formatter/Report-View) to allow independent evolution of analysis logic and UI presentation.
- Established a high-confidence CI pipeline and local development environment with TDD, linting, and duplicate/dead code detection.
- Leveraged the `factory-extension` profile to ensure strict TypeScript compliance and alignment with `pi-coding-agent` best practices.

---

## Commit 0dc586f6 | 2026-03-02T04:46:30.524Z

### Branch Purpose

Primary development branch for `pi-token-burden`, a `pi` extension designed to analyze and visualize the system prompt's token budget and section breakdown.

### Previous Progress Summary

Initialized the project memory and established a v0.1.0 foundation. This included a decoupled architecture for analyzing the `pi` system prompt and an interactive TUI overlay. Established a rigorous CI pipeline using Vitest for TDD, oxlint/oxfmt for code quality, and established a local development workflow for extension testing.

### This Commit's Contribution

- Renamed the extension command from `/context-budget` to `/token-burden` across all source code, documentation, and implementation plans for better clarity and branding.
- Upgraded the token counting implementation and documentation to use actual BPE tokenization (`gpt-tokenizer` with `o200k_base` encoding) instead of the previous character-based heuristic.
- Corrected architectural documentation by removing a "phantom" `formatter.ts` reference, simplifying the core data flow description to match the actual implementation.
- Resolved a tooling conflict where `oxfmt` incorrectly attempted to format hidden `.memory/` or `.gcc/` state files; fixed by switching to the `ignorePatterns` configuration key in `.oxfmtrc.jsonc`.
- Updated `AGENTS.md` and `README.md` to accurately reflect the refined architecture, the new command name, and current test coverage (21 tests).
- Housekeeping: Distilled a large accumulation of log data from multiple uncommitted prior sessions into this single structural update.

---

## Commit 074e7ea0 | 2026-03-02T06:02:16.792Z

### Branch Purpose

Refine and extend the `pi-token-burden` extension to include skill management (enable/hide/disable) directly within the token-budget visualization.

### Previous Progress Summary

Initialized the project and established a v0.1.0 foundation with a decoupled architecture for analyzing the `pi` system prompt. Implemented a `/token-burden` command with an interactive TUI overlay and BPE tokenization (`o200k_base`). Standardized the command name and fixed architectural documentation to match the implemented Parser/Report-View model. Established a rigorous CI pipeline with Vitest, oxlint, and oxfmt.

### This Commit's Contribution

- Completed brainstorming and detailed technical planning for integrating `pi-skill-toggle` functionality into the `pi-token-burden` TUI.
- Decided on a merged-overlay architecture where skill toggling is accessible only within the "Skills" drill-down view to maintain a clean top-level overview.
- Committed to a three-state skill model (Enabled/Hidden/Disabled), confirming that `disable-model-invocation` (Hidden) removes skills from the system prompt, thus reducing token burden.
- Designed a hybrid data-sourcing strategy: using prompt parsing for the overall budget view and filesystem discovery for the skill management list (to show disabled skills).
- Aligned skill discovery logic with `pi`'s actual directory scan order (project-local → ancestor → user-global) and implemented coherent duplicate handling where all copies of a named skill toggle together.
- Specified an "update-in-place" UI behavior where toggling skills immediately recalculates the budget and redraws the bar chart before saving.
- Authored a comprehensive 8-task implementation plan across two phases (Discovery/Persistence and UI Integration) with a rigorous TDD and property-based testing strategy using `fast-check`.
