# pi-token-burden

A pi extension that measures model-facing prompt and tool-schema tokens and presents the breakdown in the `/token-burden` TUI.

## Verification

- Inspect the nearest tests before changing behavior and add or adjust coverage appropriate to the change.
- Run focused checks while working, then run `pnpm run check` before committing.
- For user-visible extension changes, also run `pi -e ./src/index.ts` and exercise the changed flow.
- For documentation-only changes, verify every path, command, and claim against the repository.

Work is complete when each requirement is backed by passing command output or an exercised interface.

When blocked, use **1-3-1**: state one problem, three options, and one recommendation, then wait for Will before implementing an option.

## Context pointers

- **Architecture and decisions:** use `napkin search "<topic>"` and `napkin read "<note>"`. Read `guides/Napkin Workflow.md` before writing durable project knowledge. Napkin records why; git records diffs.
- **Domain language:** read `docs/agents/domain.md` before codebase exploration, architectural work, or introducing terminology. Use the vocabulary in `CONTEXT.md`.
- **Issues and pull requests:** read `docs/agents/issue-tracker.md` before GitHub operations. For triage, also read `docs/agents/triage-labels.md` before applying labels.
- **Commands:** treat `package.json` scripts as the command source of truth. `pnpm run test:e2e` requires tmux; `pnpm run check` is the pre-commit gate.

## Change boundaries

Get Will's approval before:

- adding a dependency;
- registering a tool that executes shell commands;
- changing lint rules.

Keep TypeScript free of `any`; model values with precise types and TypeBox schemas at runtime boundaries. Keep credentials outside the repository. Generate `CHANGELOG.md` through the package scripts.

When instructions conflict, requirements change, architecture shifts, or project documentation is inaccurate, surface the mismatch and propose the relevant rules, domain, or napkin update. Wait for confirmation before making that documentation change.
