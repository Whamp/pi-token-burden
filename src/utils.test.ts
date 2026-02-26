import { buildBarSegments, fuzzyFilter } from "./utils.js";

describe("fuzzyFilter()", () => {
  const items = [
    { label: "omarchy", tokens: 194 },
    { label: "agent-browser", tokens: 181 },
    { label: "visual-explainer", tokens: 145 },
    { label: "librarian", tokens: 148 },
    { label: "variant-analysis", tokens: 132 },
    { label: "writing-skills", tokens: 64 },
  ];

  it("returns all items when query is empty", () => {
    const result = fuzzyFilter(items, "");
    expect(result).toHaveLength(items.length);
  });

  it("filters by exact substring match", () => {
    const result = fuzzyFilter(items, "browser");
    expect(result).toHaveLength(1);
    expect(result[0].label).toBe("agent-browser");
  });

  it("filters by fuzzy match across characters", () => {
    const result = fuzzyFilter(items, "vex");
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0].label).toBe("visual-explainer");
  });

  it("returns empty array when nothing matches", () => {
    const result = fuzzyFilter(items, "zzzzz");
    expect(result).toHaveLength(0);
  });

  it("is case-insensitive", () => {
    const result = fuzzyFilter(items, "LIBRARIAN");
    expect(result).toHaveLength(1);
    expect(result[0].label).toBe("librarian");
  });

  it("ranks exact substring higher than fuzzy match", () => {
    const result = fuzzyFilter(items, "var");
    expect(result[0].label).toBe("variant-analysis");
  });
});

describe("buildBarSegments()", () => {
  it("distributes width proportionally", () => {
    const sections = [
      { label: "A", tokens: 50 },
      { label: "B", tokens: 50 },
    ];
    const segments = buildBarSegments(sections, 40);
    expect(segments.reduce((sum, s) => sum + s.width, 0)).toBe(40);
    expect(segments[0].width).toBe(20);
    expect(segments[1].width).toBe(20);
  });

  it("enforces minimum 1 character per segment", () => {
    const sections = [
      { label: "Big", tokens: 9900 },
      { label: "Tiny", tokens: 1 },
    ];
    const segments = buildBarSegments(sections, 40);
    expect(
      segments.find((s) => s.label === "Tiny")?.width
    ).toBeGreaterThanOrEqual(1);
    expect(segments.reduce((sum, s) => sum + s.width, 0)).toBe(40);
  });

  it("steals from largest segment when enforcing minimums", () => {
    const sections = [
      { label: "Big", tokens: 10_000 },
      { label: "Tiny1", tokens: 1 },
      { label: "Tiny2", tokens: 1 },
    ];
    const segments = buildBarSegments(sections, 10);
    const big = segments.find((s) => s.label === "Big");
    // Big would naturally get ~10 but loses 2 to the tiny segments
    expect(big?.width).toBe(8);
    expect(segments.reduce((sum, s) => sum + s.width, 0)).toBe(10);
  });

  it("handles single section", () => {
    const sections = [{ label: "Only", tokens: 100 }];
    const segments = buildBarSegments(sections, 50);
    expect(segments).toHaveLength(1);
    expect(segments[0].width).toBe(50);
  });

  it("handles zero total tokens", () => {
    const sections = [
      { label: "A", tokens: 0 },
      { label: "B", tokens: 0 },
    ];
    const segments = buildBarSegments(sections, 20);
    expect(segments.reduce((sum, s) => sum + s.width, 0)).toBe(20);
  });
});
