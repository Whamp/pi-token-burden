# TypeScript standards pilot — pi-token-burden

Date: 2026-07-09

## Result

`pi-token-burden` now applies the shared TypeScript and file-organization standards through TypeScript 7, type-aware oxlint/tsgolint, oxfmt, and the packaged Factory plugin.

Final proof:

- `pnpm run check`: pass
  - type-aware lint: pass
  - TypeScript 7 strict typecheck: pass
  - formatting: pass
  - knip 6.25.0 dead-code analysis: pass
  - duplicate detection: 0 clones
  - unit tests: 166 passed
- `pnpm run test:e2e`: 34 passed
- manual `pi -e ./src/index.ts`: `/token-burden` opened and rendered the live overlay
- lint contract: native `consistent-type-assertions` and Factory `no-exported-string-union-types` both fire; `as const` remains allowed

## Test-first evidence

The lint contract was red before implementation:

1. `oxlint --type-aware` aborted because `oxlint-tsgolint` was absent.
2. After installing tsgolint, oxlint rejected the inherited Ultracite JS-plugin namespaces.
3. After replacing Ultracite, the fixture exposed tsgolint's nested-relative-path panic; absolute fixture paths reached the rules.
4. Adding a zero-exit assertion to the `as const` case exposed two unrelated Factory findings (`require-test-files` and `filename-match-export`). A correctly named source plus companion test then passed the complete config.

The final contract requires both rule diagnostics for the invalid fixture and exit status zero for the allowed `as const` fixture.

## Baseline

Before migration, lint, TypeScript 5.9 typecheck, knip, duplicate detection, and 160 unit tests passed. The aggregate check failed because oxfmt included seven generated `.pi-subagents/artifacts` files.

The old configuration extended Ultracite, loaded a vendored Factory bundle, omitted `--type-aware`, machine-enabled Jest-only rules in a Vitest project, and machine-banned `for...in`/`export *` despite the new standard classifying those checks as review-only.

## Rule conformance

### TypeScript

| Rule | Status | Evidence or project decision |
| --- | --- | --- |
| TS-01 | Scoped exception | Named exports are enforced. Pi's extension entry and Vitest configs retain framework-required default exports. |
| TS-02 | Enforced | `typescript/no-namespace`. |
| TS-03 | Enforced | `consistent-type-imports` plus `verbatimModuleSyntax`. |
| TS-04 | Enforced | `import/no-mutable-exports`. |
| TS-05 | Enforced | `no-var` and `prefer-const`. |
| TS-06 | Enforced | `typescript/prefer-readonly`; six overlay bindings became readonly. |
| TS-07 | Enforced | `curly: all`. |
| TS-08 | Enforced | strict equality with the null exception. |
| TS-09 | Enforced | `default-case` and `no-fallthrough`. |
| TS-10 | Enforced | type-aware `only-throw-error`. |
| TS-11 | Enforced | unknown catch callbacks and unsafe-access rules. |
| TS-12 | Enforced | `ban-ts-comment`. |
| TS-13 | Reviewed | Production try blocks remain focused on parsing, filesystem calls, persistence, editor launch, or trace execution. |
| TS-14 | Enforced | `no-explicit-any` and the type-aware `no-unsafe-*` family. Opaque YAML/JSON/Pi boundaries now narrow from `unknown`. |
| TS-15 | Enforced | Opaque values use `unknown` plus `isRecord()`. |
| TS-16 | Enforced | `consistent-type-definitions: interface`. |
| TS-17 | Enforced | No real type assertions remain. The lint contract proves the ban and the `as const` exception. Shoehorn supplies partial framework mocks in tests. |
| TS-18 | Superseded | Covered by TS-17. |
| TS-19 | Reviewed | No nullable/undefined type aliases found. |
| TS-20 | Enforced | Wrapper-object and constructor bans. |
| TS-21 | Enforced | Factory exported-string-union rule; no `const enum` found. |
| TS-22 | Reviewed | Existing identifiers follow the documented casing scheme. |
| TS-23 | Reviewed | Removed `_args`, `_name`, `_theme`, and `_kb`; no underscore unused-argument convention remains. |
| TS-24 | Enforced/reviewed | Type-aware floating-promise rule; event-handler trace launches are explicitly `void`; no `this` rebinding found. |
| TS-25 | Reviewed | Every exported declaration has purpose-focused JSDoc. |
| TS-26 | Reviewed | Implementation notes use line comments; block comments are JSDoc. |
| TS-27 | Enforced | `jsdoc/check-tag-names`; no deprecated exports exist. |
| TS-28 | Enforced | TypeScript 7 with strict flags and `tsc --noEmit`. |
| TS-29 | Enforced/reviewed | Machine bans enabled; no prototype tampering found. |
| TS-30 | Reviewed | No `#private` fields found. |
| TS-31 | Enforced | Factory `require-test-files`; added `src/e2e/agent-dir.test.ts`. |
| TS-32 | Compliant | Typed co-located relative mock paths follow the corrected no-alias contract; factories preserve actual exports with `importOriginal`. |
| TS-33 | Compliant | Application code does not log. The tokenizer comparison CLI uses stdout as its user interface under a scoped exception. |
| TS-34 | Reviewed | Structured logger-call arguments are reviewed; the overbroad Factory rule is disabled globally because its `Error` → `MetaError` branch exceeds the corrected standard. |
| TS-35 | Enforced | Factory duplicate-log/throw rule. |
| TS-36 | Enforced | Native `no-promise-executor-return`. |
| TS-37 | Enforced | Native `no-param-reassign`. |
| TS-38 | Enforced | Native `prefer-promise-reject-errors`. |
| TS-39 | Enforced | Native `no-labels`. |
| TS-40 | Enforced | Native `no-console`; tokenizer CLI is a documented stdout exception. |
| TS-41 | Enforced | Native `import/no-cycle`; CodeGraph reports zero file/function cycles. |
| TS-42 | Reviewed | No `for...in` or `export *` found. |
| TS-43 | Opted in | Knip 6.25.0 runs under TypeScript 7.0.2 and is part of `pnpm run check`; dead public types were removed or un-exported and the deliberate external `tmux` binary is configured explicitly. |

### File organization

| Rule | Status | Evidence or project decision |
| --- | --- | --- |
| ST-01 | Enforced | Exported enums live in `src/enums.ts`. |
| ST-02 | Enforced | Factory error-file rule enabled; no exported error subclass exists. |
| ST-03 | Enforced | Tests are colocated; source/test pairs were renamed together. |
| ST-04 | Enforced | Factory test-utils rule enabled. |
| ST-05 | Enforced with one exception | Four source/test pairs were renamed to their exported function. `skills-persistence.ts` remains a documented multi-export compatibility facade. |
| ST-06 | Enforced | Factory exported-function-expression rule enabled. |
| ST-07 | Opted in | Exported interfaces and aliases remain centralized in `types.ts`. |
| ST-08 | Opted in | Exported constants remain centralized when introduced. |

`react.md` is not applicable: this extension renders through Pi's TUI, not React.

## Feedback returned to the standards repo

[Coding-standards PR #18](https://github.com/Whamp/coding-standards/pull/18) merged and closed all three findings:

- [#15](https://github.com/Whamp/coding-standards/issues/15): TS-34 is review-only and the overbroad Factory rule is off by default.
- [#16](https://github.com/Whamp/coding-standards/issues/16): knip 6.25.0 is the verified TypeScript 7 compatibility floor; upgrading fixed the 5.85.0 crash.
- [#17](https://github.com/Whamp/coding-standards/issues/17): typed relative Vitest mocks are valid when the project has no source alias, provided the factory preserves actual exports.

## Residual risks

- `@factory/eslint-plugin@0.1.0` remains unmaintained and declares stale TypeScript peer ranges through its dependency graph. The project lint contract proves the adopted rules execute under TypeScript 7 and oxlint 1.73 despite those warnings.
- oxlint `jsPlugins` remains alpha.
- `oxlint-tsgolint@0.24.0` panics when passed nested relative files. The full gate lints `.`; lint-staged uses non-type-aware autofix and CI follows with the full type-aware gate.
