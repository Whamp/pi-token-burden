import { fromPartial } from '@total-typescript/shoehorn';

import type { ParsedPrompt, PromptSection } from './types.js';

type CommandHandler = (
  args: string[],
  ctx: {
    getSystemPrompt(): string;
    getContextUsage(): { contextWindow?: number } | null;
    hasUI: boolean;
    model?: { api?: string; provider?: string; contextWindow?: number };
  },
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
    activeToolNames?: string[],
    countedEnvelope?: string,
  ): PromptSection | null;
  estimateTokens(text: string): number;
  toolEnvelopeForModel(api?: string, provider?: string): string;
}

interface ReportViewModule {
  showReport(...args: unknown[]): Promise<void>;
}

function requireHandler(handler: CommandHandler | null): CommandHandler {
  if (handler === null) {
    throw new Error('token-burden handler not registered');
  }

  return handler;
}

const PARSE_SYSTEM_PROMPT_MOCK = vi.fn<ParserModule['parseSystemPrompt']>();
const BUILD_TOOL_DEFINITIONS_SECTION_MOCK = vi.fn<ParserModule['buildToolDefinitionsSection']>();
const ESTIMATE_TOKENS_MOCK = vi.fn<ParserModule['estimateTokens']>();
const TOOL_ENVELOPE_FOR_MODEL_MOCK = vi.fn<ParserModule['toolEnvelopeForModel']>();
const SHOW_REPORT_MOCK = vi.fn<ReportViewModule['showReport']>();

vi.mock<ParserModule>(import('./parser.js'), async (importOriginal) => ({
  ...(await importOriginal()),
  parseSystemPrompt: PARSE_SYSTEM_PROMPT_MOCK,
  buildToolDefinitionsSection: BUILD_TOOL_DEFINITIONS_SECTION_MOCK,
  estimateTokens: ESTIMATE_TOKENS_MOCK,
  toolEnvelopeForModel: TOOL_ENVELOPE_FOR_MODEL_MOCK,
}));

vi.mock<ReportViewModule>(import('./report-view.js'), async (importOriginal) => ({
  ...(await importOriginal()),
  showReport: SHOW_REPORT_MOCK,
}));

describe('extension', () => {
  it('exports a default function', async () => {
    const mod = await import('./index.js');
    expectTypeOf(mod.default).toBeFunction();
  });

  it('passes active tool names when building the tools section', async () => {
    PARSE_SYSTEM_PROMPT_MOCK.mockReturnValue({
      sections: [],
      totalChars: 0,
      totalTokens: 0,
      skills: [],
    });
    BUILD_TOOL_DEFINITIONS_SECTION_MOCK.mockReturnValue(null);
    TOOL_ENVELOPE_FOR_MODEL_MOCK.mockReturnValue('anthropic');

    const tools = [
      { name: 'read', description: 'Read files', parameters: {} },
      { name: 'bash', description: 'Run commands', parameters: {} },
    ];

    let handler: CommandHandler | null = null;
    const pi = {
      registerCommand: vi.fn(
        (name: string, { handler: registeredHandler }: { handler: CommandHandler }) => {
          handler = registeredHandler;
        },
      ),
      getAllTools: vi.fn(() => tools),
      getActiveTools: vi.fn(() => ['read']),
    };

    const { default: extension } = await import('./index.js');
    await extension(fromPartial(pi));

    expect(handler).toBeTypeOf('function');

    const runHandler = requireHandler(handler);

    await runHandler([], {
      getSystemPrompt: () => 'prompt',
      getContextUsage: () => null,
      hasUI: false,
      model: { api: 'anthropic-messages', provider: 'openrouter' },
    });

    expect(TOOL_ENVELOPE_FOR_MODEL_MOCK).toHaveBeenCalledWith('anthropic-messages', 'openrouter');
    expect(BUILD_TOOL_DEFINITIONS_SECTION_MOCK).toHaveBeenCalledWith(tools, ['read'], 'anthropic');
  });
});
