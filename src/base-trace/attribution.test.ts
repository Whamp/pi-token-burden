import { attributeBasePrompt, normalizeSnippet } from "./attribution.js";
import type { ExtensionToolContribution } from "./types.js";

describe("normalizeSnippet()", () => {
  it("collapses internal whitespace to single spaces", () => {
    expect(normalizeSnippet("Search  the   web")).toBe("Search the web");
  });

  it("collapses newlines to spaces", () => {
    expect(normalizeSnippet("Search\nthe\nweb")).toBe("Search the web");
  });

  it("trims leading and trailing whitespace", () => {
    expect(normalizeSnippet("  hello  ")).toBe("hello");
  });

  it("returns empty string for whitespace-only input", () => {
    expect(normalizeSnippet("   \n  ")).toBe("");
  });
});

describe("attributeBasePrompt()", () => {
  const builtInToolLines = [
    "- read: Read file contents",
    "- bash: Execute bash commands",
  ];

  const builtInGuidelineLines = [
    "- Be concise in your responses",
    "- Show file paths clearly when working with files",
  ];

  it("attributes a tool line to a single extension", () => {
    const contributions: ExtensionToolContribution[] = [
      {
        toolName: "web_search",
        snippet: "Search the web",
        guidelines: [],
        extensionPath: "/home/user/.pi/extensions/web-access/index.ts",
      },
    ];

    const toolLines = [...builtInToolLines, "- web_search: Search the web"];

    const result = attributeBasePrompt(
      toolLines,
      builtInGuidelineLines,
      contributions,
      100
    );

    const extBucket = result.buckets.find((b) => b.id.includes("web-access"));
    expect(extBucket).toBeDefined();
    expect(extBucket?.lineCount).toBe(1);

    const evidence = result.evidence.find((e) => e.line.includes("web_search"));
    expect(evidence?.bucket).toBe("extension");
    expect(evidence?.contributors).toContain(
      "/home/user/.pi/extensions/web-access/index.ts"
    );
  });

  it("attributes built-in tool lines to the built-in bucket", () => {
    const result = attributeBasePrompt(
      builtInToolLines,
      builtInGuidelineLines,
      [],
      100
    );

    const builtIn = result.buckets.find((b) => b.id === "built-in");
    expect(builtIn).toBeDefined();
    expect(builtIn?.lineCount).toBe(
      builtInToolLines.length + builtInGuidelineLines.length
    );
  });

  it("attributes guideline lines from extensions", () => {
    const contributions: ExtensionToolContribution[] = [
      {
        toolName: "web_search",
        snippet: "Search the web",
        guidelines: ["Always verify search results"],
        extensionPath: "/ext/web.ts",
      },
    ];

    const guidelineLines = [
      ...builtInGuidelineLines,
      "- Always verify search results",
    ];

    const result = attributeBasePrompt(
      builtInToolLines,
      guidelineLines,
      contributions,
      100
    );

    const evidence = result.evidence.find((e) =>
      e.line.includes("verify search")
    );
    expect(evidence?.bucket).toBe("extension");
    expect(evidence?.kind).toBe("guideline-line");
    expect(evidence?.contributors).toContain("/ext/web.ts");
  });

  it("puts duplicate guidelines from multiple extensions into shared bucket", () => {
    const contributions: ExtensionToolContribution[] = [
      {
        toolName: "tool_a",
        snippet: "Tool A",
        guidelines: ["Use carefully"],
        extensionPath: "/ext/a.ts",
      },
      {
        toolName: "tool_b",
        snippet: "Tool B",
        guidelines: ["Use carefully"],
        extensionPath: "/ext/b.ts",
      },
    ];

    const guidelineLines = [...builtInGuidelineLines, "- Use carefully"];

    const result = attributeBasePrompt(
      builtInToolLines,
      guidelineLines,
      contributions,
      100
    );

    const evidence = result.evidence.find((e) =>
      e.line.includes("Use carefully")
    );
    expect(evidence?.bucket).toBe("shared");
    expect(evidence?.contributors).toContain("/ext/a.ts");
    expect(evidence?.contributors).toContain("/ext/b.ts");
  });

  it("puts unmatched lines into unattributed bucket", () => {
    const toolLines = [
      ...builtInToolLines,
      "- mystery_tool: Does something unknown",
    ];

    const result = attributeBasePrompt(
      toolLines,
      builtInGuidelineLines,
      [],
      100
    );

    const evidence = result.evidence.find((e) =>
      e.line.includes("mystery_tool")
    );
    expect(evidence?.bucket).toBe("unattributed");
  });

  it("reconciles: sum of bucket tokens equals total evidence tokens", () => {
    const contributions: ExtensionToolContribution[] = [
      {
        toolName: "web_search",
        snippet: "Search the web",
        guidelines: ["Verify results"],
        extensionPath: "/ext/web.ts",
      },
    ];

    const toolLines = [
      ...builtInToolLines,
      "- web_search: Search the web",
      "- unknown: Something else",
    ];

    const guidelineLines = [
      ...builtInGuidelineLines,
      "- Verify results",
      "- Random unattributed guideline",
    ];

    const result = attributeBasePrompt(
      toolLines,
      guidelineLines,
      contributions,
      500
    );

    const bucketSum = result.buckets.reduce((sum, b) => sum + b.tokens, 0);
    const evidenceSum = result.evidence.reduce((sum, e) => sum + e.tokens, 0);
    expect(bucketSum).toBe(evidenceSum);
  });

  it("computes pctOfBase relative to baseTokens parameter", () => {
    const result = attributeBasePrompt(
      builtInToolLines,
      builtInGuidelineLines,
      [],
      1000
    );

    for (const bucket of result.buckets) {
      const expectedPct = (bucket.tokens / 1000) * 100;
      expect(bucket.pctOfBase).toBeCloseTo(expectedPct, 1);
    }
  });

  it("handles empty inputs without crashing", () => {
    const result = attributeBasePrompt([], [], [], 0);

    expect(result.buckets).toStrictEqual([]);
    expect(result.evidence).toStrictEqual([]);
  });
});
