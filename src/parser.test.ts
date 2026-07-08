import { ToolEnvelope } from "./enums.js";
import {
  estimateTokens,
  parseSystemPrompt,
  buildToolDefinitionsSection,
  toolEnvelopeForModel,
  toolEnvelopeForProvider,
} from "./parser.js";
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

  const currentProjectContextBlock = [
    "",
    "",
    "<project_context>",
    "",
    "Project-specific instructions and guidelines:",
    "",
    '<project_instructions path="/home/user/.pi/agent/AGENTS.md">',
    "# Global Agent Guidelines",
    "",
    "## Before Acting",
    "- Read files before editing.",
    "</project_instructions>",
    "",
    '<project_instructions path="/home/user/project/AGENTS.md">',
    "# Project Rules",
    "",
    "- Follow TDD.",
    "</project_instructions>",
    "",
    "</project_context>",
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
  const currentMetadata =
    "\nCurrent date: 2026-05-15\nCurrent working directory: /home/user/project";

  function sectionTokenSum(result: ParsedPrompt): number {
    return result.sections.reduce((sum, section) => sum + section.tokens, 0);
  }

  function childTokenSum(section?: {
    children?: { tokens: number }[];
  }): number {
    return (
      section?.children?.reduce((sum, child) => sum + child.tokens, 0) ?? 0
    );
  }

  function pathChildLabels(section?: {
    children?: { label: string }[];
  }): string[] {
    return (
      section?.children
        ?.map((child) => child.label)
        .filter((label) => label.startsWith("/")) ?? []
    );
  }

  it("parses a full system prompt into sections", () => {
    const prompt =
      basePrompt + agentsBlock + skillsPreamble + skillsBlock + metadata;
    const result: ParsedPrompt = parseSystemPrompt(prompt);

    expect(result.totalChars).toBe(prompt.length);
    expect(result.totalTokens).toBeGreaterThan(0);
    expect(Number.isInteger(result.totalTokens)).toBeTruthy();

    const labels = result.sections.map((s) => s.label);
    expect(labels).toContain("Base prompt");
    expect(labels).toContain("Context files (AGENTS.md / CLAUDE.md)");
  });

  it("parses a full system prompt with correct section labels", () => {
    const prompt =
      basePrompt + agentsBlock + skillsPreamble + skillsBlock + metadata;
    const result = parseSystemPrompt(prompt);

    const labels = result.sections.map((s) => s.label);
    expect(labels).toContain("Skills (2)");
    expect(labels).toContain("Metadata (date/time, cwd)");
  });

  it("parses the current pi date footer as metadata", () => {
    const prompt =
      basePrompt + agentsBlock + skillsPreamble + skillsBlock + currentMetadata;
    const result = parseSystemPrompt(prompt);

    const metadataSection = result.sections.find((s) =>
      s.label.startsWith("Metadata")
    );
    expect(metadataSection?.content).toContain("Current date: 2026-05-15");
    expect(metadataSection?.content).toContain(
      "Current working directory: /home/user/project"
    );
  });

  it("does not include current pi metadata in the final AGENTS.md child", () => {
    const prompt = basePrompt + agentsBlock + currentMetadata;
    const result = parseSystemPrompt(prompt);

    const agentsSection = result.sections.find((s) =>
      s.label.includes("AGENTS.md")
    );
    const lastChild = agentsSection?.children?.find(
      (child) => child.label === "/home/user/project/AGENTS.md"
    );

    expect(lastChild?.label).toBe("/home/user/project/AGENTS.md");
    expect(agentsSection?.content).not.toContain("Current date: 2026-05-15");
    expect(lastChild?.tokens).toBe(
      estimateTokens(
        "## /home/user/project/AGENTS.md\n\n# Project Rules\n\n- Follow TDD."
      )
    );
  });

  it("reconciles section tokens to the total prompt token count", () => {
    const prompt =
      basePrompt + agentsBlock + skillsPreamble + skillsBlock + currentMetadata;
    const result = parseSystemPrompt(prompt);

    expect(sectionTokenSum(result)).toBe(result.totalTokens);
  });

  it("bounds base prompt marker detection before project context", () => {
    const agentsWithPiLikeBullet = [
      "",
      "",
      "# Project Context",
      "",
      "Project-specific instructions and guidelines:",
      "",
      "## /home/user/project/AGENTS.md",
      "",
      "# Project Rules",
      "",
      "- Always read pi custom agent rule before acting.",
    ].join("\n");
    const prompt = basePrompt + agentsWithPiLikeBullet + currentMetadata;
    const result = parseSystemPrompt(prompt);
    const baseSection = result.sections.find((s) => s.label === "Base prompt");

    expect(baseSection?.content).not.toContain("# Project Context");
    expect(baseSection?.content).not.toContain("custom agent rule");
    expect(sectionTokenSum(result)).toBe(result.totalTokens);
  });

  it("reconciles context child rows to the context section total", () => {
    const prompt = basePrompt + agentsBlock + currentMetadata;
    const result = parseSystemPrompt(prompt);
    const contextSection = result.sections.find((s) =>
      s.label.startsWith("Context files")
    );

    expect(contextSection).toBeDefined();
    expect(childTokenSum(contextSection)).toBe(contextSection?.tokens);
    expect(
      contextSection?.children?.some((child) =>
        child.label.includes("overhead")
      )
    ).toBeTruthy();
  });

  it("parses AGENTS.md files into children", () => {
    const prompt = basePrompt + agentsBlock + metadata;
    const result = parseSystemPrompt(prompt);

    const agentsSection = result.sections.find((s) =>
      s.label.includes("AGENTS.md")
    );
    expect(pathChildLabels(agentsSection)).toStrictEqual([
      "/home/user/.pi/agent/AGENTS.md",
      "/home/user/project/AGENTS.md",
    ]);
  });

  it("parses all pi context file names into children", () => {
    const contextWithAllPiFileNames = [
      "",
      "",
      "# Project Context",
      "",
      "Project-specific instructions and guidelines:",
      "",
      "## /home/user/global/AGENTS.MD",
      "",
      "# Uppercase Agents",
      "",
      "## /home/user/project/CLAUDE.md",
      "",
      "# Claude Rules",
      "",
      "## /home/user/project/nested/CLAUDE.MD",
      "",
      "# Uppercase Claude",
    ].join("\n");
    const prompt = basePrompt + contextWithAllPiFileNames + currentMetadata;
    const result = parseSystemPrompt(prompt);
    const contextSection = result.sections.find((s) =>
      s.label.startsWith("Context files")
    );

    expect(pathChildLabels(contextSection)).toStrictEqual([
      "/home/user/global/AGENTS.MD",
      "/home/user/project/CLAUDE.md",
      "/home/user/project/nested/CLAUDE.MD",
    ]);
    expect(childTokenSum(contextSection)).toBe(contextSection?.tokens);
  });

  it("parses current pi project_context instructions into context children", () => {
    const prompt = basePrompt + currentProjectContextBlock + currentMetadata;
    const result = parseSystemPrompt(prompt);
    const contextSection = result.sections.find((s) =>
      s.label.startsWith("Context files")
    );

    expect(contextSection).toBeDefined();
    expect(pathChildLabels(contextSection)).toStrictEqual([
      "/home/user/.pi/agent/AGENTS.md",
      "/home/user/project/AGENTS.md",
    ]);
    expect(result.sections.map((section) => section.label)).not.toContain(
      "SYSTEM.md / APPEND_SYSTEM.md"
    );
    expect(childTokenSum(contextSection)).toBe(contextSection?.tokens);
    expect(sectionTokenSum(result)).toBe(result.totalTokens);
  });

  it("does not split AGENTS.md children on internal path-like markdown headings", () => {
    const agentsWithInternalPathHeading = [
      "",
      "",
      "# Project Context",
      "",
      "Project-specific instructions and guidelines:",
      "",
      "## /home/user/project/AGENTS.md",
      "",
      "# Project Rules",
      "",
      "## /not/a/file",
      "This is an internal markdown heading, not an AGENTS file separator.",
      "",
      "## /home/user/project/nested/AGENTS.md",
      "",
      "# Nested Rules",
    ].join("\n");
    const prompt = basePrompt + agentsWithInternalPathHeading + metadata;
    const result = parseSystemPrompt(prompt);

    const agentsSection = result.sections.find((s) =>
      s.label.includes("AGENTS.md")
    );

    expect(pathChildLabels(agentsSection)).toStrictEqual([
      "/home/user/project/AGENTS.md",
      "/home/user/project/nested/AGENTS.md",
    ]);
    const firstPathChild = agentsSection?.children?.find(
      (child) => child.label === "/home/user/project/AGENTS.md"
    );
    expect(firstPathChild?.tokens).toBe(
      estimateTokens(
        [
          "## /home/user/project/AGENTS.md",
          "",
          "# Project Rules",
          "",
          "## /not/a/file",
          "This is an internal markdown heading, not an AGENTS file separator.",
          "",
        ].join("\n")
      )
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
    expect(skillsSection?.children?.map((child) => child.label)).toStrictEqual(
      expect.arrayContaining(["brainstorming", "tdd"])
    );
  });

  it("reconciles skill child rows to the skills section total", () => {
    const prompt = basePrompt + skillsPreamble + skillsBlock + metadata;
    const result = parseSystemPrompt(prompt);
    const skillsSection = result.sections.find((s) =>
      s.label.startsWith("Skills")
    );

    expect(skillsSection).toBeDefined();
    expect(childTokenSum(skillsSection)).toBe(skillsSection?.tokens);
    expect(
      skillsSection?.children?.some((child) => child.label.includes("overhead"))
    ).toBeTruthy();
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

  it("populates content for every section", () => {
    const prompt =
      basePrompt + agentsBlock + skillsPreamble + skillsBlock + metadata;
    const result = parseSystemPrompt(prompt);

    for (const section of result.sections) {
      expect(section.content).toBeDefined();
      expect(section.content?.length).toBe(section.chars);
    }
  });

  it("populates content for SYSTEM.md gap section", () => {
    const appendContent =
      "\n\nCustom SYSTEM.md instructions here.\nMore custom content.";
    const prompt = basePrompt + appendContent + agentsBlock + metadata;
    const result = parseSystemPrompt(prompt);

    const systemMdSection = result.sections.find((s) =>
      s.label.includes("SYSTEM.md")
    );
    expect(systemMdSection?.content).toBeDefined();
    expect(systemMdSection?.content?.length).toBe(systemMdSection?.chars);
  });

  it("reconciles section tokens when SYSTEM.md content is present", () => {
    const appendContent =
      "\n\nCustom SYSTEM.md instructions here.\nMore custom content.";
    const prompt = basePrompt + appendContent + agentsBlock + currentMetadata;
    const result = parseSystemPrompt(prompt);

    expect(sectionTokenSum(result)).toBe(result.totalTokens);
  });
});

function toolPayload(tool: {
  name: string;
  description: string;
  parameters: unknown;
}) {
  return {
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  };
}

describe("toolEnvelopeForModel()", () => {
  it("maps non-OpenAI pi model APIs to API-specific tool envelopes", () => {
    expect(toolEnvelopeForModel("anthropic-messages", "openrouter")).toBe(
      ToolEnvelope.Anthropic
    );
    expect(
      toolEnvelopeForModel("bedrock-converse-stream", "amazon-bedrock")
    ).toBe(ToolEnvelope.Bedrock);
    expect(toolEnvelopeForModel("google-generative-ai", "openrouter")).toBe(
      ToolEnvelope.Google
    );
    expect(toolEnvelopeForModel("google-vertex", "google-vertex")).toBe(
      ToolEnvelope.Google
    );
    expect(toolEnvelopeForModel("mistral-conversations", "openrouter")).toBe(
      ToolEnvelope.Mistral
    );
  });

  it("maps OpenAI-family pi model APIs to their API-specific envelopes", () => {
    expect(toolEnvelopeForModel("openai-completions", "openrouter")).toBe(
      ToolEnvelope.OpenAiChat
    );
    expect(toolEnvelopeForModel("openai-responses", "openrouter")).toBe(
      ToolEnvelope.OpenAiResponses
    );
    expect(toolEnvelopeForModel("azure-openai-responses", "azure")).toBe(
      ToolEnvelope.OpenAiResponses
    );
    expect(toolEnvelopeForModel("openai-codex-responses", "openai-codex")).toBe(
      ToolEnvelope.OpenAiResponses
    );
  });

  it("falls back to provider hints for custom APIs", () => {
    expect(toolEnvelopeForModel("custom-anthropic-api", "anthropic")).toBe(
      ToolEnvelope.Anthropic
    );
    expect(toolEnvelopeForProvider("mistral")).toBe(ToolEnvelope.Mistral);
  });
});

describe("buildToolDefinitionsSection()", () => {
  it("returns null for empty tools array", () => {
    const result = buildToolDefinitionsSection([]);
    expect(result).toBeNull();
  });

  it("counts only active tools while exposing active and total counts in the label", () => {
    const tools = [
      {
        name: "read",
        description: "Read files",
        parameters: { type: "object", properties: {} },
      },
      {
        name: "bash",
        description: "Run commands",
        parameters: { type: "object", properties: {} },
      },
      {
        name: "write",
        description: "Write files",
        parameters: { type: "object", properties: {} },
      },
    ];

    const section = buildToolDefinitionsSection(tools, ["read", "write"]);

    expect(section).not.toBeNull();
    expect(section?.label).toBe("Tool definitions (2 active, 3 total)");
    expect(section?.children?.map((child) => child.label)).toStrictEqual(
      expect.arrayContaining(["read", "write", "Tool envelope overhead"])
    );

    expect(section?.tokens).toBe(
      estimateTokens(
        JSON.stringify([toolPayload(tools[0]), toolPayload(tools[2])])
      )
    );
  });

  it("preserves inactive tool costs as counterfactual data without counting them", () => {
    const tools = [
      {
        name: "read",
        description: "Read files",
        parameters: { type: "object", properties: {} },
      },
      {
        name: "bash",
        description: "Run commands with arguments",
        parameters: {
          type: "object",
          properties: { command: { type: "string" } },
          required: ["command"],
        },
      },
    ];

    const section = buildToolDefinitionsSection(tools, ["read"]);
    const activeContent = JSON.stringify(toolPayload(tools[0]), null, 2);
    const inactiveContent = JSON.stringify(toolPayload(tools[1]), null, 2);
    const activePayload = JSON.stringify(toolPayload(tools[0]));
    const activeEnvelope = JSON.stringify([toolPayload(tools[0])]);
    const inactivePayload = JSON.stringify(toolPayload(tools[1]));

    expect(section).toMatchObject({
      chars: JSON.stringify([toolPayload(tools[0])], null, 2).length,
      tokens: estimateTokens(activeEnvelope),
      tools: {
        active: [
          {
            name: "read",
            chars: activeContent.length,
            tokens: estimateTokens(activePayload),
            content: activeContent,
          },
        ],
        inactive: [
          {
            name: "bash",
            chars: inactiveContent.length,
            tokens: estimateTokens(inactivePayload),
            content: inactiveContent,
          },
        ],
      },
    });
  });

  it("counts only the compact LLM-visible tool schema payload", () => {
    const tool = {
      name: "read",
      description: "Read files",
      parameters: {
        type: "object",
        properties: { path: { type: "string" } },
        required: ["path"],
      },
      sourceInfo: {
        path: "/home/user/.pi/agent/extensions/example/index.ts",
        source: "npm:example-extension",
        scope: "user",
        origin: "package",
        baseDir: "/home/user/.pi/agent/extensions/example",
      },
    };

    const section = buildToolDefinitionsSection([tool]);
    const llmVisiblePayload = toolPayload(tool);
    const prettyContent = JSON.stringify(llmVisiblePayload, null, 2);

    expect(section?.children?.[0].content).toBe(prettyContent);
    expect(section?.children?.[0].content).not.toContain("sourceInfo");
    expect(section?.children?.[0].tokens).toBe(
      estimateTokens(JSON.stringify(llmVisiblePayload))
    );
    expect(section?.tokens).toBe(
      estimateTokens(JSON.stringify([llmVisiblePayload]))
    );
  });

  it("counts a provider-specific active tool envelope when requested", () => {
    const tools = [
      {
        name: "lookup",
        description: "Lookup a value",
        parameters: {
          type: "object",
          properties: { q: { type: "string" } },
          required: ["q"],
        },
      },
    ];

    const section = buildToolDefinitionsSection(
      tools,
      undefined,
      ToolEnvelope.OpenAiResponses
    );
    const openAiResponsesEnvelope = [
      {
        type: "function",
        name: "lookup",
        description: "Lookup a value",
        parameters: tools[0].parameters,
        strict: false,
      },
    ];

    expect(section?.tokens).toBe(
      estimateTokens(JSON.stringify(openAiResponsesEnvelope))
    );
  });

  it("matches Bedrock's default tool config without an explicit tool choice", () => {
    const tools = [
      {
        name: "lookup",
        description: "Lookup a value",
        parameters: {
          type: "object",
          properties: { q: { type: "string" } },
          required: ["q"],
        },
      },
    ];

    const section = buildToolDefinitionsSection(
      tools,
      undefined,
      ToolEnvelope.Bedrock
    );
    const bedrockEnvelope = {
      tools: [
        {
          toolSpec: {
            name: "lookup",
            description: "Lookup a value",
            inputSchema: { json: tools[0].parameters },
          },
        },
      ],
    };

    expect(section?.tokens).toBe(
      estimateTokens(JSON.stringify(bedrockEnvelope))
    );
  });

  it("counts tool children with the selected per-tool envelope", () => {
    const tools = [
      { name: "a", description: "Tool A", parameters: { type: "object" } },
      {
        name: "b",
        description: "Tool B",
        parameters: { type: "object", properties: { x: { type: "number" } } },
      },
    ];

    const section = buildToolDefinitionsSection(
      tools,
      undefined,
      ToolEnvelope.OpenAiChat
    );
    const openAiChatEnvelopeForOne = (tool: (typeof tools)[number]) => [
      {
        type: "function",
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
          strict: false,
        },
      },
    ];

    const toolChildren = section?.children?.filter((child) =>
      ["a", "b"].includes(child.label)
    );
    const openAiChatChildPayload = (tool: (typeof tools)[number]) => ({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
        strict: false,
      },
    });

    expect(toolChildren?.map((child) => child.tokens)).toStrictEqual(
      tools.map((tool) =>
        estimateTokens(JSON.stringify(openAiChatChildPayload(tool)))
      )
    );
    expect(toolChildren?.[0].content).toBe(
      JSON.stringify(openAiChatChildPayload(tools[0]), null, 2)
    );
    expect(
      section?.children?.some(
        (child) => child.label === "Tool envelope overhead"
      )
    ).toBeTruthy();
    expect(section?.tokens).toBe(
      estimateTokens(
        JSON.stringify([
          ...openAiChatEnvelopeForOne(tools[0]),
          ...openAiChatEnvelopeForOne(tools[1]),
        ])
      )
    );
  });

  it("creates a section with correct label and children count", () => {
    const tools = [
      {
        name: "read",
        description: "Read files",
        parameters: { type: "object", properties: {} },
      },
      {
        name: "bash",
        description: "Run commands",
        parameters: {
          type: "object",
          properties: { command: { type: "string" } },
        },
      },
    ];
    const section = buildToolDefinitionsSection(tools);
    expect(section).not.toBeNull();
    expect(section?.label).toContain("Tool definitions");
    expect(section?.label).toContain("2");
    expect(section?.children?.map((child) => child.label)).toStrictEqual(
      expect.arrayContaining(["read", "bash"])
    );
  });

  it("labels children by tool name", () => {
    const tools = [
      {
        name: "read",
        description: "Read files",
        parameters: { type: "object" },
      },
      {
        name: "bash",
        description: "Run commands",
        parameters: { type: "object" },
      },
    ];
    const section = buildToolDefinitionsSection(tools);
    expect(section?.children?.[0].label).toBe("read");
    expect(section?.children?.[1].label).toBe("bash");
  });

  it("counts tokens for each tool based on JSON serialization", () => {
    const tools = [
      {
        name: "my_tool",
        description: "Does something useful",
        parameters: {
          type: "object",
          properties: { input: { type: "string" } },
        },
      },
    ];
    const section = buildToolDefinitionsSection(tools);
    expect(section).not.toBeNull();
    expect(section?.tokens).toBeGreaterThan(0);
    expect(section?.children?.[0].tokens).toBeGreaterThan(0);
  });

  it("matches child token count to compact serialized JSON", () => {
    const tool = {
      name: "my_tool",
      description: "Does something useful",
      parameters: { type: "object", properties: { input: { type: "string" } } },
    };
    const section = buildToolDefinitionsSection([tool]);
    const serialized = JSON.stringify(toolPayload(tool));
    expect(section?.children?.[0].tokens).toBe(estimateTokens(serialized));
  });

  it("counts section tokens from the compact serialized tool array", () => {
    const tools = [
      { name: "a", description: "Tool A", parameters: { type: "object" } },
      {
        name: "b",
        description: "Tool B with more text",
        parameters: { type: "object", properties: { x: { type: "number" } } },
      },
    ];
    const section = buildToolDefinitionsSection(tools);
    expect(section).not.toBeNull();
    expect(section?.children?.map((child) => child.label)).toStrictEqual(
      expect.arrayContaining(["a", "b"])
    );
    expect(section?.tokens).toBe(
      estimateTokens(JSON.stringify(tools.map(toolPayload)))
    );
  });

  it("reconciles active tool children and envelope overhead to the section total", () => {
    const tools = [
      { name: "a", description: "Tool A", parameters: { type: "object" } },
      {
        name: "b",
        description: "Tool B with more text",
        parameters: { type: "object", properties: { x: { type: "number" } } },
      },
    ];

    for (const envelope of Object.values(ToolEnvelope)) {
      const section = buildToolDefinitionsSection(tools, undefined, envelope);
      const childSum = section?.children?.reduce(
        (sum, child) => sum + child.tokens,
        0
      );

      expect(childSum).toBe(section?.tokens);
      expect(
        section?.children?.some((child) => child.label.includes("overhead"))
      ).toBeTruthy();
    }
  });
});
