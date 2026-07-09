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
- `src/e2e/tmux-harness.ts` is exempt from `@factory/structured-logging` while [coding-standards issue #15](https://github.com/Whamp/coding-standards/issues/15) is open. The rule imposes an undocumented `MetaError` architecture on interpolated `Error` messages and exposes no option to disable that branch.
- Typed colocated relative paths remain in `vi.mock(import('./module.js'))` while [coding-standards issue #17](https://github.com/Whamp/coding-standards/issues/17) is open. The factories preserve actual exports with `importOriginal`; the standard does not yet define a portable absolute alias contract for NodeNext packages.

## Knip

Remove knip from the project gate. The project is small, so TS-43 is optional, and `knip@5.85.0` crashes under TypeScript 7.0.2 before analysis. [Coding-standards issue #16](https://github.com/Whamp/coding-standards/issues/16) records the incompatibility.

## Verification contract

`pnpm run check` must pass lint, typecheck, formatting, duplicate detection, and unit tests. Before release, also run `pnpm run test:e2e` and exercise the extension with `pi -e ./src/index.ts`.
