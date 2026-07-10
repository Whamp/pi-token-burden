# pi-token-burden

A pi extension that measures model-facing prompt and tool-schema tokens and presents the breakdown in the `/token-burden` TUI.

## Evidence loop

1. **Orient.** Run `napkin overview`, then search and read only the notes relevant to the task. Read `CONTEXT.md` before naming or changing domain concepts. Orientation is complete when the applicable vocabulary, decisions, and constraints are identified.
2. **Plan.** For a multi-step change, write a plan and task list before editing production code. The plan is ready when each requirement has a verification step.
3. **Red.** Before changing behavior, inspect the nearest tests and add or adjust the smallest test that expresses the requirement. Run it and confirm that it fails for the intended reason. Red is complete only when the failure demonstrates the missing behavior rather than a setup error.
4. **Green.** Implement the smallest coherent change. Search for existing helpers, types, and patterns before adding another path. Green is complete when the new test passes and the implementation has one source of truth.
5. **Close the loop.** Run the affected tests, then `pnpm run check`. For user-visible extension changes, also run `pi -e ./src/index.ts` and exercise the changed flow. Work is complete when every requirement is backed by passing command output or an exercised interface.

For documentation-only changes, replace Red and Green with reference verification: check every path, command, and claim against the repository.

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
