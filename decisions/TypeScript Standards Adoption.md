---
tags:
  - decisions
  - pi-token-burden
  - typescript
  - tooling
---

# TypeScript Standards Adoption

## Decision

Adopt Whamp's shared [TypeScript standard](https://github.com/Whamp/coding-standards/blob/main/typescript.md) and [file-organization standard](https://github.com/Whamp/coding-standards/blob/main/structure.md) for `pi-token-burden`.

The project uses:

- TypeScript 7 with `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `verbatimModuleSyntax`, and `isolatedModules`;
- oxlint with `oxlint-tsgolint` for the type-aware gate;
- oxfmt for formatting;
- `@factory/eslint-plugin` through oxlint `jsPlugins`;
- knip 6.25.0 or newer for dead-export analysis;
- Vitest for unit and e2e tests.

The full gate runs `oxlint --type-aware`. The staged autofix remains non-type-aware because `oxlint-tsgolint@0.24.0` panics when lint-staged passes nested relative file paths. CI runs the full gate after staged fixes.

## Structural opt-ins

This project opts into both optional centralizers:

- `@factory/types-file-organization`: exported interfaces and type aliases live in `types.ts`;
- `@factory/constants-file-organization`: exported constants live in constants files when introduced.

The existing package is small and already follows the centralized layout. It does not use the shadcn/ui co-location pattern that motivated making these rules optional.

## Scoped exceptions

- `src/index.ts` keeps a default export because Pi's extension loader requires an extension factory as the module default. `src/index.test.ts` protects this package contract.
- Vitest config files keep default exports because Vitest loads config through that convention.
- `scripts/compare-tokenizers.ts` may use `console.*`: stdout is the CLI's user interface, not application logging.
- `src/skills-persistence.ts` is exempt from `filename-match-export`. It is a compatibility facade with five exports; Factory 0.1 reports only its single declaration export and ignores four re-exports.

## Resolved pilot feedback

[Coding-standards PR #18](https://github.com/Whamp/coding-standards/pull/18) resolved all three pilot findings:

- TS-32 permits typed co-located relative `vi.mock(import('./module.js'))` paths when a project has no source alias. Factories preserve actual exports with `importOriginal`.
- TS-34 is review-only. `@factory/structured-logging` is disabled globally because its unconfigurable `Error` → `MetaError` branch exceeds the portable standard.
- TS-43 sets knip 6.25.0 as the TypeScript 7 compatibility floor. This project keeps knip in its gate, ignores the deliberate external `tmux` binary, and removes or un-exports dead public types rather than suppressing them.

## Verification contract

`pnpm run check` must pass lint, typecheck, formatting, knip dead-code analysis, duplicate detection, and unit tests. Before release, also run `pnpm run test:e2e` and exercise the extension with `pi -e ./src/index.ts`.
