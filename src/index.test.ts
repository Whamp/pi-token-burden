import type { ParsedPrompt, PromptSection } from "./types.js";

type CommandHandler = (
  args: string[],
  ctx: {
    getSystemPrompt(): string;
    getContextUsage(): { contextWindow?: number } | null;
    hasUI: boolean;
  }
) => Promise<void>;

interface ToolDefinition {
  name: string;
  description: string;
  parameters: unknown;
}

interface ParserModule {
  parseSystemPrompt(prompt: string): ParsedPrompt;
  buildToolDefinitionsSection(
    tools: ToolDefinition[],
    activeToolNames?: string[]
  ): PromptSection | null;
  estimateTokens(text: string): number;
}

interface ReportViewModule {
  showReport(...args: unknown[]): Promise<void>;
}

function requireHandler(handler: CommandHandler | null): CommandHandler {
  if (handler === null) {
    throw new Error("token-burden handler not registered");
  }

  return handler;
}

const parseSystemPromptMock = vi.fn<ParserModule["parseSystemPrompt"]>();
const buildToolDefinitionsSectionMock =
  vi.fn<ParserModule["buildToolDefinitionsSection"]>();
const estimateTokensMock = vi.fn<ParserModule["estimateTokens"]>();
const showReportMock = vi.fn<ReportViewModule["showReport"]>();

vi.mock<ParserModule>(import("./parser.js"), () => ({
  parseSystemPrompt: parseSystemPromptMock,
  buildToolDefinitionsSection: buildToolDefinitionsSectionMock,
  estimateTokens: estimateTokensMock,
}));

vi.mock<ReportViewModule>(import("./report-view.js"), () => ({
  showReport: showReportMock,
}));

describe("extension", () => {
  it("exports a default function", async () => {
    const mod = await import("./index.js");
    expectTypeOf(mod.default).toBeFunction();
  });

  it("passes active tool names when building the tools section", async () => {
    parseSystemPromptMock.mockReturnValue({
      sections: [],
      totalChars: 0,
      totalTokens: 0,
      skills: [],
    });
    buildToolDefinitionsSectionMock.mockReturnValue(null);

    const tools = [
      { name: "read", description: "Read files", parameters: {} },
      { name: "bash", description: "Run commands", parameters: {} },
    ];

    let handler: CommandHandler | null = null;
    const pi = {
      registerCommand: vi.fn(
        (
          _name: string,
          { handler: registeredHandler }: { handler: CommandHandler }
        ) => {
          handler = registeredHandler;
        }
      ),
      getAllTools: vi.fn(() => tools),
      getActiveTools: vi.fn(() => ["read"]),
    };

    const { default: extension } = await import("./index.js");
    extension(pi as never);

    expect(handler).toBeTypeOf("function");

    const runHandler = requireHandler(handler);

    await runHandler([], {
      getSystemPrompt: () => "prompt",
      getContextUsage: () => null,
      hasUI: false,
    });

    expect(buildToolDefinitionsSectionMock).toHaveBeenCalledWith(tools, [
      "read",
    ]);
  });
});
