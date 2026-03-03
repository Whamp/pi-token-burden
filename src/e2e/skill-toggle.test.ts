import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { TmuxHarness } from "./tmux-harness.js";

function sleepMs(ms: number): void {
  execSync(`sleep ${(ms / 1000).toFixed(3)}`);
}

/**
 * Create an isolated agent directory with an empty settings.json.
 * Skills are still discovered from the system's default directories
 * (~/.pi/agent/skills, ~/.agents/skills), but settings changes are
 * written to the temp directory — keeping the real config safe.
 */
function createIsolatedAgentDir(): string {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "e2e-agent-"));
  fs.writeFileSync(path.join(tmpDir, "settings.json"), "{}");
  return tmpDir;
}

/**
 * Navigate to the Skills section and enter skill-toggle mode.
 * Searches downward through sections to find "Skills" regardless of sort order.
 */
function navigateToSkillToggle(harness: TmuxHarness): void {
  for (let i = 0; i < 5; i++) {
    const lines = harness.capture();
    const cursorLine = lines.find((l) => l.includes("▸"));
    if (cursorLine?.includes("Skills")) {
      break;
    }
    harness.sendKeys("Down");
  }
  harness.sendKeys("Enter");
  harness.waitFor("esc to go back", 10_000);
}

describe("skill-toggle mode", () => {
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

  afterEach(() => {
    harness.stop();
    fs.rmSync(agentDir, { recursive: true, force: true });
  });

  it("should enter skill-toggle mode showing skill list with status icons", () => {
    const text = harness.capture().join("\n");

    // Should show the legend
    expect(text).toContain("on");
    expect(text).toContain("hidden");
    expect(text).toContain("disabled");
    // Footer should show skill-toggle hints
    expect(text).toContain("cycle state");
    expect(text).toContain("ctrl+s");
  });

  it("should navigate past 8 visible rows (P1 regression)", () => {
    // Navigate down through many skills — this was broken before
    // when moveSelection used section count instead of skill count
    for (let i = 0; i < 9; i++) {
      harness.sendKeys("Down");
    }
    const text = harness.capture().join("\n");
    // Should show 10/N in the scroll indicator (scrolled past 8 visible)
    expect(text).toMatch(/10\/\d+/);
  });

  it("should cycle skill state with enter", () => {
    harness.sendKeys("Enter");
    const text = harness.capture().join("\n");
    expect(text).toContain("pending change");
    expect(text).toContain("*");
  });

  it("should show and update pending changes count", () => {
    harness.sendKeys("Enter");
    harness.sendKeys("Down");
    harness.sendKeys("Enter");

    const text = harness.capture().join("\n");
    expect(text).toContain("2 pending changes");
  });

  it("should save changes with ctrl+s", () => {
    harness.sendKeys("Enter");

    const beforeSave = harness.capture().join("\n");
    expect(beforeSave).toContain("1 pending change");

    harness.sendKeys("C-s");
    sleepMs(1000);

    const afterSave = harness.capture().join("\n");
    expect(afterSave).not.toContain("pending change");
    expect(afterSave).toContain("Skills updated");
  });

  it("should show discard confirmation on esc with pending changes", () => {
    harness.sendKeys("Enter");
    harness.sendKeys("Escape");

    const text = harness.capture().join("\n");
    expect(text).toContain("Discard");
    expect(text).toContain("(y/n)");
  });

  it("should discard changes on y and return to sections", () => {
    harness.sendKeys("Enter");
    harness.sendKeys("Escape");
    harness.waitFor("Discard", 3000);

    harness.sendKeys("y");
    const lines = harness.waitFor("drill-in", 5000);
    expect(lines.join("\n")).toContain("drill-in");
  });

  it("should cancel discard on n and stay in skill-toggle", () => {
    harness.sendKeys("Enter");
    harness.sendKeys("Escape");
    harness.waitFor("Discard", 3000);

    harness.sendKeys("n");
    const text = harness.capture().join("\n");
    expect(text).toContain("cycle state");
    expect(text).toContain("pending change");
  });

  it("should filter skills with fuzzy search", () => {
    // Get the first skill name to search for
    const initialLines = harness.capture();
    const firstSkillLine = initialLines.find((l) => l.includes("▸"));
    // Extract skill name from the cursor line
    const nameMatch = firstSkillLine?.match(/[●◐○]\s+(\S+)/);
    const skillName = nameMatch?.[1] ?? "";
    expect(skillName.length).toBeGreaterThan(0);

    harness.sendKeys("/");
    sleepMs(300);
    harness.sendKeys(skillName);
    sleepMs(500);

    const text = harness.capture().join("\n");
    expect(text).toContain(skillName);
  });
});
