# Skill Toggle Integration — Batch 2 Handoff

## Task

Execute Tasks 4–8 from the plan at `docs/plans/2026-03-01-skill-toggle-integration.md` (Phase 2: UI Integration). Use the executing-plans skill.

The plan file has the full step-by-step instructions starting at line 1391. Read it in full.

## Current State

- **Branch:** `feat/skill-toggle` (5 commits ahead of `main`)
- **All checks pass:** 62 tests, lint, typecheck, format, deadcode, duplicates — `pnpm run check` is green
- **Phase 1 is complete:** skill discovery (`src/skills.ts`), persistence (`src/skills-persistence.ts`), types (`src/types.ts`, `src/enums.ts`)

### Commits on branch
```
b0bac61 fix: resolve disable paths from settings base dir, add rollback and package discovery
ad9f3b2 feat: add skill persistence module with settings and frontmatter support
7fddba3 feat: add skill discovery module with filesystem scanning
876b334 feat: add skill toggle types and fast-check dependency
3a4ac1a docs: add skill toggle integration plan
```

## What Needs to Be Done

### Task 4: Phase 1 checkpoint
Run `pnpm run check` to verify. Already passing — just confirm and move on.

### Task 5: Extend BudgetOverlay with skill-toggle mode (the big one)
Modify `src/report-view.ts` to add a `skill-toggle` mode that activates when drilling into the Skills section. The plan has 14 numbered sub-steps. Key changes:
- Export `buildTableItems()` (currently private)
- Add `SkillToggleResult` type back to `src/types.ts` (it was removed during code review — needs to be re-added)
- Add `skill-toggle` to the `Mode` type, `pendingChanges` to state
- Add `discoveredSkills` and `onToggleResult` params to `BudgetOverlay` constructor
- Override `drillIn()` to enter skill-toggle mode for Skills sections
- Add `handleSkillToggleInput()`, `cycleSkillState()`, `getEffectiveMode()`, `recalculateTokens()`, `renderSkillToggle()`
- Update `showReport()` signature to accept `discoveredSkills` and `onToggleResult`

### Task 6: Wire index.ts
Update `src/index.ts` to discover skills via `loadAllSkills()` and pass them to `showReport()`. Add snapshot tests.

### Task 7: Discard confirmation and legend
Add confirmation prompt when pressing `esc` with pending changes, plus a legend line showing status icon meanings.

### Task 8: Final integration and manual testing
Run `pnpm run check`, manual test with `pi -e ./src/index.ts`.

## Critical Context from Code Review

The code review found and fixed several issues in Phase 1 code. These changes affect how Batch 2 code should interact with the modules:

### 1. `applyChanges()` now throws on failure (not silent)
```typescript
// It throws with structured messages:
throw new Error(`Failed to update skill frontmatter: ${message}`, { cause: error });
throw new Error(`Failed to save settings: ${message}`, { cause: error });
```
The `index.ts` wiring in Task 6 must catch these errors — the plan already shows a try/catch, which is correct.

### 2. `loadAllSkills()` has a third parameter: `settingsBaseDir`
```typescript
loadAllSkills(settings: Settings, overrideDirs?: string[], settingsBaseDir?: string)
```
For production use in `index.ts`, passing just `(settings)` is fine — it defaults to `~/.pi/agent`.

### 3. `SkillToggleResult` was removed from types.ts
The review branch removed it. You need to re-add it for Phase 2. It's needed by `showReport()` and `BudgetOverlay`.

### 4. DisableMode is an enum (not a string union)
Due to Factory lint rules, `DisableMode` lives in `src/enums.ts` and is re-exported from `src/types.ts`. Use `DisableMode.Enabled`, `DisableMode.Hidden`, `DisableMode.Disabled` — not string literals.

```typescript
// src/enums.ts
export enum DisableMode {
  Enabled = "enabled",
  Hidden = "hidden",
  Disabled = "disabled",
}
```

### 5. `resolvePathFromBase()` is duplicated
Both `src/skills.ts` and `src/skills-persistence.ts` have their own copies. This is intentional (they're private helpers). Don't try to extract a shared version — it would violate the module boundaries.

## Lint Rules to Watch Out For

The project uses strict oxlint with Factory rules. Common gotchas encountered in Phase 1:

| Rule | What it enforces |
|------|-----------------|
| `@factory/enum-file-organization` | Enums must be in `enums.ts` |
| `@factory/types-file-organization` | `types.ts` can only have type aliases and interfaces |
| `@factory/no-exported-string-union-types` | Must use enum, not `type X = "a" \| "b"` |
| `eslint/no-use-before-define` | Functions must be defined before they're called |
| `eslint/curly` | All if/for/while must have braces |
| `eslint-plugin-unicorn/text-encoding-identifier-case` | Use `"utf8"` not `"utf-8"` |
| `eslint-plugin-unicorn/prefer-spread` | Use `[...x]` not `Array.from(x)` |
| `eslint-plugin-unicorn/no-array-sort` | Use `.toSorted()` not `.sort()` |
| `eslint-plugin-unicorn/prefer-ternary` | Use ternary for simple if/else assignments |
| `typescript-eslint/array-type` | Use `T[]` not `Array<T>` |
| `eslint-plugin-vitest/prefer-to-be-truthy` | Use `toBeTruthy()` not `toBe(true)` |

**Tip:** Run `pnpm run lint:fix` to auto-fix most of these, then check for remaining errors.

## File Layout

```
src/
├── enums.ts                    # DisableMode enum
├── types.ts                    # All interfaces + re-export of DisableMode
├── index.ts                    # Extension entry (TO MODIFY in Task 6)
├── parser.ts                   # System prompt parser + estimateTokens()
├── report-view.ts              # BudgetOverlay TUI (TO MODIFY in Task 5, 7)
├── report-view.test.ts         # Report view tests (TO MODIFY in Task 5, 6)
├── utils.ts                    # fuzzyFilter(), buildBarSegments()
├── skills.ts                   # Skill discovery (DONE)
├── skills.test.ts              # Discovery tests (DONE)
├── skills-persistence.ts       # Persistence layer (DONE)
└── skills-persistence.test.ts  # Persistence tests (DONE)
```

## Key API Surfaces

### skills.ts exports
```typescript
parseFrontmatter(content: string, fallbackName: string): FrontmatterResult
scanSkillDir(dir: string, skills: RawSkill[], visitedRealPaths: Set<string>, visitedDirs?: Set<string>): void
loadAllSkills(settings: Settings, overrideDirs?: string[], settingsBaseDir?: string): { skills: SkillInfo[]; byName: Map<string, SkillInfo> }
estimateSkillPromptTokens(skill: { name, description, filePath }): number
```

### skills-persistence.ts exports
```typescript
loadSettings(settingsPath: string): Settings
saveSettings(settings: Settings, settingsPath: string): void
setFrontmatterField(content: string, key: string, value: string): string
removeFrontmatterField(content: string, key: string): string
applyChanges(changes: Map<string, DisableMode>, skillsByName: Map<string, SkillInfo>, settingsPath: string, agentDir?: string): void  // THROWS on failure
```

### Current report-view.ts exports
```typescript
showReport(parsed: ParsedPrompt, contextWindow: number | undefined, ctx: ExtensionCommandContext): Promise<void>
// buildTableItems is private — Task 5 exports it
```

## Plan Deviations from Original

The plan's code snippets use string literals like `"enabled"`, `"hidden"`, `"disabled"` for DisableMode. Replace all of these with `DisableMode.Enabled`, `DisableMode.Hidden`, `DisableMode.Disabled` from `./enums.js`.

The plan's `index.ts` in Task 6 compares `v === "enabled"` etc. — use the enum values instead.

The plan has `SkillToggleResult` with `{ applied: boolean; changes: Map<string, DisableMode> }`. This needs to be added back to `src/types.ts` since the review branch removed it.
