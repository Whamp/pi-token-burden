import { estimateTokens, parseSystemPrompt } from "./parser.js";
import type { ParsedPrompt } from "./parser.js";

describe("estimateTokens()", () => {
  it("returns 0 for empty string", () => {
    expect(estimateTokens("")).toBe(0);
  });

  it("returns real BPE token count for English text", () => {
    // "Read files before editing." is 5 tokens in o200k_base, but ceil(26/4) = 7
    const tokens = estimateTokens("Read files before editing.");
    expect(tokens).toBe(5);
  });

  it("returns real BPE token count for code", () => {
    const code = "const x = 42;\nconsole.log(x);";
    const tokens = estimateTokens(code);
    expect(tokens).toBe(10);
  });
});

describe("parseSystemPrompt()", () => {
  const basePrompt = [
    "You are an expert coding assistant operating inside pi.",
    "",
    "Available tools:",
    "- read: Read file contents",
    "- bash: Execute bash commands",
    "",
    "Guidelines:",
    "- Be concise",
    "",
    "Pi documentation (read only when the user asks about pi itself):",
    "- Main documentation: /path/to/README.md",
    "- Always read pi .md files completely and follow links to related docs",
  ].join("\n");

  const agentsBlock = [
    "",
    "",
    "# Project Context",
    "",
    "Project-specific instructions and guidelines:",
    "",
    "## /home/user/.pi/agent/AGENTS.md",
    "",
    "# Global Agent Guidelines",
    "",
    "## Before Acting",
    "- Read files before editing.",
    "",
    "## /home/user/project/AGENTS.md",
    "",
    "# Project Rules",
    "",
    "- Follow TDD.",
  ].join("\n");

  const skillsPreamble = [
    "",
    "",
    "The following skills provide specialized instructions for specific tasks.",
    "Use the read tool to load a skill's file when the task matches its description.",
    "When a skill file references a relative path, resolve it against the skill directory.",
    "",
  ].join("\n");

  const skillsBlock = [
    "<available_skills>",
    "  <skill>",
    "    <name>brainstorming</name>",
    "    <description>Explore user intent before implementation.</description>",
    "    <location>/home/user/skills/brainstorming/SKILL.md</location>",
    "  </skill>",
    "  <skill>",
    "    <name>tdd</name>",
    "    <description>Test-driven development workflow.</description>",
    "    <location>/home/user/skills/tdd/SKILL.md</location>",
    "  </skill>",
    "</available_skills>",
  ].join("\n");

  const metadata =
    "\nCurrent date and time: Thursday, February 26, 2026\nCurrent working directory: /home/user/project";

  it("parses a full system prompt into sections", () => {
    const prompt =
      basePrompt + agentsBlock + skillsPreamble + skillsBlock + metadata;
    const result: ParsedPrompt = parseSystemPrompt(prompt);

    expect(result.totalChars).toBe(prompt.length);
    expect(result.totalTokens).toBe(Math.ceil(prompt.length / 4));

    const labels = result.sections.map((s) => s.label);
    expect(labels).toContain("Base prompt");
    expect(labels).toContain("AGENTS.md files");
  });

  it("parses a full system prompt with correct section labels", () => {
    const prompt =
      basePrompt + agentsBlock + skillsPreamble + skillsBlock + metadata;
    const result = parseSystemPrompt(prompt);

    const labels = result.sections.map((s) => s.label);
    expect(labels).toContain("Skills (2)");
    expect(labels).toContain("Metadata (date/time, cwd)");
  });

  it("parses AGENTS.md files into children", () => {
    const prompt = basePrompt + agentsBlock + metadata;
    const result = parseSystemPrompt(prompt);

    const agentsSection = result.sections.find((s) =>
      s.label.includes("AGENTS.md")
    );
    expect(agentsSection?.children).toHaveLength(2);
    expect(agentsSection?.children?.[0].label).toBe(
      "/home/user/.pi/agent/AGENTS.md"
    );
    expect(agentsSection?.children?.[1].label).toBe(
      "/home/user/project/AGENTS.md"
    );
  });

  it("parses individual skills from XML", () => {
    const prompt = basePrompt + skillsPreamble + skillsBlock + metadata;
    const result = parseSystemPrompt(prompt);

    expect(result.skills).toHaveLength(2);
    expect(result.skills[0].name).toBe("brainstorming");
    expect(result.skills[1].name).toBe("tdd");
    expect(result.skills[0].chars).toBeGreaterThan(0);
  });

  it("includes skill children in skills section", () => {
    const prompt = basePrompt + skillsPreamble + skillsBlock + metadata;
    const result = parseSystemPrompt(prompt);

    const skillsSection = result.sections.find((s) =>
      s.label.startsWith("Skills")
    );
    expect(skillsSection?.children).toHaveLength(2);
  });

  it("handles a minimal prompt with no optional sections", () => {
    const prompt = `You are a helpful assistant.${metadata}`;
    const result = parseSystemPrompt(prompt);

    expect(result.sections.length).toBeGreaterThanOrEqual(1);
    expect(result.totalChars).toBe(prompt.length);
  });

  it("detects SYSTEM.md / APPEND_SYSTEM.md content between base and project context", () => {
    const appendContent =
      "\n\nCustom SYSTEM.md instructions here.\nMore custom content.";
    const prompt = basePrompt + appendContent + agentsBlock + metadata;
    const result = parseSystemPrompt(prompt);

    const systemMdSection = result.sections.find((s) =>
      s.label.includes("SYSTEM.md")
    );
    expect(systemMdSection).toBeDefined();
    expect(systemMdSection?.chars).toBeGreaterThan(0);
  });
});
