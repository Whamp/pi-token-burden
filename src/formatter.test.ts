import { formatReport } from "./formatter.js";
import type { ParsedPrompt } from "./types.js";

describe(formatReport, () => {
  const parsed: ParsedPrompt = {
    totalChars: 10_000,
    totalTokens: 2500,
    skills: [],
    sections: [
      { label: "Base prompt", chars: 2000, tokens: 500 },
      {
        label: "AGENTS.md files",
        chars: 4000,
        tokens: 1000,
        children: [
          { label: "/home/user/.pi/agent/AGENTS.md", chars: 1500, tokens: 375 },
          { label: "/home/user/project/AGENTS.md", chars: 2500, tokens: 625 },
        ],
      },
      {
        label: "Skills (2)",
        chars: 3600,
        tokens: 900,
        children: [
          { label: "brainstorming", chars: 1800, tokens: 450 },
          { label: "tdd", chars: 1800, tokens: 450 },
        ],
      },
      { label: "Metadata (date/time, cwd)", chars: 400, tokens: 100 },
    ],
  };

  it("returns a header line with totals", () => {
    const lines = formatReport(parsed);
    const header = lines.find((l) => l.kind === "header");
    expect(header).toBeDefined();
    expect(header?.text).toContain("2,500");
  });

  it("returns one line per top-level section", () => {
    const lines = formatReport(parsed);
    const sectionLines = lines.filter((l) => l.kind === "section");
    expect(sectionLines).toHaveLength(4);
  });

  it("returns child lines for sections with children", () => {
    const lines = formatReport(parsed);
    const childLines = lines.filter((l) => l.kind === "child");
    expect(childLines).toHaveLength(4);
  });

  it("includes a percentage on each section line", () => {
    const lines = formatReport(parsed);
    const sectionLines = lines.filter((l) => l.kind === "section");
    for (const line of sectionLines) {
      expect(line.text).toMatch(/\d+\.\d%/);
    }
  });

  it("includes a context window percentage when provided", () => {
    const lines = formatReport(parsed, 200_000);
    const header = lines.find((l) => l.kind === "header");
    expect(header?.text).toContain("200,000");
  });
});
