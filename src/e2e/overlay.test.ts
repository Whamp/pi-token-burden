import { execSync } from "node:child_process";

import { TmuxHarness } from "./tmux-harness.js";

function sleepMs(ms: number): void {
  execSync(`sleep ${(ms / 1000).toFixed(3)}`);
}

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
    // Stacked bar legend
    expect(text).toMatch(/Base.*%/);
    expect(text).toMatch(/Skills.*%/);
    // Footer hints
    expect(text).toContain("navigate");
    expect(text).toContain("drill-in");
    expect(text).toContain("esc close");
  });

  it("should show the cursor indicator on the first row", () => {
    const lines = harness.capture();
    const cursorLines = lines.filter((l) => l.includes("▸"));
    expect(cursorLines).toHaveLength(1);
  });

  it("should move cursor down and wrap around", () => {
    const before = harness.capture();
    const sectionCount = before.filter(
      (l) => l.includes("▸") || l.includes("·")
    ).length;

    // Move down to last item
    for (let i = 0; i < sectionCount - 1; i++) {
      harness.sendKeys("Down");
    }

    const atBottom = harness.capture();
    const cursorAtBottom = atBottom.filter((l) => l.includes("▸"));
    expect(cursorAtBottom).toHaveLength(1);

    // Move down one more — should wrap to first
    harness.sendKeys("Down");
    const wrapped = harness.capture();
    const cursorWrapped = wrapped.filter((l) => l.includes("▸"));
    expect(cursorWrapped).toHaveLength(1);
  });

  it("should drill into a section with children and return with esc", () => {
    // First section (AGENTS.md files) is drillable
    harness.sendKeys("Enter");
    const drilled = harness.waitFor("esc to go back", 5000);
    const text = drilled.join("\n");

    expect(text).toContain("esc to go back");
    // Should show AGENTS.md children
    expect(text).toContain("AGENTS.md");

    // Esc to go back to sections
    harness.sendKeys("Escape");
    const back = harness.waitFor("drill-in", 5000);
    expect(back.join("\n")).toContain("drill-in");
  });

  it("should close the overlay with esc from sections view", () => {
    harness.sendKeys("Escape");
    sleepMs(500);
    const lines = harness.capture();
    const stillOpen = lines.some((l) => l.includes("Token Burden"));
    expect(stillOpen).toBeFalsy();
  });
});

describe("overlay — open in editor", () => {
  let harness: TmuxHarness;

  beforeEach(() => {
    harness = new TmuxHarness({
      sessionName: "e2e-overlay-edit",
      env: { VISUAL: "", EDITOR: "true" },
    });
    harness.start();
    harness.waitFor("pi-token-burden", 15_000);
    harness.sendKeys("/token-burden", "Enter");
    harness.waitFor("Token Burden", 10_000);
  });

  afterEach(() => {
    harness.stop();
  });

  it("should show 'e edit' hint when drilled into AGENTS.md files", () => {
    // Navigate to AGENTS.md section and drill in
    for (let i = 0; i < 5; i++) {
      const lines = harness.capture();
      const cursorLine = lines.find((l) => l.includes("▸"));
      if (cursorLine?.includes("AGENTS")) {
        break;
      }
      harness.sendKeys("Down");
    }
    harness.sendKeys("Enter");
    harness.waitFor("esc to go back", 5000);

    const text = harness.capture().join("\n");
    expect(text).toContain("edit");
    expect(text).toContain("AGENTS");
  });

  it("should open editor and recover overlay on 'e' in AGENTS drilldown", () => {
    // Navigate to AGENTS.md section and drill in
    for (let i = 0; i < 5; i++) {
      const lines = harness.capture();
      const cursorLine = lines.find((l) => l.includes("▸"));
      if (cursorLine?.includes("AGENTS")) {
        break;
      }
      harness.sendKeys("Down");
    }
    harness.sendKeys("Enter");
    harness.waitFor("esc to go back", 5000);

    // Press e — fake editor exits immediately
    harness.sendKeys("e");
    sleepMs(1500);

    // Overlay should recover
    const afterLines = harness.waitFor("Token Burden", 10_000);
    const afterText = afterLines.join("\n");
    expect(afterText).toContain("AGENTS");
    expect(afterText).toContain("esc to go back");
  });
});
