# pi-token-burden

A pi extension that parses the assembled system prompt and shows a token-budget
breakdown via the `/token-burden` slash command. Uses a TUI overlay with
stacked bar visualization, drill-down table, and fuzzy search.

## Rules

- **1-3-1**: When stuck, provide 1 clearly defined problem, 3 potential options
  to overcome it, and 1 recommendation. Do not implement any option until I confirm.
- **DRY** (Critical): Do not repeat yourself. Before writing repeated code, stop
  and reconsider. Grep the codebase and refactor often.
- **TDD** (Critical): Always test first. Before writing code, check the tests.
  For new features or changes to existing features, create or adjust a test first.
  Follow existing testing patterns. Confirm the test with the user before implementing.
- **Continual Learning**: When you encounter conflicting system instructions, new
  requirements, architectural changes, or inaccurate codebase documentation,
  propose updating the relevant rules files. Do not update until the user confirms.
  Ask clarifying questions if needed.
- **Planning**: For complex, multi-step tasks, create a plan and a to-do list
  before writing code.

## Commands

| Command                 | Description                       | ~Time |
| ----------------------- | --------------------------------- | ----- |
| `pnpm run test`         | Run Vitest unit tests (105 tests) | <1s   |
| `pnpm run test:e2e`     | Run e2e TUI tests (requires tmux) | ~30s  |
| `pnpm run typecheck`    | TypeScript type checking          | ~2s   |
| `pnpm run lint`         | Run oxlint linter                 | <1s   |
| `pnpm run lint:fix`     | Run oxlint with auto-fix          | <1s   |
| `pnpm run format`       | Format code with oxfmt            | <1s   |
| `pnpm run format:check` | Check formatting without writing  | <1s   |
| `pnpm run deadcode`     | Detect dead code with knip        | ~2s   |
| `pnpm run duplicates`   | Detect duplicate code with jscpd  | ~1s   |
| `pnpm run check`        | Run all checks and report summary | ~8s   |
| `pnpm run fix`          | Auto-fix lint and formatting      | <1s   |
| `pnpm run changelog`    | Regenerate CHANGELOG.md           | <1s   |

## File Map

| Path                      | Purpose                                                         |
| ------------------------- | --------------------------------------------------------------- |
| `src/index.ts`            | Extension entry: registers `/token-burden` command, wires trace |
| `src/parser.ts`           | Parses system prompt into sections (base, AGENTS, skills, etc)  |
| `src/report-view.ts`      | TUI overlay: `BudgetOverlay` class, ANSI rendering, input       |
| `src/utils.ts`            | `fuzzyFilter()` for search, `buildBarSegments()` for bar chart  |
| `src/types.ts`            | Shared types: `ParsedPrompt`, `TableItem`, `PromptSection`      |
| `src/base-trace/`         | Source tracing: attribution, extension inspector, cache         |
| `src/*.test.ts`           | Colocated unit tests (10 files, 105 tests total)                |
| `src/e2e/tmux-harness.ts` | Tmux session helper for e2e TUI testing                         |
| `src/e2e/*.test.ts`       | E2e TUI tests (overlay, skill-toggle, trace)                    |
| `vitest.config.e2e.ts`    | Vitest config for e2e tests (30s timeout)                       |
| `CHANGELOG.md`            | Auto-generated changelog (do not edit manually)                 |
| `scripts/`                | Shell scripts (`check.sh`, `fix.sh`)                            |
| `docs/plans/`             | Implementation plans                                            |

## Architecture

```
index.ts ──→ parser.ts ──→ types.ts
   │              │
   ├──→ report-view.ts ──→ utils.ts ──→ types.ts
   │
   └──→ base-trace/ ──→ attribution.ts, base-lines.ts, extension-inspector.ts, cache.ts
```

**Data flow:** `ctx.getSystemPrompt()` → `parseSystemPrompt()` → `ParsedPrompt`
→ `BudgetOverlay` (TUI overlay with `ctx.ui.custom()`).

**Trace flow (on-demand):** `discoverAndLoadExtensions()` → `extractContributions()`
→ `extractBaseLines()` → `attributeBasePrompt()` → `BasePromptTraceResult`.

The parser identifies sections by structural markers in the assembled prompt:
`# Project Context`, `<available_skills>`, `Current date and time:`, and
pi-docs terminal markers. Token estimation uses BPE tokenization via `gpt-tokenizer` (`o200k_base` encoding).

**Key classes:**

- `BudgetOverlay` (`report-view.ts`) — stateful TUI component handling keyboard
  navigation, drill-down into children (AGENTS files, individual skills), and
  fuzzy search via `/`.

## Utilities

| Need                         | Use                  | Location        |
| ---------------------------- | -------------------- | --------------- |
| Fuzzy-match filter items     | `fuzzyFilter()`      | `src/utils.ts`  |
| Proportional bar segments    | `buildBarSegments()` | `src/utils.ts`  |
| BPE token count (o200k_base) | `estimateTokens()`   | `src/parser.ts` |

## Tooling

| Tool                | Config                                    | Purpose                                 |
| ------------------- | ----------------------------------------- | --------------------------------------- |
| oxlint + ultracite  | `.oxlintrc.json`                          | Linting with Factory rules              |
| oxfmt               | `.oxfmtrc.jsonc`                          | Code formatting                         |
| TypeScript          | `tsconfig.json`                           | Type checking (strict mode)             |
| Vitest              | `vitest.config.ts`                        | Unit testing                            |
| husky + lint-staged | `.husky/pre-commit`, `.lintstagedrc.json` | Pre-commit hooks                        |
| knip                | `knip.json`                               | Dead code detection                     |
| jscpd               | `.jscpd.json`                             | Duplicate code detection (1% threshold) |
| changelogen         | `package.json` (`version` script)         | Changelog generation from commits       |
| GitHub Actions      | `.github/workflows/check.yml`             | CI pipeline                             |

## Testing

- Framework: Vitest
- Unit tests: `*.test.ts` colocated with source files, run with `pnpm run test`
- E2e tests: `src/e2e/*.test.ts`, run with `pnpm run test:e2e` (requires tmux)
- E2e harness: `TmuxHarness` class manages tmux sessions, sendKeys, capture, waitFor
- Manual: `pi -e ./src/index.ts` then type `/token-burden`

## Deployment

```bash
# Install from npm
pi install npm:pi-token-burden

# Install from git
pi install git:github.com/Whamp/pi-token-burden

# Or try for a single session
pi -e git:github.com/Whamp/pi-token-burden

# Local dev: symlink into global extensions
ln -s "$(pwd)" ~/.pi/agent/extensions/pi-token-burden
```

## Releasing

```bash
npm version patch   # bumps version, updates CHANGELOG.md, commits, tags
git push --tags && git push
npm publish
```

The `version` script runs changelogen automatically to update `CHANGELOG.md`
before the version commit. Use `patch`, `minor`, or `major` as appropriate.

## Pre-commit

On every commit, husky runs:

1. `lint-staged` (oxlint fix + oxfmt on staged files)

## CI

`.github/workflows/check.yml` runs `pnpm run check` on push to `main` and on
pull requests.

## Boundaries

### Always

- Run `pnpm run check` before committing
- Write tests before implementation (TDD)
- Test extensions manually with `pi -e ./src/index.ts`

### Ask

- Adding new dependencies
- Registering tools that execute shell commands
- Modifying lint rules

### Never

- Disable lint rules without justification
- Commit secrets or credentials
- Use `any` types (use proper TypeBox schemas)

## Brain — Agent Memory

This project uses Brain for agent memory management.
**Start here when orienting:** Read `.memory/main.md` for the project roadmap, key decisions, and open problems.
Read `.memory/AGENTS.md` for the full Brain protocol reference.
Tools: memory_commit, memory_branch, memory_merge, memory_switch, memory_status
