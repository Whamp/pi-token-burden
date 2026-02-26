# skill-token-burden

> Initialized with `init-ts-project` on 2026-02-26 using the `factory-extension` profile.

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

| Command                 | Description                       |
| ----------------------- | --------------------------------- |
| `pnpm run lint`         | Run oxlint linter                 |
| `pnpm run lint:fix`     | Run oxlint with auto-fix          |
| `pnpm run format`       | Format code with oxfmt            |
| `pnpm run format:check` | Check formatting without writing  |
| `pnpm run typecheck`    | TypeScript type checking          |
| `pnpm run test`         | Run Vitest tests                  |
| `pnpm run deadcode`     | Detect dead code with knip        |
| `pnpm run duplicates`   | Detect duplicate code with jscpd  |
| `pnpm run secrets`      | Scan for secrets with gitleaks    |
| `pnpm run check`        | Run all checks and report summary |
| `pnpm run fix`          | Auto-fix lint and formatting      |

## File Map

| Path           | Purpose                                          |
| -------------- | ------------------------------------------------ |
| `src/index.ts` | Extension entry point (exports default function) |
| `src/`         | Extension source code                            |
| `scripts/`     | Shell scripts (check.sh, fix.sh)                 |

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
| gitleaks            | `.gitleaks.toml`                          | Secret scanning                         |
| GitHub Actions      | `.github/workflows/check.yml`             | CI pipeline                             |

## Architecture

This is a pi-coding-agent extension. The entry point is `src/index.ts`, which
exports a default function receiving `ExtensionAPI`.

Key extension capabilities:

- **Custom tools** — `pi.registerTool()` with TypeBox schemas
- **Event handlers** — `pi.on()` for lifecycle events (session, tool, agent)
- **Commands** — `pi.registerCommand()` for `/slash` commands
- **Shortcuts** — `pi.registerShortcut()` for keyboard shortcuts
- **UI** — `ctx.ui` for notifications, dialogs, widgets, and custom components

Available imports:

- `@mariozechner/pi-coding-agent` — Extension types (`ExtensionAPI`, events)
- `@sinclair/typebox` — Schema definitions for tool parameters
- `@mariozechner/pi-ai` — AI utilities (`StringEnum` for Google-compatible enums)
- `@mariozechner/pi-tui` — TUI components for custom rendering

## Testing

Test with the `-e` flag:

```bash
pi -e ./src/index.ts
```

- Framework: Vitest
- File naming: `*.test.ts` colocated with source files
- Run: `pnpm run test`

## Deployment

Install the extension for all projects:

```bash
# Symlink into global extensions
ln -s "$(pwd)" ~/.pi/agent/extensions/skill-token-burden

# Or add to settings.json
# "extensions": ["/path/to/skill-token-burden/src/index.ts"]
```

For project-local use:

```bash
ln -s "$(pwd)" /path/to/project/.pi/extensions/skill-token-burden
```

## Pre-commit

On every commit, husky runs:

1. `lint-staged` (oxlint fix + oxfmt on staged files)
2. `gitleaks protect --staged` (secret scanning)

## CI

The GitHub Actions workflow (`.github/workflows/check.yml`) runs `pnpm run check`
on push to `main` and on pull requests.

## Installed Skills

- `agents` (netresearch/agents-skill)

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
