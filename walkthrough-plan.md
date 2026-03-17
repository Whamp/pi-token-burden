# Open Skill in Editor — Plan Walkthrough

_2026-03-03T05:30:36Z by Showboat 0.6.1_

<!-- showboat-id: 9e233c12-1e8c-4ceb-b806-cacf470709b8 -->

## What we're building

When you run `/token-burden` and drill into the Skills section, you enter **skill-toggle mode** — a list of skills with status icons, toggle controls, and fuzzy search. We're adding a single keybinding: press `e` on any skill and it opens that skill's SKILL.md file in your default editor ($VISUAL / $EDITOR / vi).

The trick: the TUI overlay doesn't close. It temporarily yields the terminal to the editor, then resumes exactly where it was.

## How the codebase is structured

Let's look at the architecture before diving in.

```bash
find src -name "*.ts" | sort | head -15
```

```output
src/e2e/overlay.test.ts
src/e2e/skill-toggle.test.ts
src/e2e/tmux-harness.test.ts
src/e2e/tmux-harness.ts
src/enums.ts
src/index.test.ts
src/index.ts
src/parser.test.ts
src/parser.ts
src/report-view.test.ts
src/report-view.ts
src/skills-persistence.test.ts
src/skills-persistence.ts
src/skills.test.ts
src/skills.ts
```

The key files for this feature are:

- **`src/report-view.ts`** — the `BudgetOverlay` class that renders the TUI overlay and handles all keyboard input. This is where 90% of the work happens.
- **`src/types.ts`** — defines `SkillInfo` which has the `filePath` field we need.
- **`src/index.ts`** — the extension entry point that calls `showReport()`.
- **`src/e2e/skill-toggle.test.ts`** — existing e2e tests we'll extend.

## The data flow: from skill file path to the editor

The whole feature depends on one field: `SkillInfo.filePath`. Let's trace how it flows.

```bash
sed -n '57,70p' src/types.ts
```

```output

// DisableMode enum is in enums.ts per factory rules
export type { DisableMode } from "./enums.js";

export interface SkillInfo {
  name: string;
  description: string;
  filePath: string;
  allPaths: string[];
  mode: DisableMode;
  tokens: number;
  hasDuplicates: boolean;
}

```

Each `SkillInfo` has a `filePath` pointing to the skill's SKILL.md on disk. This is populated in `src/skills.ts` when skills are discovered at startup. The `BudgetOverlay` class already has access to the full `SkillInfo[]` array — it uses it for the skill-toggle mode. We just need to read `filePath` off the currently selected skill.

## How pi's own editor launching works

Before writing anything, let's look at how pi itself handles `ctrl+g` (external editor). This is the pattern we'll copy.

```bash
sed -n '103,130p' ~/utils/pi-mono/packages/coding-agent/src/modes/interactive/components/extension-editor.ts
```

```output
	private openExternalEditor(): void {
		const editorCmd = process.env.VISUAL || process.env.EDITOR;
		if (!editorCmd) {
			return;
		}

		const currentText = this.editor.getText();
		const tmpFile = path.join(os.tmpdir(), `pi-extension-editor-${Date.now()}.md`);

		try {
			fs.writeFileSync(tmpFile, currentText, "utf-8");
			this.tui.stop();

			const [editor, ...editorArgs] = editorCmd.split(" ");
			const result = spawnSync(editor, [...editorArgs, tmpFile], {
				stdio: "inherit",
			});

			if (result.status === 0) {
				const newContent = fs.readFileSync(tmpFile, "utf-8").replace(/\n$/, "");
				this.editor.setText(newContent);
			}
		} finally {
			try {
				fs.unlinkSync(tmpFile);
			} catch {
				// Ignore cleanup errors
			}
```

The pattern is:

1. `this.tui.stop()` — releases the terminal (restores cooked mode, shows cursor)
2. `spawnSync(editor, [file], { stdio: 'inherit' })` — blocks until the editor closes
3. `this.tui.start()` — reclaims the terminal (raw mode, hides cursor)
4. `this.tui.requestRender(true)` — force a full redraw since the editor used the screen

Pi's version writes a temp file and reads it back (for editing text). Ours is simpler — we just point the editor at the existing skill file. No temp files needed.

The key difference from pi's code: pi silently returns if `$VISUAL` and `$EDITOR` are both unset. We fall back to `vi` instead, matching standard Unix convention.

## The overlay's current input handling

Let's look at how `BudgetOverlay` currently handles keyboard input in skill-toggle mode. This is where we'll add the `e` keybinding.

```bash
sed -n '501,565p' src/report-view.ts
```

```output
  private handleSkillToggleInput(data: string): void {
    if (this.state.confirmingDiscard) {
      if (data === "y" || data === "Y") {
        this.state.mode = "sections";
        this.state.pendingChanges = new Map();
        this.state.confirmingDiscard = false;
        this.state.selectedIndex = 0;
        this.state.scrollOffset = 0;
        this.recalculateTokens();
        this.invalidate();
        return;
      }
      if (data === "n" || data === "N" || matchesKey(data, "escape")) {
        this.state.confirmingDiscard = false;
        this.invalidate();
        return;
      }
      return;
    }

    if (this.state.searchActive) {
      this.handleSearchInput(data);
      return;
    }

    if (matchesKey(data, "escape")) {
      if (this.state.pendingChanges.size > 0) {
        this.state.confirmingDiscard = true;
        this.invalidate();
        return;
      }
      this.state.mode = "sections";
      this.state.selectedIndex = 0;
      this.state.scrollOffset = 0;
      this.invalidate();
      return;
    }

    if (matchesKey(data, "up")) {
      this.moveSelection(-1);
      return;
    }

    if (matchesKey(data, "down")) {
      this.moveSelection(1);
      return;
    }

    if (matchesKey(data, "enter") || data === " ") {
      this.cycleSkillState();
      return;
    }

    if (matchesKey(data, "ctrl+s")) {
      this.saveSkillChanges();
      return;
    }

    if (data === "/") {
      this.state.searchActive = true;
      this.state.searchQuery = "";
      this.invalidate();
    }
  }

```

Notice the guard structure:

1. **`confirmingDiscard`** (line 502) — if the user is answering "discard changes? y/n", only y/n/esc are handled. Everything else is swallowed by the bare `return` at line 520.
2. **`searchActive`** (line 522) — if the user is typing a search query, input goes to `handleSearchInput()` which captures printable characters.
3. **Normal skill-toggle input** (line 526+) — escape, up, down, enter/space, ctrl+s, and / are handled.

Our `e` handler goes in section 3, after `ctrl+s` (line 554) and before `/` (line 559). This means:

- It won't fire during discard confirmation (good — `e` is not y/n)
- It won't fire during search (good — `e` types the letter into the search field)
- It fires only in normal skill-toggle navigation (exactly what we want)

## The TUI reference problem

Right now `BudgetOverlay` doesn't have access to the `tui` object. Let's see where it's created and how we'll thread it through.

```bash
sed -n '953,984p' src/report-view.ts
```

```output

export async function showReport(
  parsed: ParsedPrompt,
  contextWindow: number | undefined,
  ctx: ExtensionCommandContext,
  discoveredSkills?: SkillInfo[],
  onToggleResult?: (result: SkillToggleResult) => boolean
): Promise<void> {
  await ctx.ui.custom<null>(
    (tui, _theme, _kb, done) => {
      const overlay = new BudgetOverlay(
        parsed,
        contextWindow,
        discoveredSkills ?? [],
        done,
        onToggleResult
      );
      return {
        render: (width: number) => overlay.render(width),
        invalidate: () => overlay.invalidate(),
        handleInput: (data: string) => {
          overlay.handleInput(data);
          tui.requestRender();
        },
      };
    },
    {
      overlay: true,
      overlayOptions: { anchor: "center", width: OVERLAY_WIDTH },
    }
  );
}
```

The `tui` object is right there — it's the first parameter of the `ctx.ui.custom()` callback (line 962). But it never gets passed into `BudgetOverlay`. The overlay only uses `tui` indirectly, through the `handleInput` wrapper that calls `tui.requestRender()`.

The fix: add `tui` as the first constructor parameter of `BudgetOverlay` and store it as a private field. Then our `openSkillInEditor()` method can call `this.tui.stop()` and `this.tui.start()`.

Let's verify the `TUI` type is importable:

```bash
grep 'export.*class TUI\|stop()\|start()\|requestRender' node_modules/@mariozechner/pi-tui/dist/tui.d.ts | head -5
```

```output
export declare class TUI extends Container {
    start(): void;
    stop(): void;
    requestRender(force?: boolean): void;
```

All three methods we need are exported: `stop()`, `start()`, and `requestRender(force)`.

## The current constructor and class fields

Let's see exactly what the constructor looks like now:

```bash
sed -n '289,340p' src/report-view.ts
```

```output
class BudgetOverlay {
  private state: OverlayState = {
    mode: "sections",
    selectedIndex: 0,
    scrollOffset: 0,
    searchActive: false,
    searchQuery: "",
    drilldownSection: null,
    pendingChanges: new Map(),
    confirmingDiscard: false,
  };

  private tableItems: TableItem[];
  private parsed: ParsedPrompt;
  private originalParsed: ParsedPrompt;
  private originalTotalTokens: number;
  private adjustedTotalTokens: number;
  private contextWindow: number | undefined;
  private readonly discoveredSkills: SkillInfo[];
  private done: (value: null) => void;
  private onToggleResult?: (result: SkillToggleResult) => boolean;

  private cachedWidth?: number;
  private cachedLines?: string[];

  constructor(
    parsed: ParsedPrompt,
    contextWindow: number | undefined,
    discoveredSkills: SkillInfo[],
    done: (value: null) => void,
    onToggleResult?: (result: SkillToggleResult) => boolean
  ) {
    this.parsed = parsed;
    this.originalParsed = {
      ...parsed,
      sections: parsed.sections.map((s) => ({ ...s })),
    };
    this.originalTotalTokens = parsed.totalTokens;
    this.adjustedTotalTokens = parsed.totalTokens;
    this.contextWindow = contextWindow;
    this.discoveredSkills = discoveredSkills;
    this.tableItems = buildTableItems(parsed);
    this.done = done;
    this.onToggleResult = onToggleResult;
  }

  // -----------------------------------------------------------------------
  // Input handling
  // -----------------------------------------------------------------------

  handleInput(data: string): void {
    if (this.state.mode === "skill-toggle") {
```

We'll add `private readonly tui: TUI` alongside `discoveredSkills` on line 308, add `tui: TUI` as the first constructor parameter on line 315, and store `this.tui = tui` in the body.

## The footer hints

The footer tells the user what keys are available. We need to add `e edit` to the skill-toggle hints:

```bash
sed -n '870,880p' src/report-view.ts
```

```output

    let hints: string;
    if (this.state.mode === "skill-toggle") {
      hints = `${italic("↑↓")} navigate  ${italic("enter")} cycle state  ${italic("/")} search  ${italic("ctrl+s")} save  ${italic("esc")} back`;
    } else if (this.state.mode === "drilldown") {
      hints = `${italic("↑↓")} navigate  ${italic("/")} search  ${italic("esc")} back`;
    } else {
      hints = `${italic("↑↓")} navigate  ${italic("enter")} drill-in  ${italic("/")} search  ${italic("esc")} close`;
    }
    lines.push(centerRow(dim(hints)));

```

Three modes, three hint strings. We only add `e edit` to the skill-toggle line (line 873), inserted between `cycle state` and `/ search`. The drilldown and sections modes don't get it — `e` only works when you can see individual skills with file paths.

---

## Plan walkthrough: Task by task

### Task 1 — Write failing unit tests for `getEditor()`

The first thing we build is the editor resolution logic. The function `getEditor()` returns the editor command string by checking `$VISUAL`, then `$EDITOR`, then falling back to `vi`.

We test four cases:

- `$VISUAL` set → use it (even if `$EDITOR` is also set)
- `$VISUAL` unset → fall back to `$EDITOR`
- Both unset → fall back to `vi`
- `$VISUAL` is empty string → treat as unset, fall back to `$EDITOR`

The tests go in the existing `src/report-view.test.ts`. Here's what's there now:

```bash
head -6 src/report-view.test.ts
```

```output
import { showReport, buildTableItems } from "./report-view.js";
import type { ParsedPrompt } from "./types.js";

describe("report-view", () => {
  it("exports showReport function", () => {
    expectTypeOf(showReport).toBeFunction();
```

We'll add `getEditor` to the import on line 1, then add a new `describe("getEditor", ...)` block at the end of the file. The tests manipulate `process.env` and restore it in `afterEach` to avoid leaking state between tests.

These tests will fail immediately because `getEditor` doesn't exist yet — that's the point. TDD: red first, then green.

### Task 2 — Implement `getEditor()`

A one-liner using JavaScript's `||` operator for falsy-value fallback:

    export function getEditor(): string {
      return process.env.VISUAL || process.env.EDITOR || "vi";
    }

This goes near the top of `report-view.ts` with the other helper functions, after `shortenLabel()`. It's exported so the tests can import it directly.

The `||` operator handles the empty-string edge case for free — empty string is falsy in JavaScript, so `"" || "nano"` returns `"nano"`.

After this task: 25 tests pass (21 existing + 4 new).

### Task 3 — The main implementation

This is the core task. Four changes in one atomic commit.

**3a. New imports** — `spawnSync` from `node:child_process` and `TUI` type from `@mariozechner/pi-tui`.

**3b. Store TUI reference** — add `private readonly tui: TUI` field, add `tui: TUI` as first constructor parameter, store `this.tui = tui`, update `showReport()` to pass `tui` through.

**3c. The `openSkillInEditor()` method:**

    private openSkillInEditor(): void {
      const visibleSkills = this.getFilteredSkills();
      const skill = visibleSkills[this.state.selectedIndex];
      if (!skill?.filePath) { return; }

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

Key design decisions in this method:

- **`getFilteredSkills()`** — respects fuzzy search. If you've filtered the skill list with `/`, pressing `e` opens the _filtered_ selection, not the original list position.
- **Guard: `!skill?.filePath`** — no-op if the selection is somehow invalid.
- **`editorCmd.split(" ")`** — handles editors with arguments like `"code --wait"` or `"vim -u NONE"`.
- **`try/finally`** — the TUI is _always_ restored, even if `spawnSync` throws (e.g., editor binary not found). Without this, a failed editor launch would leave the terminal in cooked mode with the overlay frozen.
- **`stdio: "inherit"`** — the editor gets the real terminal stdin/stdout/stderr.
- **`requestRender(true)`** — the `true` flag forces a full redraw. The editor likely used the alternate screen buffer; without force-redraw, stale content might remain.

**3d. Wire the keybinding** — add `if (data === "e") { this.openSkillInEditor(); return; }` between the `ctrl+s` block and the `/` block. We use `data === "e"` (literal match) rather than `matchesKey()`, matching the existing pattern for `/` on line 559.

**3e. Update footer hints** — insert `e edit` into the skill-toggle hint string, between `cycle state` and `/ search`.

After this task: all 25 unit tests still pass, typecheck passes, and the feature is functionally complete. But unproven.

---

### Task 5 — E2e tests via TmuxHarness

This is where we _prove_ the feature works end-to-end. The e2e tests launch a real `pi` process inside tmux, type commands, and read back the terminal output.

The challenge: how do you test "open editor" without the test blocking forever waiting for a human to close vim?

**The trick: `EDITOR=true`**

`true` is a Unix command that exits immediately with status 0. By setting `EDITOR=true`, pressing `e` triggers the full `tui.stop() → spawnSync("true", [skillPath]) → tui.start()` cycle in under a millisecond. The overlay should reappear as if nothing happened.

Let's look at the existing e2e test setup:

```bash
sed -n '42,61p' src/e2e/skill-toggle.test.ts
```

```output
  let harness: TmuxHarness;
  let agentDir: string;

  beforeEach(() => {
    agentDir = createIsolatedAgentDir();
    harness = new TmuxHarness({
      sessionName: "e2e-skill-toggle",
      agentDir,
    });
    harness.start();
    harness.waitFor("pi-token-burden", 15_000);

    // Open overlay
    harness.sendKeys("/token-burden", "Enter");
    harness.waitFor("Token Burden", 10_000);

    // Navigate to Skills and enter skill-toggle mode
    navigateToSkillToggle(harness);
  });

```

The `beforeEach` already does the heavy lifting: creates an isolated agent dir, starts pi in tmux, opens the overlay, and navigates into skill-toggle mode. Every test starts with the skill list visible.

We make one change to the `beforeEach`: add `env: { VISUAL: "", EDITOR: "true" }` to the `TmuxHarness` options. This overrides the editor for all tests in this describe block. Existing tests don't press `e`, so they're unaffected.

Let's verify the `TmuxHarness` accepts `env` and how it gets passed to the pi process:

```bash
sed -n '70,86p' src/e2e/tmux-harness.ts
```

```output
  /** Start pi in a detached tmux session. */
  start(): void {
    // Kill stale session if it exists
    this.tryKill();

    const envPrefix = Object.entries(this.env)
      .map(([k, v]) => `${k}=${shellEscape(v)}`)
      .join(" ");

    const flags = this.piFlags.join(" ");
    const cmd = `${envPrefix ? `${envPrefix} ` : ""}pi -e ./src/index.ts ${flags} 2>&1`;

    execSync(
      `tmux new-session -d -s ${this.sessionName} -x ${this.width} -y ${this.height} '${cmd}'`,
      EXEC_OPTS
    );
  }
```

The env vars are prepended to the command as `KEY='value'` pairs. So `{ VISUAL: "", EDITOR: "true" }` becomes `VISUAL='' EDITOR='true' pi -e ./src/index.ts ...`. This is exactly what we need.

**E2e test 1: The `e edit` hint appears**

Simple text assertion — after entering skill-toggle mode, the screen should contain the word "edit". This catches regressions where the hint gets dropped from the footer.

**E2e test 2: Editor round-trip — overlay survives**

This is the critical test:

1. Capture the screen — note the cursor line (the skill with ▸)
2. Press `e`
3. The fake editor (`true`) exits immediately
4. Wait 1.5 seconds for the TUI to recover
5. Assert the overlay is still visible ("Token Burden" in output)
6. Assert we're still in skill-toggle mode ("cycle state" in hints)
7. Assert the cursor indicator (▸) is still present

The 1.5-second sleep accounts for the `tui.stop() → spawnSync → tui.start() → requestRender()` cycle plus tmux's capture latency.

Let's verify `true` is available as a command:

```bash
which true && true && echo 'exit code:' $?
```

```output
/usr/bin/true
exit code: 0
```

`/usr/bin/true` — available everywhere, exits 0, takes any arguments silently. Perfect fake editor.

### Tasks 6-8 — Validation and cleanup

**Task 6: Full validation suite**

Run `pnpm run check` which executes all quality gates:

- `pnpm run test` — 25 unit tests
- `pnpm run typecheck` — TypeScript strict mode
- `pnpm run lint` — oxlint
- `pnpm run format:check` — oxfmt
- `pnpm run deadcode` — knip (unused exports)
- `pnpm run duplicates` — jscpd (copy-paste detection)

Then `pnpm run test:e2e` separately (e2e tests are excluded from the unit test suite). Let's verify the test split:

```bash
echo '=== Unit test config ===' && grep -A2 'include\|exclude' vitest.config.ts && echo && echo '=== E2e test config ===' && grep -A2 'include\|testTimeout' vitest.config.e2e.ts
```

```output
=== Unit test config ===
    include: ["src/**/*.test.ts"],
    exclude: ["src/e2e/**"],
  },
});

=== E2e test config ===
    include: ["src/e2e/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 20_000,
  },
```

Unit tests (`pnpm run test`) include all `src/**/*.test.ts` but exclude `src/e2e/**`. E2e tests (`pnpm run test:e2e`) only include `src/e2e/**/*.test.ts` with a generous 30-second timeout per test.

**Task 7: Manual smoke test**

A 13-step walkthrough exercising:

1. The happy path: open overlay → skill-toggle → press `e` → editor opens → close editor → overlay resumes
2. Navigation after edit: cursor should be on the same skill
3. Second edit on a different skill: navigate down, press `e` again
4. Edit after search: `/` → type partial name → `e` opens the filtered result
5. Negative cases: `e` in sections mode does nothing, `e` in drilldown mode does nothing
6. Edge case: nonexistent editor binary — the `finally` block should still restore the TUI

**Task 8: Final verification**

Clean git status, correct test counts (25 unit + all e2e), all checks pass, review the commit log.

---

## Summary of all changes

```bash
cat <<'TABLE'
File                          | Change
------------------------------|--------------------------------------------------
src/report-view.ts            |
  Line 1                      | + import { spawnSync } from 'node:child_process'
  Line 1                      | + import type { TUI } from '@mariozechner/pi-tui'
  Line ~85                    | + export function getEditor() (new helper)
  Line ~308                   | + private readonly tui: TUI (new field)
  Line ~315                   | ~ constructor(tui, ...) (new first param)
  Line ~323                   | + this.tui = tui (store in body)
  Line ~557                   | + if (data === 'e') handler (new keybinding)
  Line ~640                   | + private openSkillInEditor() (new method)
  Line ~873                   | ~ hints string (add 'e edit')
  Line ~963                   | ~ new BudgetOverlay(tui, ...) (pass tui)
src/report-view.test.ts       |
  Line 1                      | ~ add getEditor to import
  End                         | + describe('getEditor', ...) (4 new tests)
src/e2e/skill-toggle.test.ts  |
  beforeEach                  | ~ add env: { VISUAL: '', EDITOR: 'true' }
  End                         | + 2 new e2e tests (hint + round-trip)
TABLE
```

```output
File                          | Change
------------------------------|--------------------------------------------------
src/report-view.ts            |
  Line 1                      | + import { spawnSync } from 'node:child_process'
  Line 1                      | + import type { TUI } from '@mariozechner/pi-tui'
  Line ~85                    | + export function getEditor() (new helper)
  Line ~308                   | + private readonly tui: TUI (new field)
  Line ~315                   | ~ constructor(tui, ...) (new first param)
  Line ~323                   | + this.tui = tui (store in body)
  Line ~557                   | + if (data === 'e') handler (new keybinding)
  Line ~640                   | + private openSkillInEditor() (new method)
  Line ~873                   | ~ hints string (add 'e edit')
  Line ~963                   | ~ new BudgetOverlay(tui, ...) (pass tui)
src/report-view.test.ts       |
  Line 1                      | ~ add getEditor to import
  End                         | + describe('getEditor', ...) (4 new tests)
src/e2e/skill-toggle.test.ts  |
  beforeEach                  | ~ add env: { VISUAL: '', EDITOR: 'true' }
  End                         | + 2 new e2e tests (hint + round-trip)
```

## Risk areas and mitigations

**Risk 1: `spawnSync` throws on missing binary.**
Mitigation: the `try/finally` block ensures `tui.start()` always runs. The overlay recovers even if the editor doesn't exist. Verified in the manual smoke test (Task 7, step 6).

**Risk 2: `e` fires during search.**
Not possible — when `searchActive` is true, `handleSearchInput()` handles all input, including printable characters. The `e` handler is never reached. Verified by the existing "filter skills with fuzzy search" e2e test which types characters into the search field.

**Risk 3: `e` fires during discard confirmation.**
Not possible — the `confirmingDiscard` guard at the top of `handleSkillToggleInput()` swallows all input except y/n/esc via the bare `return` on line 520.

**Risk 4: TUI doesn't recover after editor.**
The e2e round-trip test directly validates this. If `tui.start()` or `requestRender(true)` fails, the test will timeout waiting for "Token Burden" to reappear.

**Risk 5: `getEditor()` returns a command with spaces.**
Handled by `editorCmd.split(" ")` which splits `"code --wait"` into `["code", "--wait"]`. The first element becomes the binary, the rest become arguments prepended before the file path.

**Risk 6: deadcode checker flags `getEditor` as unused.**
It's exported for testing but only called internally via `openSkillInEditor()`. If knip flags it, add it to the knip config's ignore list. Checked in Task 6.
