import { extractBaseLines } from "./base-lines.js";

describe("extractBaseLines()", () => {
  it("extracts tool lines from Available tools section", () => {
    const base = [
      "You are an expert coding assistant.",
      "",
      "Available tools:",
      "- read: Read file contents",
      "- bash: Execute bash commands",
      "",
      "Guidelines:",
      "- Be concise",
    ].join("\n");

    const result = extractBaseLines(base);

    expect(result.toolLines).toStrictEqual([
      "- read: Read file contents",
      "- bash: Execute bash commands",
    ]);
  });

  it("extracts guideline lines from Guidelines section", () => {
    const base = [
      "Available tools:",
      "- read: Read file contents",
      "",
      "Guidelines:",
      "- Be concise",
      "- Show file paths clearly",
      "",
      "Pi documentation:",
    ].join("\n");

    const result = extractBaseLines(base);

    expect(result.guidelineLines).toStrictEqual([
      "- Be concise",
      "- Show file paths clearly",
    ]);
  });

  it("returns empty arrays when sections are missing", () => {
    const base = "You are an expert coding assistant.";
    const result = extractBaseLines(base);

    expect(result.toolLines).toStrictEqual([]);
    expect(result.guidelineLines).toStrictEqual([]);
  });

  it("handles tool lines with multi-word snippets", () => {
    const base = [
      "Available tools:",
      "- web_search: Search the web using Perplexity AI or Gemini",
      "- fetch_content: Fetch URL(s) and extract readable content as markdown",
      "",
      "In addition to the tools above",
    ].join("\n");

    const result = extractBaseLines(base);

    expect(result.toolLines).toHaveLength(2);
    expect(result.toolLines[0]).toBe(
      "- web_search: Search the web using Perplexity AI or Gemini"
    );
  });

  it("stops tool lines at 'In addition to the tools above'", () => {
    const base = [
      "Available tools:",
      "- read: Read file contents",
      "",
      "In addition to the tools above, you may have access to other custom tools.",
      "",
      "Guidelines:",
      "- Be concise",
    ].join("\n");

    const result = extractBaseLines(base);

    expect(result.toolLines).toStrictEqual(["- read: Read file contents"]);
  });

  it("stops guideline lines at Pi documentation section", () => {
    const base = [
      "Guidelines:",
      "- Be concise",
      "- Show file paths",
      "",
      "Pi documentation (read only when the user asks about pi):",
      "- Main documentation: /path/to/README.md",
    ].join("\n");

    const result = extractBaseLines(base);

    expect(result.guidelineLines).toStrictEqual([
      "- Be concise",
      "- Show file paths",
    ]);
  });
});
