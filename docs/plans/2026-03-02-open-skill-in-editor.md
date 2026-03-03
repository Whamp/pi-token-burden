# Open Skill in Editor — Implementation Plan

> **REQUIRED SUB-SKILL:** Use the executing-plans skill to implement this plan task-by-task.

**Goal:** Add an `e` keybinding in skill-toggle mode that opens the selected skill's SKILL.md file in the user's default editor.

**Architecture:** Store a `TUI` reference in `BudgetOverlay` so we can call `tui.stop()` / `tui.start()` to temporarily yield the terminal. Use `spawnSync` to launch `$VISUAL || $EDITOR || vi` with the skill's `filePath`. The overlay resumes exactly where it was after the editor closes.

**Tech Stack:** `node:child_process` (`spawnSync`), `@mariozechner/pi-tui` (`TUI` type, `matchesKey`)

**Testing strategy:**
- Unit tests for `getEditor()` env-var resolution (4 tests)
- Unit tests for footer hint rendering verification (1 test)
- E2e tests via `TmuxHarness` using a fake editor script that exits immediately, verifying the overlay survives the round-trip (2 tests)

**Key reference files:**
- `src/report-view.ts` — main implementation target
- `src/report-view.test.ts` — unit tests (currently 21 tests across 4 files)
- `src/e2e/skill-toggle.test.ts` — existing e2e tests for skill-toggle mode
- `src/e2e/tmux-harness.ts` — `TmuxHarness` class for e2e test infrastructure
- `vitest.config.e2e.ts` — e2e test config (`pnpm run test:e2e`)

---

### Task 1: Write failing unit tests for `getEditor()`

**TDD scenario:** New feature — full TDD cycle.

**Files:**
- Modify: `src/report-view.test.ts`

**Step 1: Write the failing tests**

Add these tests to `src/report-view.test.ts`. Add `getEditor` to the existing
import from `./report-view.js`:

```typescript
import { getEditor, showReport, buildTableItems } from "./report-view.js";
```

Then add the test block at the end of the file:

```typescript
describe("getEditor", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env.VISUAL = originalEnv.VISUAL;
    process.env.EDITOR = originalEnv.EDITOR;
  });

  it("should prefer $VISUAL over $EDITOR", () => {
    process.env.VISUAL = "code";
    process.env.EDITOR = "vim";
    expect(getEditor()).toBe("code");
  });

  it("should fall back to $EDITOR when $VISUAL is unset", () => {
    delete process.env.VISUAL;
    process.env.EDITOR = "nano";
    expect(getEditor()).toBe("nano");
  });

  it("should fall back to vi when both are unset", () => {
    delete process.env.VISUAL;
    delete process.env.EDITOR;
    expect(getEditor()).toBe("vi");
  });

  it("should skip empty string $VISUAL", () => {
    process.env.VISUAL = "";
    process.env.EDITOR = "nano";
    expect(getEditor()).toBe("nano");
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `pnpm run test`
Expected: FAIL — `getEditor` is not exported from `./report-view.js`

**Step 3: Commit**

```bash
git add src/report-view.test.ts
git commit -m "test: add failing tests for getEditor()"
```

---

### Task 2: Implement `getEditor()` and make tests pass

**TDD scenario:** Implement minimal code to pass the tests from Task 1.

**Files:**
- Modify: `src/report-view.ts`

**Step 1: Add the `getEditor` function**

Add this near the top of `src/report-view.ts`, after the existing helper
functions (after the `shortenLabel` function, around line 85):

```typescript
/** Resolve the user's preferred editor: $VISUAL → $EDITOR → vi. */
export function getEditor(): string {
  return process.env.VISUAL || process.env.EDITOR || "vi";
}
```

**Step 2: Run tests to verify they pass**

Run: `pnpm run test`
Expected: All 25 tests PASS (21 existing + 4 new `getEditor` tests)

**Step 3: Run typecheck**

Run: `pnpm run typecheck`
Expected: No errors

**Step 4: Commit**

```bash
git add src/report-view.ts
git commit -m "feat: add getEditor() helper"
```

---

### Task 3: Store TUI reference in BudgetOverlay and add `openSkillInEditor()`

**TDD scenario:** Modifying tested code — run existing tests first.

**Files:**
- Modify: `src/report-view.ts` — imports (~line 1-5), class fields (~line 289-310), constructor (~line 314-337), new method, `handleSkillToggleInput()` (~line 501), footer hints (~line 872), `showReport()` (~line 960)

This task combines what were previously separate tasks (store TUI ref + add
method + wire keybinding) because they form one atomic, compilable unit.

**Step 1: Run existing tests to confirm baseline**

Run: `pnpm run test`
Expected: All 25 tests pass

**Step 2: Add imports**

Add to the top of `src/report-view.ts`:

```typescript
import { spawnSync } from "node:child_process";
```

Add `TUI` to the existing `@mariozechner/pi-tui` import:

```typescript
import type { TUI } from "@mariozechner/pi-tui";
```

Verify `TUI` is exported:
```bash
grep "export.*class TUI" node_modules/@mariozechner/pi-tui/dist/tui.d.ts
```

**Step 3: Add TUI field and update constructor**

Add a field to the `BudgetOverlay` class (alongside other private fields,
around line 296):

```typescript
private readonly tui: TUI;
```

Update the constructor signature to accept `tui` as the first parameter:

```typescript
constructor(
  tui: TUI,
  parsed: ParsedPrompt,
  contextWindow: number | undefined,
  discoveredSkills: SkillInfo[],
  done: (value: null) => void,
  onToggleResult?: (result: SkillToggleResult) => boolean
) {
```

Store it as the first line of the constructor body:

```typescript
this.tui = tui;
```

**Step 4: Add `openSkillInEditor()` method**

Add this method to the `BudgetOverlay` class, after `saveSkillChanges()`
(around line 640):

```typescript
private openSkillInEditor(): void {
  const visibleSkills = this.getFilteredSkills();
  const skill = visibleSkills[this.state.selectedIndex];
  if (!skill?.filePath) {
    return;
  }

  const editorCmd = getEditor();
  const [editor, ...editorArgs] = editorCmd.split(" ");

  this.tui.stop();

  try {
    spawnSync(editor, [...editorArgs, skill.filePath], {
      stdio: "inherit",
    });
  } finally {
    this.tui.start();
    this.tui.requestRender(true);
  }
}
```

**Step 5: Wire up the `e` keybinding in `handleSkillToggleInput()`**

In `handleSkillToggleInput()`, add a handler for `e` after the `ctrl+s` block
and before the `/` search handler. This must be OUTSIDE the `searchActive` and
`confirmingDiscard` guards:

```typescript
if (data === "e") {
  this.openSkillInEditor();
  return;
}
```

**Step 6: Update footer hints for skill-toggle mode**

Find this line (~line 873):

```typescript
hints = `${italic("↑↓")} navigate  ${italic("enter")} cycle state  ${italic("/")} search  ${italic("ctrl+s")} save  ${italic("esc")} back`;
```

Replace with:

```typescript
hints = `${italic("↑↓")} navigate  ${italic("enter")} cycle state  ${italic("e")} edit  ${italic("/")} search  ${italic("ctrl+s")} save  ${italic("esc")} back`;
```

**Step 7: Pass `tui` from `showReport()`**

In `showReport()` (~line 963), update the `BudgetOverlay` construction:

```typescript
const overlay = new BudgetOverlay(
  tui,
  parsed,
  contextWindow,
  discoveredSkills ?? [],
  done,
  onToggleResult
);
```

**Step 8: Run tests and typecheck**

Run: `pnpm run test && pnpm run typecheck`
Expected: All 25 tests pass, no type errors

**Step 9: Run lint and format**

Run: `pnpm run lint && pnpm run format:check`
Expected: No errors. If format fails, run `pnpm run fix`.

**Step 10: Commit**

```bash
git add src/report-view.ts
git commit -m "feat: open skill in editor with 'e' key in skill-toggle mode"
```

---

### Task 4: Add unit test verifying the `e edit` hint appears in skill-toggle footer

**TDD scenario:** Regression test for the footer hint rendering.

**Files:**
- Modify: `src/report-view.test.ts`

This test verifies the `e edit` hint appears in the skill-toggle footer but
NOT in the sections or drilldown footers. It exercises `buildTableItems` output
indirectly — we can't render the overlay without the full TUI, but we can
verify at the snapshot level that the hint string is constructed correctly.

However, since the footer is rendered inside the private `render()` method and
there's no easy way to unit-test it without a full TUI, we'll rely on the e2e
test in the next task for this verification. Skip this task if you prefer — the
e2e test in Task 5 covers it.

**Step 1: Verify test count is still 25**

Run: `pnpm run test`
Expected: 25 tests pass

**Step 2: Commit** (no changes — checkpoint)

---

### Task 5: Write e2e tests for open-in-editor

**TDD scenario:** New e2e tests using `TmuxHarness`.

**Files:**
- Modify: `src/e2e/skill-toggle.test.ts`

These tests verify:
1. The `e edit` hint appears in skill-toggle mode footer
2. Pressing `e` opens the editor and the overlay recovers afterward
3. The selected skill doesn't change after the editor round-trip

We use a fake editor (`true` — exits immediately with status 0) via the
`EDITOR` env var so the test doesn't block waiting for user input. The
`TmuxHarness` accepts `env` in its options, and we also pass it via
`agentDir` for isolation.

**Step 1: Add the e2e tests**

Add these tests inside the existing `describe("skill-toggle mode", ...)` block
at the end, after the fuzzy search test. The `beforeEach` already navigates
into skill-toggle mode.

```typescript
it("should show 'e edit' hint in skill-toggle footer", () => {
  const text = harness.capture().join("\n");
  expect(text).toContain("edit");
});

it("should open editor and recover overlay on 'e' press", () => {
  // Capture the skill name under cursor before pressing e
  const beforeLines = harness.capture();
  const cursorLine = beforeLines.find((l) => l.includes("▸"));
  expect(cursorLine).toBeDefined();

  // Press e — fake editor (true) exits immediately
  harness.sendKeys("e");
  sleepMs(1500);

  // Overlay should still be visible after editor exits
  const afterLines = harness.waitFor("Token Burden", 10_000);
  const afterText = afterLines.join("\n");
  expect(afterText).toContain("cycle state");
  expect(afterText).toContain("edit");

  // Cursor should still be on the same skill
  const afterCursorLine = afterLines.find((l) => l.includes("▸"));
  expect(afterCursorLine).toBeDefined();
});
```

**Step 2: Update the `TmuxHarness` instantiation in `beforeEach`**

The existing `beforeEach` creates the harness. We need to set `EDITOR=true`
so the fake editor is used when `e` is pressed. Find the harness construction
in the `beforeEach`:

```typescript
harness = new TmuxHarness({
  sessionName: "e2e-skill-toggle",
  agentDir,
});
```

Replace with:

```typescript
harness = new TmuxHarness({
  sessionName: "e2e-skill-toggle",
  agentDir,
  env: { VISUAL: "", EDITOR: "true" },
});
```

This ensures `getEditor()` resolves to `true` (a shell builtin that exits 0
immediately) for all tests in this describe block. The empty `VISUAL` ensures
it falls through to `EDITOR`.

**Important:** Verify this doesn't break existing tests — `EDITOR=true` only
matters when `e` is pressed. Existing tests don't press `e`, so they're
unaffected.

**Step 3: Run the e2e tests**

Run: `pnpm run test:e2e`
Expected: All e2e tests pass (existing overlay + skill-toggle + 2 new tests)

If the `open editor and recover overlay` test fails with a timeout waiting
for `Token Burden`, debug by:
1. Checking `harness.capture()` output after `sendKeys("e")`
2. Increasing `sleepMs` after `sendKeys("e")` to 2000ms
3. Verifying `true` is available: `which true`

**Step 4: Commit**

```bash
git add src/e2e/skill-toggle.test.ts
git commit -m "test: add e2e tests for open-skill-in-editor"
```

---

### Task 6: Run full validation suite

**TDD scenario:** Final integration verification.

**Files:** None (testing only)

**Step 1: Run the full check suite**

Run: `pnpm run check`
Expected: All checks pass (test, typecheck, lint, format, deadcode, duplicates)

**Step 2: Fix any issues**

If lint or format fails, run: `pnpm run fix`

If deadcode reports `getEditor` as unused export, add it to the knip config's
ignore list. Check `knip.json`:

```bash
cat knip.json
```

If needed, add `getEditor` to the `ignore` array.

**Step 3: Run e2e tests**

Run: `pnpm run test:e2e`
Expected: All e2e tests pass

**Step 4: Commit any fixes**

```bash
git add -A
git commit -m "chore: fix lint/format issues"
```

---

### Task 7: Manual smoke test

**Files:** None (testing only)

**Step 1: Launch pi with the extension**

Run: `pi -e ./src/index.ts`

**Step 2: Full walkthrough**

1. Type `/token-burden` — overlay appears
2. Navigate to Skills section with ↑↓ keys
3. Press Enter — should enter skill-toggle mode
4. Verify footer shows: `↑↓ navigate  enter cycle state  e edit  / search  ctrl+s save  esc back`
5. Press `e` — your default editor ($EDITOR) opens with the first skill's SKILL.md
6. Close the editor — overlay reappears in skill-toggle mode
7. Verify cursor is still on the same skill
8. Navigate down to a different skill with ↓
9. Press `e` again — editor opens with the second skill's file
10. Close editor — overlay recovers again
11. Press `/`, type a partial skill name, press `e` — editor opens the filtered skill
12. Press Esc to clear search, Esc again to go back to sections
13. Verify the sections view doesn't respond to `e` (no editor launches)

**Step 3: Edge case — editor not found**

```bash
VISUAL="" EDITOR="nonexistent-editor-binary" pi -e ./src/index.ts
```

1. Open `/token-burden`, navigate to skill-toggle, press `e`
2. Verify the overlay recovers (the `finally` block calls `tui.start()`)
3. The `spawnSync` failure is silent — overlay should remain functional

**Step 4: Record results**

Note any issues found. If all pass, proceed to Task 8.

---

### Task 8: Final commit and verification

**Files:**
- Verify: all changes are committed

**Step 1: Verify git status is clean**

Run: `git status`
Expected: Clean working tree (except `.memory/state.yaml`)

**Step 2: Verify unit test count**

Run: `pnpm run test`
Expected: 25 tests pass (21 existing + 4 new `getEditor` tests)

**Step 3: Verify e2e test count**

Run: `pnpm run test:e2e`
Expected: All e2e tests pass (existing + 2 new open-in-editor tests)

**Step 4: Final full check**

Run: `pnpm run check`
Expected: All checks pass

**Step 5: Review the diff**

Run: `git log --oneline main~1..HEAD`
Expected commits (in order):
1. `test: add failing tests for getEditor()`
2. `feat: add getEditor() helper`
3. `feat: open skill in editor with 'e' key in skill-toggle mode`
4. `test: add e2e tests for open-skill-in-editor`
5. Any fix-up commits
