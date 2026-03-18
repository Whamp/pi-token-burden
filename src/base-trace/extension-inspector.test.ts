import { extractContributions } from "./extension-inspector.js";

// We test with mock data that mirrors the shape of loaded Extension objects
// from pi's loader. No actual extension loading in unit tests.

function makeExtension(
  path: string,
  tools: { name: string; snippet?: string; guidelines?: string[] }[]
) {
  const toolsMap = new Map<
    string,
    {
      definition: { promptSnippet?: string; promptGuidelines?: string[] };
      extensionPath: string;
    }
  >();
  for (const t of tools) {
    toolsMap.set(t.name, {
      definition: {
        promptSnippet: t.snippet,
        promptGuidelines: t.guidelines,
      },
      extensionPath: path,
    });
  }
  return {
    path,
    resolvedPath: path,
    tools: toolsMap,
    handlers: new Map(),
    commands: new Map(),
    flags: new Map(),
    shortcuts: new Map(),
    messageRenderers: new Map(),
  };
}

describe("extractContributions()", () => {
  it("extracts tool snippet and guidelines from a single extension", () => {
    const ext = makeExtension("/ext/web.ts", [
      {
        name: "web_search",
        snippet: "Search the web",
        guidelines: ["Verify results before citing"],
      },
    ]);

    const result = extractContributions([ext]);

    expect(result).toHaveLength(1);
    expect(result[0].toolName).toBe("web_search");
    expect(result[0].snippet).toBe("Search the web");
    expect(result[0].guidelines).toStrictEqual([
      "Verify results before citing",
    ]);
    expect(result[0].extensionPath).toBe("/ext/web.ts");
  });

  it("extracts multiple tools from one extension", () => {
    const ext = makeExtension("/ext/multi.ts", [
      { name: "tool_a", snippet: "Tool A" },
      { name: "tool_b", snippet: "Tool B", guidelines: ["Be careful"] },
    ]);

    const result = extractContributions([ext]);

    expect(result).toHaveLength(2);
    expect(result.map((c) => c.toolName)).toStrictEqual(["tool_a", "tool_b"]);
  });

  it("extracts contributions from multiple extensions", () => {
    const ext1 = makeExtension("/ext/a.ts", [
      { name: "tool_a", snippet: "Snippet A" },
    ]);
    const ext2 = makeExtension("/ext/b.ts", [
      { name: "tool_b", snippet: "Snippet B" },
    ]);

    const result = extractContributions([ext1, ext2]);

    expect(result).toHaveLength(2);
    expect(result[0].extensionPath).toBe("/ext/a.ts");
    expect(result[1].extensionPath).toBe("/ext/b.ts");
  });

  it("skips tools without promptSnippet", () => {
    const ext = makeExtension("/ext/no-snippet.ts", [{ name: "hidden_tool" }]);

    const result = extractContributions([ext]);

    expect(result).toHaveLength(1);
    expect(result[0].snippet).toBeUndefined();
  });

  it("returns empty guidelines array when tool has none", () => {
    const ext = makeExtension("/ext/no-guidelines.ts", [
      { name: "simple_tool", snippet: "Simple" },
    ]);

    const result = extractContributions([ext]);

    expect(result[0].guidelines).toStrictEqual([]);
  });

  it("returns empty array for no extensions", () => {
    expect(extractContributions([])).toStrictEqual([]);
  });
});
