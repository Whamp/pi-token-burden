import { execSync } from "node:child_process";

import { TmuxHarness } from "./tmux-harness.js";

function sleepMs(ms: number): void {
  execSync(`sleep ${(ms / 1000).toFixed(3)}`);
}

/**
 * Navigate the cursor to a row whose label contains the given text.
 */
function navigateTo(harness: TmuxHarness, label: string): void {
  for (let i = 0; i < 8; i++) {
    const lines = harness.capture();
    const cursorLine = lines.find((l) => l.includes("▸"));
    if (cursorLine?.includes(label)) {
      return;
    }
    harness.sendKeys("Down");
  }
}

describe("trace mode", () => {
  let harness: TmuxHarness;

  beforeEach(() => {
    harness = new TmuxHarness({ sessionName: "e2e-trace" });
    harness.start();
    harness.waitFor("pi-token-burden", 15_000);

    // Open overlay
    harness.sendKeys("/token-burden", "Enter");
    harness.waitFor("Token Burden", 10_000);
  });

  afterEach(() => {
    harness.stop();
  });

  it("should show 't trace' hint when Base prompt is selected", () => {
    navigateTo(harness, "Base");

    const text = harness.capture().join("\n");
    expect(text).toContain("trace");
  });

  it("should not show 't trace' hint on non-Base sections", () => {
    navigateTo(harness, "Skills");

    const text = harness.capture().join("\n");
    const footer = text.split("\n").filter((l) => l.includes("navigate"));
    // The footer should NOT include "trace" when not on Base
    const hasTrace = footer.some((l) => l.includes("trace"));
    expect(hasTrace).toBeFalsy();
  });

  it("should enter trace view on 't' and show built-in bucket", () => {
    navigateTo(harness, "Base");
    harness.sendKeys("t");

    // Wait for trace to complete
    const lines = harness.waitFor("Trace complete", 15_000);
    const text = lines.join("\n");

    // Should show the trace view
    expect(text).toContain("Base prompt");
    expect(text).toContain("Trace complete");
    // Base prompt is entirely built-in content from pi-core
    expect(text).toContain("Built-in");
    // Footer should have trace-mode hints
    expect(text).toContain("details");
    expect(text).toContain("refresh");
    expect(text).toContain("esc");
  });

  it("should show line count and token count in trace buckets", () => {
    navigateTo(harness, "Base");
    harness.sendKeys("t");

    const lines = harness.waitFor("Trace complete", 15_000);
    const text = lines.join("\n");

    // Should show line and token counts
    expect(text).toContain("line");
    expect(text).toContain("token");
  });

  it("should drill into bucket details on enter", () => {
    navigateTo(harness, "Base");
    harness.sendKeys("t");
    harness.waitFor("Trace complete", 15_000);

    // Drill into the first bucket (should be Built-in)
    harness.sendKeys("Enter");
    sleepMs(500);

    const lines = harness.capture();
    const text = lines.join("\n");

    // Should show individual evidence lines
    expect(text).toContain("tok");
    // Should have back navigation
    expect(text).toContain("esc");
  });

  it("should return to trace view on esc from drilldown", () => {
    navigateTo(harness, "Base");
    harness.sendKeys("t");
    harness.waitFor("Trace complete", 15_000);

    // Drill in
    harness.sendKeys("Enter");
    sleepMs(500);

    // Go back
    harness.sendKeys("Escape");
    sleepMs(500);

    const text = harness.capture().join("\n");
    expect(text).toContain("Trace complete");
    expect(text).toContain("details");
  });

  it("should return to sections view on esc from trace view", () => {
    navigateTo(harness, "Base");
    harness.sendKeys("t");
    harness.waitFor("Trace complete", 15_000);

    harness.sendKeys("Escape");
    sleepMs(500);

    const text = harness.capture().join("\n");
    expect(text).toContain("drill-in");
    expect(text).not.toContain("Trace complete");
  });

  it("should refresh trace on 'r'", () => {
    navigateTo(harness, "Base");
    harness.sendKeys("t");
    harness.waitFor("Trace complete", 15_000);

    // Press r to refresh
    harness.sendKeys("r");

    // Should show loading then complete again
    const lines = harness.waitFor("Trace complete", 15_000);
    expect(lines.join("\n")).toContain("Trace complete");
  });
});
