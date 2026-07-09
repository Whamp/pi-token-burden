/**
 * Parse the assembled system prompt into measurable sections.
 *
 * The system prompt built by pi follows a predictable structure:
 *   1. Base prompt (tools, guidelines, pi docs reference)
 *   2. Optional SYSTEM.md / APPEND_SYSTEM.md content
 *   3. Project Context (AGENTS.md files, each under `## <path>` or
 *      `<project_instructions path="...">`)
 *   4. Skills preamble + <available_skills> block
 *   5. Date/time + cwd metadata
 */

import { encode } from 'gpt-tokenizer/encoding/o200k_base';

import { ToolEnvelope } from './enums.js';
import type { ParsedPrompt, PromptSection, SkillEntry, ToolEntry } from './types.js';
import { getRequiredItem, isRecord } from './utils.js';

/** Public result shape returned by the Token Budget Pipeline parser. */
export type { ParsedPrompt };

/** Token count using BPE tokenization (o200k_base encoding). */
export function estimateTokens(text: string): number {
  return encode(text).length;
}

interface ChildRow {
  label: string;
  chars: number;
  tokens: number;
  content?: string;
}

interface ContextFileSpan {
  path: string;
  start: number;
  end: number;
}

interface ParsedSkillEntry extends SkillEntry {
  start: number;
  end: number;
}

// ---------------------------------------------------------------------------
// Internal helpers (defined before use to satisfy no-use-before-define)
// ---------------------------------------------------------------------------

function measureSpan(label: string, prompt: string, start: number, end: number): PromptSection {
  const text = prompt.slice(start, end);
  return {
    label,
    chars: text.length,
    tokens: estimateTokens(prompt.slice(0, end)) - estimateTokens(prompt.slice(0, start)),
    content: text,
  };
}

/** Return the smallest positive value, or -1 if none are positive. */
function firstPositive(...values: number[]): number {
  let min = -1;
  for (const v of values) {
    if (v >= 0 && (min < 0 || v < min)) {
      min = v;
    }
  }
  return min;
}

/**
 * Find where the base system prompt ends.
 *
 * The base prompt ends after the pi docs reference block. We look for
 * "- Always read pi .md files" or "- When working on pi" as the terminal
 * marker. Falls back to the first major section boundary.
 */
function findBasePromptEnd(
  prompt: string,
  projectCtxIdx: number,
  skillsPreambleIdx: number,
  dateLineIdx: number,
): number {
  const fallbackBoundary = firstPositive(projectCtxIdx, skillsPreambleIdx, dateLineIdx);
  const searchEnd = fallbackBoundary >= 0 ? fallbackBoundary : prompt.length;
  const baseRegion = prompt.slice(0, searchEnd);
  const piDocsMarker = /^- (?:Always read pi|When working on pi).+$/gm;
  let lastPiDocsEnd = -1;
  for (const match of baseRegion.matchAll(piDocsMarker)) {
    lastPiDocsEnd = match.index + match[0].length;
  }

  if (lastPiDocsEnd !== -1) {
    return lastPiDocsEnd;
  }

  return fallbackBoundary;
}

function findMetadataStart(prompt: string): number {
  const currentDateIdx = prompt.lastIndexOf('\nCurrent date:');
  const legacyDateTimeIdx = prompt.lastIndexOf('\nCurrent date and time:');
  return Math.max(currentDateIdx, legacyDateTimeIdx);
}

function findProjectContextStart(prompt: string): number {
  return firstPositive(
    prompt.indexOf('\n\n# Project Context\n'),
    prompt.indexOf('\n\n<project_context>'),
  );
}

function isPiContextFilePath(filePath: string): boolean {
  return /(?:^|\/)(?:AGENTS|CLAUDE)\.md$/i.test(filePath);
}

/** Parse pi context-file entries inside the Project Context section. */
function parseContextFileSpans(contextBlock: string): ContextFileSpan[] {
  const headingPattern = /^## (\/[^\r\n]+)$/gm;
  const headingMatches = [...contextBlock.matchAll(headingPattern)].filter((match) =>
    isPiContextFilePath(getRequiredItem(match, 1)),
  );
  const headingSpans = headingMatches.map((match, index) => ({
    path: getRequiredItem(match, 1),
    start: match.index,
    end:
      index + 1 < headingMatches.length
        ? getRequiredItem(headingMatches, index + 1).index
        : contextBlock.length,
  }));

  const projectInstructionsPattern =
    /<project_instructions\s+path=(["'])([^"']+)\1>[\s\S]*?<\/project_instructions>/g;
  const projectInstructionSpans = [...contextBlock.matchAll(projectInstructionsPattern)]
    .filter((match) => isPiContextFilePath(getRequiredItem(match, 2)))
    .map((match) => ({
      path: getRequiredItem(match, 2),
      start: match.index,
      end: match.index + getRequiredItem(match, 0).length,
    }));

  return [...headingSpans, ...projectInstructionSpans].toSorted((a, b) => a.start - b.start);
}

/** Parse `<skill>` entries from the `<available_skills>` XML block. */
function parseSkillEntries(xmlBlock: string): ParsedSkillEntry[] {
  const entries: ParsedSkillEntry[] = [];
  const skillPattern = /<skill>([\s\S]*?)<\/skill>/g;
  const namePattern = /<name>([\s\S]*?)<\/name>/;
  const descPattern = /<description>([\s\S]*?)<\/description>/;
  const locPattern = /<location>([\s\S]*?)<\/location>/;

  for (const match of xmlBlock.matchAll(skillPattern)) {
    const fullEntry = getRequiredItem(match, 0);
    const inner = getRequiredItem(match, 1);
    const name = inner.match(namePattern)?.[1]?.trim() ?? 'unknown';
    const description = inner.match(descPattern)?.[1]?.trim() ?? '';
    const location = inner.match(locPattern)?.[1]?.trim() ?? '';

    entries.push({
      name,
      description,
      location,
      chars: fullEntry.length,
      tokens: estimateTokens(fullEntry),
      start: match.index,
      end: match.index + fullEntry.length,
    });
  }

  return entries;
}

function appendReconciliationChild(
  children: ChildRow[],
  parent: PromptSection,
  label: string,
): ChildRow[] {
  const childTokens = children.reduce((sum, child) => sum + child.tokens, 0);
  const childChars = children.reduce((sum, child) => sum + child.chars, 0);
  const overheadTokens = parent.tokens - childTokens;
  const overheadChars = Math.max(0, parent.chars - childChars);

  if (overheadTokens === 0 && overheadChars === 0) {
    return children;
  }

  return [
    ...children,
    {
      label,
      chars: overheadChars,
      tokens: overheadTokens,
    },
  ];
}

/** Compute the skills section end index, avoiding nested ternaries. */
function findSkillsSectionEnd(
  availableSkillsEnd: number,
  dateLineIdx: number,
  promptLength: number,
): number {
  if (availableSkillsEnd !== -1) {
    return availableSkillsEnd + '</available_skills>'.length;
  }
  if (dateLineIdx !== -1) {
    return dateLineIdx;
  }
  return promptLength;
}

// ---------------------------------------------------------------------------
// Main parser
// ---------------------------------------------------------------------------

/**
 * Parse a system prompt string into sections with token estimates.
 *
 * Uses known structural markers emitted by `buildSystemPrompt()`:
 *   - `# Project Context` heading or `<project_context>` wrapper
 *   - `The following skills provide specialized instructions` preamble
 *   - `<available_skills>` / `</available_skills>` XML block
 *   - `Current date:` / `Current date and time:` footer
 */
export function parseSystemPrompt(prompt: string): ParsedPrompt {
  const sections: PromptSection[] = [];
  const skills: SkillEntry[] = [];

  const projectCtxIdx = findProjectContextStart(prompt);
  const skillsPreambleIdx = prompt.indexOf(
    '\n\nThe following skills provide specialized instructions',
  );
  const availableSkillsStart = prompt.indexOf('<available_skills>');
  const availableSkillsEnd = prompt.indexOf('</available_skills>');
  const dateLineIdx = findMetadataStart(prompt);

  // 1. Base system prompt
  const baseEnd = findBasePromptEnd(prompt, projectCtxIdx, skillsPreambleIdx, dateLineIdx);
  const nextSectionStart =
    projectCtxIdx === -1 ? firstPositive(skillsPreambleIdx, dateLineIdx) : projectCtxIdx;

  let baseSectionEnd = baseEnd >= 0 ? baseEnd : prompt.length;
  let systemGapStart = -1;
  let systemGapEnd = -1;

  if (baseEnd >= 0 && nextSectionStart >= 0 && nextSectionStart > baseEnd) {
    const gap = prompt.slice(baseEnd, nextSectionStart);
    if (gap.trim().length > 0) {
      systemGapStart = baseEnd;
      systemGapEnd = nextSectionStart;
    } else {
      baseSectionEnd = nextSectionStart;
    }
  }

  sections.push(measureSpan('Base prompt', prompt, 0, baseSectionEnd));

  if (systemGapStart >= 0 && systemGapEnd >= 0) {
    sections.push(
      measureSpan('SYSTEM.md / APPEND_SYSTEM.md', prompt, systemGapStart, systemGapEnd),
    );
  }

  // 2. Project Context / AGENTS.md and CLAUDE.md files
  if (projectCtxIdx !== -1) {
    const contextStart = projectCtxIdx;
    const contextEndBoundary = firstPositive(skillsPreambleIdx, dateLineIdx);
    const contextEnd = contextEndBoundary >= 0 ? contextEndBoundary : prompt.length;
    const contextBlock = prompt.slice(contextStart, contextEnd);
    const contextSection = measureSpan(
      'Context files (AGENTS.md / CLAUDE.md)',
      prompt,
      contextStart,
      contextEnd,
    );

    const contextFiles = parseContextFileSpans(contextBlock);
    const children = contextFiles.map((file): ChildRow => {
      const child = measureSpan(
        file.path,
        prompt,
        contextStart + file.start,
        contextStart + file.end,
      );
      return {
        label: child.label,
        chars: child.chars,
        tokens: child.tokens,
        content: child.content,
      };
    });

    sections.push({
      ...contextSection,
      children: appendReconciliationChild(children, contextSection, 'Context wrapper / overhead'),
    });
  }

  // 3. Skills section
  if (skillsPreambleIdx !== -1) {
    const skillsSectionStart = skillsPreambleIdx;
    const skillsSectionEnd = findSkillsSectionEnd(availableSkillsEnd, dateLineIdx, prompt.length);
    const parsedSkillEntries: ParsedSkillEntry[] = [];
    if (availableSkillsStart !== -1 && availableSkillsEnd !== -1) {
      const xmlBlock = prompt.slice(
        availableSkillsStart,
        availableSkillsEnd + '</available_skills>'.length,
      );
      parsedSkillEntries.push(...parseSkillEntries(xmlBlock));
      skills.push(
        ...parsedSkillEntries.map((entry) => ({
          name: entry.name,
          description: entry.description,
          location: entry.location,
          chars: entry.chars,
          tokens: entry.tokens,
        })),
      );
    }

    const skillsSection = measureSpan(
      `Skills (${String(skills.length)})`,
      prompt,
      skillsSectionStart,
      skillsSectionEnd,
    );
    const children = parsedSkillEntries.map((entry): ChildRow => {
      const child = measureSpan(
        entry.name,
        prompt,
        availableSkillsStart + entry.start,
        availableSkillsStart + entry.end,
      );
      const promptSkill = skills.find((skill) => skill.name === entry.name);
      if (promptSkill) {
        promptSkill.tokens = child.tokens;
      }
      return {
        label: child.label,
        chars: child.chars,
        tokens: child.tokens,
        content: child.content,
      };
    });

    sections.push({
      ...skillsSection,
      children: appendReconciliationChild(
        children,
        skillsSection,
        'Skills preamble / XML overhead',
      ),
    });
  }

  // 4. Metadata footer
  if (dateLineIdx !== -1) {
    sections.push(measureSpan('Metadata (date/time, cwd)', prompt, dateLineIdx, prompt.length));
  }

  const totalChars = prompt.length;
  const totalTokens = estimateTokens(prompt);

  return { sections, totalChars, totalTokens, skills };
}

// ---------------------------------------------------------------------------
// Tool definitions section
// ---------------------------------------------------------------------------

interface ToolDefinitionInput {
  name: string;
  description: string;
  parameters: unknown;
}

interface ToolSchemaPayload {
  name: string;
  description: string;
  parameters: unknown;
}

interface ToolEnvelopeVariantPayload {
  name: ToolEnvelope;
  payload: unknown;
}

function createToolSchemaPayload(tool: ToolDefinitionInput): ToolSchemaPayload {
  return {
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  };
}

function toolParametersObject(parameters: unknown): Record<string, unknown> {
  return isRecord(parameters) ? parameters : {};
}

function buildToolEnvelopeChildPayload(tool: ToolDefinitionInput, envelope: ToolEnvelope): unknown {
  if (envelope === ToolEnvelope.Compact) {
    return createToolSchemaPayload(tool);
  }

  if (envelope === ToolEnvelope.OpenAiResponses) {
    return {
      type: 'function',
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
      strict: false,
    };
  }

  if (envelope === ToolEnvelope.OpenAiChat || envelope === ToolEnvelope.Mistral) {
    return {
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
        strict: false,
      },
    };
  }

  if (envelope === ToolEnvelope.Anthropic) {
    const parameters = toolParametersObject(tool.parameters);
    return {
      name: tool.name,
      description: tool.description,
      input_schema: {
        type: 'object',
        properties: parameters.properties ?? {},
        required: parameters.required ?? [],
      },
    };
  }

  if (envelope === ToolEnvelope.Bedrock) {
    return {
      toolSpec: {
        name: tool.name,
        description: tool.description,
        inputSchema: { json: tool.parameters },
      },
    };
  }

  return {
    name: tool.name,
    description: tool.description,
    parametersJsonSchema: tool.parameters,
  };
}

function buildToolEnvelopePayload(tools: ToolDefinitionInput[], envelope: ToolEnvelope): unknown {
  const childPayloads = tools.map((tool) => buildToolEnvelopeChildPayload(tool, envelope));

  if (envelope === ToolEnvelope.Bedrock) {
    return {
      tools: childPayloads,
    };
  }

  if (envelope === ToolEnvelope.Google) {
    return [
      {
        functionDeclarations: childPayloads,
      },
    ];
  }

  return childPayloads;
}

/** Select the default tool envelope for a provider identifier. */
export function toolEnvelopeForProvider(provider: string | undefined): ToolEnvelope {
  const normalizedProvider = provider?.toLowerCase() ?? '';
  if (normalizedProvider.includes('anthropic')) {
    return ToolEnvelope.Anthropic;
  }
  if (normalizedProvider.includes('bedrock') || normalizedProvider.includes('amazon')) {
    return ToolEnvelope.Bedrock;
  }
  if (
    normalizedProvider.includes('google') ||
    normalizedProvider.includes('gemini') ||
    normalizedProvider.includes('vertex')
  ) {
    return ToolEnvelope.Google;
  }
  if (normalizedProvider.includes('mistral')) {
    return ToolEnvelope.Mistral;
  }
  return ToolEnvelope.OpenAiResponses;
}

/** Select the tool envelope from Pi's API identifier with provider fallback. */
export function toolEnvelopeForModel(api: string | undefined, provider?: string): ToolEnvelope {
  switch (api) {
    case 'anthropic-messages': {
      return ToolEnvelope.Anthropic;
    }
    case 'bedrock-converse-stream': {
      return ToolEnvelope.Bedrock;
    }
    case 'google-generative-ai':
    case 'google-vertex': {
      return ToolEnvelope.Google;
    }
    case 'mistral-conversations': {
      return ToolEnvelope.Mistral;
    }
    case 'openai-completions': {
      return ToolEnvelope.OpenAiChat;
    }
    case 'azure-openai-responses':
    case 'openai-codex-responses':
    case 'openai-responses': {
      return ToolEnvelope.OpenAiResponses;
    }
    default: {
      return toolEnvelopeForProvider(provider);
    }
  }
}

function buildToolEnvelopeVariants(tools: ToolDefinitionInput[]): ToolEnvelopeVariantPayload[] {
  return [
    ToolEnvelope.Compact,
    ToolEnvelope.OpenAiResponses,
    ToolEnvelope.OpenAiChat,
    ToolEnvelope.Anthropic,
    ToolEnvelope.Bedrock,
    ToolEnvelope.Google,
    ToolEnvelope.Mistral,
  ].map((name) => ({
    name,
    payload: buildToolEnvelopePayload(tools, name),
  }));
}

/**
 * Build a PromptSection for tool definitions (function schemas sent to the LLM).
 *
 * Tool definitions are not part of the system prompt text — they're sent via
 * the function-calling API — but they consume context window tokens. This
 * builds a section to make that cost visible.
 *
 * Returns null if there are no tools.
 */
export function buildToolDefinitionsSection(
  tools: ToolDefinitionInput[],
  activeToolNames?: string[],
  countedEnvelope: ToolEnvelope = ToolEnvelope.Compact,
): PromptSection | null {
  if (tools.length === 0) {
    return null;
  }

  const activeSet = activeToolNames ? new Set(activeToolNames) : null;
  const countedTools = activeSet ? tools.filter((tool) => activeSet.has(tool.name)) : tools;
  const inactiveTools = activeSet ? tools.filter((tool) => !activeSet.has(tool.name)) : [];

  function serializeTools(input: ToolDefinitionInput[]): ToolEntry[] {
    return input.map((tool) => {
      const payload = buildToolEnvelopeChildPayload(tool, countedEnvelope);
      const content = JSON.stringify(payload, null, 2);
      const countedPayload = JSON.stringify(payload);
      return {
        name: tool.name,
        chars: content.length,
        tokens: estimateTokens(countedPayload),
        content,
      };
    });
  }

  const activeEnvelopePayload = buildToolEnvelopePayload(countedTools, countedEnvelope);
  const activeEntries = serializeTools(countedTools);
  const inactiveEntries = serializeTools(inactiveTools);
  const variants = buildToolEnvelopeVariants(countedTools).map((variant) => {
    const content = JSON.stringify(variant.payload, null, 2);
    return {
      name: variant.name,
      chars: content.length,
      tokens: estimateTokens(JSON.stringify(variant.payload)),
      content,
    };
  });

  const children: {
    label: string;
    chars: number;
    tokens: number;
    content?: string;
  }[] = [];
  const totalContent = JSON.stringify(activeEnvelopePayload, null, 2);
  const totalTokens = estimateTokens(JSON.stringify(activeEnvelopePayload));
  const totalChars = totalContent.length;

  for (const tool of activeEntries) {
    children.push({
      label: tool.name,
      chars: tool.chars,
      tokens: tool.tokens,
      content: tool.content,
    });
  }

  const reconciledChildren = appendReconciliationChild(
    children,
    {
      label: 'Tool definitions',
      chars: totalChars,
      tokens: totalTokens,
    },
    'Tool envelope overhead',
  );

  const label = activeSet
    ? `Tool definitions (${String(countedTools.length)} active, ${String(tools.length)} total)`
    : `Tool definitions (${String(tools.length)})`;

  return {
    label,
    chars: totalChars,
    tokens: totalTokens,
    tools: {
      active: activeEntries,
      inactive: inactiveEntries,
      variants,
      countedEnvelope,
    },
    children: reconciledChildren,
  };
}
