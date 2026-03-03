# E2E TUI Tests via tmux — Implementation Plan

> **REQUIRED SUB-SKILL:** Use the executing-plans skill to implement this plan task-by-task.

**Goal:** Create comprehensive end-to-end tests that launch pi in a tmux
session, interact with the `/token-burden` TUI overlay via keystrokes, and
assert on the captured screen output.

**Architecture:** A test helper module (`src/e2e/tmux-harness.ts`) wraps tmux
lifecycle (create session, send keys, capture pane, kill session). Each test
file uses vitest with extended timeouts. Tests run against a real pi process
with `--no-session --no-memory --provider zai --model glm-4.7` to avoid token
costs — the `/token-burden` command never calls the LLM; it reads
`ctx.getSystemPrompt()` synchronously.

**Tech Stack:** vitest (existing), tmux 3.6a (system), pi CLI

---

## Discovery Summary

| Question | Answer |
|----------|--------|
| pi startup time with our extension | ~2s |
| Does `/token-burden` call the LLM? | No — reads `ctx.getSystemPrompt()` + renders |
| tmux capture-pane reliability | Solid — returns visible text without ANSI codes by default |
| ANSI codes in capture-pane? | Stripped by default; use `-e` flag to include them |
| Ctrl+S in tmux | Works via `C-s` send-keys (flow control disabled in modern tmux) |
| Pi flags for cheap testing | `--no-session --no-memory --provider zai --model glm-4.7` |
| Special keys | `Up`, `Down`, `Enter`, `Escape`, `C-s`, `Space` |
| Terminal size needed | 120x40 for the 80-col overlay to render without clipping |

## Design Decisions

### 1. Separate vitest project for e2e

E2e tests are slow (~5-10s each), need tmux, and shouldn't gate every commit.
They go in `src/e2e/` with a separate vitest config
(`vitest.config.e2e.ts`). The main `pnpm run test` stays fast (unit tests
only). A new `pnpm run test:e2e` script runs them explicitly.

### 2. Helper module, not raw tmux commands

A `TmuxHarness` class abstracts:
- `start()` — creates session, waits for pi to be ready
- `sendKeys(...keys)` — sends keystrokes with configurable delay
- `capture()` — returns screen text (string[])
- `waitFor(pattern, timeoutMs)` — polls capture until pattern appears
- `stop()` — kills session

This keeps tests readable and avoids duplicating sleep/capture boilerplate.

### 3. Fixture-based settings isolation

Tests that modify settings (save/toggle) need an isolated
`settings.json`. The harness uses a temporary directory as the agent dir
via `PI_CODING_AGENT_DIR` env var, pre-populated with a known set of
skills. This prevents tests from mutating the user's real settings.

### 4. Test scope

| Test | What it verifies |
|------|-----------------|
| Overlay renders on `/token-burden` | Title border, context window bar, stacked bar, section table visible |
| Section navigation | Up/down moves cursor indicator (`▸`), wraps at boundaries |
| Drill-down into AGENTS.md | Enter on drillable section shows children, esc returns |
| Skills drill-in enters toggle mode | Enter on Skills section shows skill list with `●`/`◐`/`○` icons |
| Skill navigation (P1 regression) | Can navigate past 4 items (the old bug limit) to reach all skills |
| Cycle skill state | Enter toggles `●` → `◐` → `○` → `●`, `*` marker appears |
| Pending changes counter | Banner shows correct count after toggles |
| Fuzzy search in skill-toggle | `/` activates search, typing filters list, esc clears |
| Save with Ctrl+S | Pending changes clear, modes persist (no snap-back) |
| Save updates settings.json | `-path` entries appear in settings file after disabling |
| Discard confirmation | Esc with pending changes shows "Discard N changes? (y/n)" |
| Discard confirm yes | `y` clears changes and returns to sections |
| Discard confirm no | `n` stays in skill-toggle with changes intact |
| Close overlay | Esc from sections view closes overlay, returns to prompt |

---

## Tasks

### Task 1: Create tmux harness module

**TDD scenario:** New module — write test for harness basics first.

**Files:**
- Create: `src/e2e/tmux-harness.ts`
- Create: `src/e2e/tmux-harness.test.ts`

**Step 1: Create the harness module**

Create `src/e2e/tmux-harness.ts`:

```typescript
import { execSync, type ExecSyncOptions } from "node:child_process";

const EXEC_OPTS: ExecSyncOptions = { encoding: "utf8", timeout: 10_000 };

export interface TmuxHarnessOptions {
  /** Unique tmux session name. */
  sessionName: string;
  /** Terminal width. Default: 120. */
  width?: number;
  /** Terminal height. Default: 40. */
  height?: number;
  /**
   * Environment variables to pass to the pi process.
   * PI_CODING_AGENT_DIR is set automatically when agentDir is provided.
   */
  env?: Record<string, string>;
  /** Override the agent dir (sets PI_CODING_AGENT_DIR). */
  agentDir?: string;
  /** Extra pi CLI flags. Default: --no-session --no-memory. */
  piFlags?: string[];
}

export class TmuxHarness {
  readonly sessionName: string;
  private readonly width: number;
  private readonly height: number;
  private readonly env: Record<string, string>;
  private readonly piFlags: string[];
  private started = false;

  constructor(opts: TmuxHarnessOptions) {
    this.sessionName = opts.sessionName;
    this.width = opts.width ?? 120;
    this.height = opts.height ?? 40;
    this.piFlags = opts.piFlags ?? [
      "--no-session",
      "--no-memory",
      "--provider",
      "zai",
      "--model",
      "glm-4.7",
    ];
    this.env = { ...opts.env };
    if (opts.agentDir) {
      this.env.PI_CODING_AGENT_DIR = opts.agentDir;
    }
  }

  /** Start pi in a detached tmux session. */
  start(): void {
    // Kill stale session if it exists
    this.tryKill();

    const envPrefix = Object.entries(this.env)
      .map(([k, v]) => `${k}=${shellEscape(v)}`)
      .join(" ");

    const flags = this.piFlags.join(" ");
    const cmd = `${envPrefix ? `${envPrefix} ` : ""}pi ${flags} 2>&1`;

    execSync(
      `tmux new-session -d -s ${this.sessionName} -x ${this.width} -y ${this.height} "${cmd}"`,
      EXEC_OPTS,
    );
    this.started = true;
  }

  /** Wait until capture output matches a pattern. */
  waitFor(pattern: string | RegExp, timeoutMs = 10_000): string[] {
    const deadline = Date.now() + timeoutMs;
    const re = typeof pattern === "string" ? new RegExp(pattern) : pattern;

    while (Date.now() < deadline) {
      const lines = this.capture();
      if (lines.some((line) => re.test(line))) {
        return lines;
      }
      sleepMs(300);
    }

    const finalCapture = this.capture();
    throw new Error(
      `Timed out waiting for ${pattern} after ${timeoutMs}ms.\nScreen:\n${finalCapture.join("\n")}`,
    );
  }

  /** Send keys to the tmux session. Inserts a brief delay between groups. */
  sendKeys(...keys: string[]): void {
    const escaped = keys.map((k) => shellEscape(k)).join(" ");
    execSync(
      `tmux send-keys -t ${this.sessionName} ${escaped}`,
      EXEC_OPTS,
    );
    sleepMs(150);
  }

  /** Capture the current pane content as an array of lines. */
  capture(): string[] {
    const output = execSync(
      `tmux capture-pane -t ${this.sessionName} -p`,
      { ...EXEC_OPTS, timeout: 5000 },
    ) as string;
    return output.split("\n");
  }

  /** Kill the tmux session. Safe to call multiple times. */
  stop(): void {
    this.tryKill();
    this.started = false;
  }

  private tryKill(): void {
    try {
      execSync(
        `tmux kill-session -t ${this.sessionName} 2>/dev/null`,
        EXEC_OPTS,
      );
    } catch {
      // Session didn't exist — fine.
    }
  }
}

function shellEscape(s: string): string {
  // If the string is a tmux key name (Enter, Escape, Up, Down, C-s, etc.)
  // don't quote it — tmux needs it unquoted.
  if (/^[A-Z]/.test(s) || /^C-/.test(s)) {
    return s;
  }
  return `'${s.replaceAll("'", "'\\''")}'`;
}

function sleepMs(ms: number): void {
  execSync(`sleep ${(ms / 1000).toFixed(3)}`);
}
```

**Step 2: Write a basic harness test**

Create `src/e2e/tmux-harness.test.ts`:

```typescript
import { TmuxHarness } from "./tmux-harness.js";

describe("TmuxHarness", () => {
  let harness: TmuxHarness;

  afterEach(() => {
    harness?.stop();
  });

  it("should start pi and capture the token-burden overlay", () => {
    harness = new TmuxHarness({ sessionName: "e2e-harness-test" });
    harness.start();
    harness.waitFor("pi-token-burden", 15_000);

    harness.sendKeys("/token-burden", "Enter");
    const lines = harness.waitFor("Token Burden", 10_000);

    const titleLine = lines.find((l) => l.includes("Token Burden"));
    expect(titleLine).toBeDefined();
  });
});
```

**Step 3: Run the test**

Run: `pnpm vitest run --config vitest.config.e2e.ts src/e2e/tmux-harness.test.ts`
Expected: PASS.

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: add tmux e2e harness for TUI testing"
```

---

### Task 2: Create e2e vitest config and npm scripts

**TDD scenario:** Infrastructure — no test-first needed.

**Files:**
- Create: `vitest.config.e2e.ts`
- Modify: `package.json` (add `test:e2e` script)
- Modify: `knip.json` (add e2e entry point)

**Step 1: Create the e2e vitest config**

Create `vitest.config.e2e.ts`:

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/e2e/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 20_000,
  },
});
```

**Step 2: Add the npm script to `package.json`**

Add to `"scripts"`:
```json
"test:e2e": "vitest run --config vitest.config.e2e.ts"
```

**Step 3: Update `knip.json`**

Add `"src/e2e/**/*.ts"` to `"entry"` so the e2e files aren't flagged as dead
code. The test files import the harness, so only the test entry matters:

```json
{
  "entry": ["src/index.ts", "src/e2e/**/*.test.ts"],
  "project": ["src/**/*.ts"]
}
```

**Step 4: Run to verify**

Run: `pnpm run test:e2e`
Expected: PASS (runs the harness test from Task 1).

Run: `pnpm run deadcode`
Expected: PASS (no new dead code flagged).

**Step 5: Commit**

```bash
git add -A
git commit -m "chore: add e2e vitest config and test:e2e script"
```

---

### Task 3: Overlay rendering and section navigation tests

**TDD scenario:** New e2e tests — write tests that exercise the overlay.

**Files:**
- Create: `src/e2e/overlay.test.ts`

**Step 1: Write overlay rendering and navigation tests**

Create `src/e2e/overlay.test.ts`:

```typescript
import { TmuxHarness } from "./tmux-harness.js";

describe("overlay rendering", () => {
  let harness: TmuxHarness;

  beforeEach(() => {
    harness = new TmuxHarness({ sessionName: "e2e-overlay" });
    harness.start();
    harness.waitFor("pi-token-burden", 15_000);
    harness.sendKeys("/token-burden", "Enter");
    harness.waitFor("Token Burden", 10_000);
  });

  afterEach(() => {
    harness.stop();
  });

  it("should show title, context bar, stacked bar, and section table", () => {
    const lines = harness.capture();
    const text = lines.join("\n");

    expect(text).toContain("Token Burden");
    expect(text).toContain("tokens");
    // Stacked bar legend — at least Base and Skills should appear
    expect(text).toMatch(/Base.*%/);
    expect(text).toMatch(/Skills.*%/);
    // Footer hints
    expect(text).toContain("navigate");
    expect(text).toContain("drill-in");
    expect(text).toContain("esc close");
  });

  it("should show the cursor indicator on the first row", () => {
    const lines = harness.capture();
    // ▸ is the selected indicator (may be ANSI-stripped to just the char)
    const cursorLine = lines.find((l) => l.includes("▸"));
    expect(cursorLine).toBeDefined();
  });

  it("should move cursor down and wrap around", () => {
    // Count sections visible (lines with the · or ▸ prefix)
    const before = harness.capture();
    const sectionCount = before.filter(
      (l) => l.includes("▸") || l.includes("·"),
    ).length;

    // Move down to last item
    for (let i = 0; i < sectionCount - 1; i++) {
      harness.sendKeys("Down");
    }

    const atBottom = harness.capture();
    // The last section row should have ▸
    const lastSelected = atBottom.filter((l) => l.includes("▸"));
    expect(lastSelected).toHaveLength(1);

    // Move down one more — should wrap to first
    harness.sendKeys("Down");
    const wrapped = harness.capture();
    const firstSelected = wrapped.filter((l) => l.includes("▸"));
    expect(firstSelected).toHaveLength(1);
  });

  it("should drill into a section with children and return with esc", () => {
    // AGENTS.md files is typically first (most tokens) and drillable
    harness.sendKeys("Enter");
    const drilled = harness.waitFor("esc to go back", 5000);
    const text = drilled.join("\n");

    // Should show AGENTS.md breadcrumb and children
    expect(text).toContain("esc to go back");

    // Esc to go back to sections
    harness.sendKeys("Escape");
    const back = harness.waitFor("drill-in", 5000);
    expect(back.join("\n")).toContain("drill-in");
  });

  it("should close the overlay with esc from sections view", () => {
    harness.sendKeys("Escape");
    // Overlay should close — "Token Burden" title should disappear
    // and we should see the pi prompt
    sleepMs(500);
    const lines = harness.capture();
    const stillOpen = lines.some((l) => l.includes("Token Burden"));
    expect(stillOpen).toBeFalsy();
  });
});

function sleepMs(ms: number): void {
  const { execSync } = require("node:child_process");
  execSync(`sleep ${(ms / 1000).toFixed(3)}`);
}
```

**Step 2: Run the tests**

Run: `pnpm run test:e2e`
Expected: PASS.

**Step 3: Commit**

```bash
git add -A
git commit -m "test: add e2e overlay rendering and navigation tests"
```

---

### Task 4: Skill-toggle mode tests

**TDD scenario:** New e2e tests for the skill-toggle functionality.

**Files:**
- Create: `src/e2e/skill-toggle.test.ts`

This is the most important test file — it exercises the functionality we
built in Phase 2 and validates the bugs we fixed.

**Step 1: Write the skill-toggle test suite**

Create `src/e2e/skill-toggle.test.ts`:

```typescript
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { TmuxHarness } from "./tmux-harness.js";

/**
 * Create an isolated agent directory with a known set of skills.
 * Returns the temp dir path (caller must clean up).
 */
function createTestAgentDir(): string {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "e2e-agent-"));
  const skillsDir = path.join(tmpDir, "skills");

  // Create several test skills
  const skills = [
    { name: "alpha-skill", description: "First test skill" },
    { name: "beta-skill", description: "Second test skill" },
    { name: "gamma-skill", description: "Third test skill" },
    { name: "delta-skill", description: "Fourth test skill" },
    { name: "epsilon-skill", description: "Fifth test skill" },
    { name: "zeta-skill", description: "Sixth test skill" },
  ];

  for (const skill of skills) {
    const dir = path.join(skillsDir, skill.name);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "SKILL.md"),
      `---\nname: ${skill.name}\ndescription: ${skill.description}\n---\n# ${skill.name}\nContent.`,
    );
  }

  // Create empty settings.json
  fs.writeFileSync(path.join(tmpDir, "settings.json"), "{}");

  return tmpDir;
}

describe("skill-toggle mode", () => {
  let harness: TmuxHarness;
  let agentDir: string;

  beforeEach(() => {
    agentDir = createTestAgentDir();
    harness = new TmuxHarness({
      sessionName: "e2e-skill-toggle",
      agentDir,
    });
    harness.start();
    harness.waitFor("feat/skill-toggle", 15_000);

    // Open overlay and navigate to Skills
    harness.sendKeys("/token-burden", "Enter");
    harness.waitFor("Token Burden", 10_000);

    // Find and select Skills section — navigate down until we find it
    for (let i = 0; i < 5; i++) {
      const lines = harness.capture();
      const cursorLine = lines.find((l) => l.includes("▸"));
      if (cursorLine && cursorLine.includes("Skills")) {
        break;
      }
      harness.sendKeys("Down");
    }
    harness.sendKeys("Enter");
    harness.waitFor("esc to go back", 10_000);
  });

  afterEach(() => {
    harness.stop();
    fs.rmSync(agentDir, { recursive: true, force: true });
  });

  it("should enter skill-toggle mode showing skill list with status icons", () => {
    const lines = harness.capture();
    const text = lines.join("\n");

    // Should show skills with status icons
    expect(text).toContain("alpha-skill");
    expect(text).toContain("beta-skill");
    // Should show the legend
    expect(text).toContain("on");
    expect(text).toContain("hidden");
    expect(text).toContain("disabled");
    // Footer should show skill-toggle hints
    expect(text).toContain("cycle state");
    expect(text).toContain("ctrl+s");
  });

  it("should navigate through all skills (P1 regression)", () => {
    // Navigate down through all 6 skills — this was broken before
    // when moveSelection used section count (4) instead of skill count
    for (let i = 0; i < 5; i++) {
      harness.sendKeys("Down");
    }
    const lines = harness.capture();
    const text = lines.join("\n");
    // Should show "6/6" in the scroll indicator, or cursor on zeta-skill
    expect(text).toContain("zeta-skill");
  });

  it("should cycle skill state with enter", () => {
    // First skill starts as enabled (●), cycle to hidden
    harness.sendKeys("Enter");
    const afterFirst = harness.capture().join("\n");
    // Should show pending change indicator
    expect(afterFirst).toContain("pending change");
    expect(afterFirst).toContain("*");
  });

  it("should show and update pending changes count", () => {
    // Toggle first two skills
    harness.sendKeys("Enter"); // toggle alpha
    harness.sendKeys("Down");
    harness.sendKeys("Enter"); // toggle beta

    const lines = harness.capture();
    const text = lines.join("\n");
    expect(text).toContain("2 pending changes");
  });

  it("should save changes with Ctrl+S and persist modes", () => {
    // Toggle alpha-skill: enabled → hidden
    harness.sendKeys("Enter");

    const beforeSave = harness.capture().join("\n");
    expect(beforeSave).toContain("1 pending change");

    // Save
    harness.sendKeys("C-s");
    sleepMs(1000);

    const afterSave = harness.capture().join("\n");
    // Pending changes banner should be gone
    expect(afterSave).not.toContain("pending change");
    // The changed marker (*) should be gone
    // The skill should still show the new state (not snap back)
    // "Skills updated" notification should appear somewhere
    expect(afterSave).toContain("Skills updated");
  });

  it("should persist disable entries to settings.json after save", () => {
    // Toggle alpha-skill twice: enabled → hidden → disabled
    harness.sendKeys("Enter"); // → hidden
    harness.sendKeys("Enter"); // → disabled

    // Save
    harness.sendKeys("C-s");
    sleepMs(1000);

    // Check settings.json
    const settingsPath = path.join(agentDir, "settings.json");
    const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    const hasDisableEntry = (settings.skills ?? []).some(
      (s: string) => typeof s === "string" && s.startsWith("-"),
    );
    expect(hasDisableEntry).toBeTruthy();
  });

  it("should show discard confirmation on esc with pending changes", () => {
    harness.sendKeys("Enter"); // toggle a skill

    harness.sendKeys("Escape");
    const lines = harness.capture();
    expect(lines.join("\n")).toContain("Discard");
    expect(lines.join("\n")).toContain("(y/n)");
  });

  it("should discard changes on y and return to sections", () => {
    harness.sendKeys("Enter"); // toggle a skill
    harness.sendKeys("Escape"); // trigger confirmation
    harness.waitFor("Discard", 3000);

    harness.sendKeys("y");
    const lines = harness.waitFor("drill-in", 5000);
    // Back in sections view
    expect(lines.join("\n")).toContain("drill-in");
  });

  it("should cancel discard on n and stay in skill-toggle", () => {
    harness.sendKeys("Enter"); // toggle a skill
    harness.sendKeys("Escape"); // trigger confirmation
    harness.waitFor("Discard", 3000);

    harness.sendKeys("n");
    const lines = harness.capture();
    const text = lines.join("\n");
    // Should still be in skill-toggle mode with pending changes
    expect(text).toContain("cycle state");
    expect(text).toContain("pending change");
  });

  it("should filter skills with fuzzy search", () => {
    harness.sendKeys("/");
    sleepMs(300);
    harness.sendKeys("'alpha'");
    sleepMs(500);

    const lines = harness.capture();
    const text = lines.join("\n");
    expect(text).toContain("alpha-skill");
    // Other skills should be filtered out
    expect(text).not.toContain("beta-skill");
  });
});

function sleepMs(ms: number): void {
  const { execSync } = require("node:child_process");
  execSync(`sleep ${(ms / 1000).toFixed(3)}`);
}
```

**Note on the fixture approach:** `createTestAgentDir()` creates a temp
directory with 6 known skills and an empty `settings.json`. Setting
`PI_CODING_AGENT_DIR` to this directory isolates the test from the user's
real config. The skills are simple SKILL.md files with frontmatter.

**Important:** The `waitFor("feat/skill-toggle")` in `beforeEach` waits for
the pi startup to show the branch name in the status bar. If running on a
different branch, change the pattern to something always present like
`"pi-token-burden"`.

**Step 2: Run the tests**

Run: `pnpm run test:e2e`
Expected: PASS (may need timeout adjustments).

**Step 3: Commit**

```bash
git add -A
git commit -m "test: add e2e skill-toggle mode tests"
```

---

### Task 5: Integration into check workflow and CI considerations

**TDD scenario:** Infrastructure — no test-first needed.

**Files:**
- Modify: `package.json` (add `check:e2e` script)
- Modify: `AGENTS.md` (update commands table and test count)

**Step 1: Add the check:e2e script**

Add to `"scripts"` in `package.json`:
```json
"check:e2e": "bash scripts/check.sh && pnpm run test:e2e"
```

This runs all fast checks first, then e2e. The regular `check` script stays
fast for pre-commit use.

**Step 2: Update AGENTS.md**

Add to the Commands table:
```
| `pnpm run test:e2e` | Run e2e TUI tests (requires tmux) | ~30s |
```

Update the File Map:
```
| `src/e2e/tmux-harness.ts` | Tmux session helper for e2e TUI testing |
| `src/e2e/*.test.ts`       | E2e TUI tests (overlay, skill-toggle)   |
| `vitest.config.e2e.ts`    | Vitest config for e2e tests (30s timeout)|
```

**Step 3: Run full verification**

Run: `pnpm run check` — unit tests and static checks should still pass.
Run: `pnpm run test:e2e` — e2e tests should pass.

**Step 4: Commit**

```bash
git add -A
git commit -m "chore: add e2e test scripts and update docs"
```

---

## Updated File Map

| Path | Purpose |
|------|---------|
| `src/e2e/tmux-harness.ts` | TmuxHarness class — manages tmux session lifecycle |
| `src/e2e/tmux-harness.test.ts` | Basic harness smoke test |
| `src/e2e/overlay.test.ts` | Overlay rendering, navigation, drill-down tests |
| `src/e2e/skill-toggle.test.ts` | Skill-toggle mode: cycling, save, discard, search |
| `vitest.config.e2e.ts` | Vitest config for e2e (30s timeout, src/e2e/ include) |

## Risks and Mitigations

| Risk | Mitigation |
|------|-----------|
| Flaky timing (pi startup, render delays) | `waitFor()` polls with timeout instead of fixed sleeps |
| tmux not available in CI | E2e tests are opt-in (`test:e2e`), not in the default `check` script |
| Tests mutate user settings | `PI_CODING_AGENT_DIR` points to temp dir; cleanup in `afterEach` |
| Stale tmux sessions from crashed tests | `afterEach` always calls `harness.stop()`; harness `start()` kills pre-existing sessions |
| Search test sends literal chars to tmux | Shell-escape helper distinguishes tmux key names from text input |
