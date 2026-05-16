/**
 * Parse the assembled system prompt into measurable sections.
 *
 * The system prompt built by pi follows a predictable structure:
 *   1. Base prompt (tools, guidelines, pi docs reference)
 *   2. Optional SYSTEM.md / APPEND_SYSTEM.md content
 *   3. Project Context (AGENTS.md files, each under `## <path>`)
 *   4. Skills preamble + <available_skills> block
 *   5. Date/time + cwd metadata
 */

import { encode } from "gpt-tokenizer/encoding/o200k_base";

import { ToolEnvelope } from "./enums.js";
import type {
  AgentsFileEntry,
  ParsedPrompt,
  PromptSection,
  SkillEntry,
  ToolEntry,
} from "./types.js";

export type { ParsedPrompt };

/** Token count using BPE tokenization (o200k_base encoding). */
export function estimateTokens(text: string): number {
  return encode(text).length;
}

// ---------------------------------------------------------------------------
// Internal helpers (defined before use to satisfy no-use-before-define)
// ---------------------------------------------------------------------------

function measureSpan(
  label: string,
  prompt: string,
  start: number,
  end: number
): PromptSection {
  const text = prompt.slice(start, end);
  return {
    label,
    chars: text.length,
    tokens:
      estimateTokens(prompt.slice(0, end)) -
      estimateTokens(prompt.slice(0, start)),
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
  dateLineIdx: number
): number {
  const piDocsMarker = /^- (?:Always read pi|When working on pi).+$/gm;
  let lastPiDocsEnd = -1;
  for (const match of prompt.matchAll(piDocsMarker)) {
    lastPiDocsEnd = match.index + match[0].length;
  }

  if (lastPiDocsEnd !== -1) {
    return lastPiDocsEnd;
  }

  return firstPositive(projectCtxIdx, skillsPreambleIdx, dateLineIdx);
}

function findMetadataStart(prompt: string): number {
  const currentDateIdx = prompt.lastIndexOf("\nCurrent date:");
  const legacyDateTimeIdx = prompt.lastIndexOf("\nCurrent date and time:");
  return Math.max(currentDateIdx, legacyDateTimeIdx);
}

/** Parse `## /path/to/AGENTS.md` blocks inside the Project Context section. */
function parseAgentsFiles(contextBlock: string): AgentsFileEntry[] {
  const files: AgentsFileEntry[] = [];
  // Pi emits each project-context file under a `## /.../AGENTS.md` heading.
  // Do not treat arbitrary path-looking markdown headings inside an AGENTS.md
  // body as file separators.
  const headingPattern = /^## (\/[^\r\n]*AGENTS\.md)$/gm;
  const matches = [...contextBlock.matchAll(headingPattern)];

  for (let i = 0; i < matches.length; i++) {
    const [, path] = matches[i];
    const blockStart = matches[i].index;
    const blockEnd =
      i + 1 < matches.length ? matches[i + 1].index : contextBlock.length;
    const blockText = contextBlock.slice(blockStart, blockEnd);
    files.push({
      path,
      chars: blockText.length,
      tokens: estimateTokens(blockText),
    });
  }

  return files;
}

/** Parse `<skill>` entries from the `<available_skills>` XML block. */
function parseSkillEntries(xmlBlock: string, out: SkillEntry[]): void {
  const skillPattern = /<skill>([\s\S]*?)<\/skill>/g;
  const namePattern = /<name>([\s\S]*?)<\/name>/;
  const descPattern = /<description>([\s\S]*?)<\/description>/;
  const locPattern = /<location>([\s\S]*?)<\/location>/;

  for (const match of xmlBlock.matchAll(skillPattern)) {
    const [fullEntry, inner] = match;
    const name = inner.match(namePattern)?.[1]?.trim() ?? "unknown";
    const description = inner.match(descPattern)?.[1]?.trim() ?? "";
    const location = inner.match(locPattern)?.[1]?.trim() ?? "";

    out.push({
      name,
      description,
      location,
      chars: fullEntry.length,
      tokens: estimateTokens(fullEntry),
    });
  }
}

/** Compute the skills section end index, avoiding nested ternaries. */
function findSkillsSectionEnd(
  availableSkillsEnd: number,
  dateLineIdx: number,
  promptLength: number
): number {
  if (availableSkillsEnd !== -1) {
    return availableSkillsEnd + "</available_skills>".length;
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
 *   - `# Project Context` heading
 *   - `The following skills provide specialized instructions` preamble
 *   - `<available_skills>` / `</available_skills>` XML block
 *   - `Current date:` / `Current date and time:` footer
 */
export function parseSystemPrompt(prompt: string): ParsedPrompt {
  const sections: PromptSection[] = [];
  const skills: SkillEntry[] = [];

  const projectCtxIdx = prompt.indexOf("\n\n# Project Context\n");
  const skillsPreambleIdx = prompt.indexOf(
    "\n\nThe following skills provide specialized instructions"
  );
  const availableSkillsStart = prompt.indexOf("<available_skills>");
  const availableSkillsEnd = prompt.indexOf("</available_skills>");
  const dateLineIdx = findMetadataStart(prompt);

  // 1. Base system prompt
  const baseEnd = findBasePromptEnd(
    prompt,
    projectCtxIdx,
    skillsPreambleIdx,
    dateLineIdx
  );
  const nextSectionStart =
    projectCtxIdx === -1
      ? firstPositive(skillsPreambleIdx, dateLineIdx)
      : projectCtxIdx;

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

  sections.push(measureSpan("Base prompt", prompt, 0, baseSectionEnd));

  if (systemGapStart >= 0 && systemGapEnd >= 0) {
    sections.push(
      measureSpan(
        "SYSTEM.md / APPEND_SYSTEM.md",
        prompt,
        systemGapStart,
        systemGapEnd
      )
    );
  }

  // 2. Project Context / AGENTS.md files
  if (projectCtxIdx !== -1) {
    const contextStart = projectCtxIdx;
    const contextEndBoundary = firstPositive(skillsPreambleIdx, dateLineIdx);
    const contextEnd =
      contextEndBoundary >= 0 ? contextEndBoundary : prompt.length;
    const contextBlock = prompt.slice(contextStart, contextEnd);

    const agentsFiles = parseAgentsFiles(contextBlock);
    const children = agentsFiles.map((f) => ({
      label: f.path,
      chars: f.chars,
      tokens: f.tokens,
    }));

    sections.push({
      ...measureSpan("AGENTS.md files", prompt, contextStart, contextEnd),
      children,
    });
  }

  // 3. Skills section
  if (skillsPreambleIdx !== -1) {
    const skillsSectionStart = skillsPreambleIdx;
    const skillsSectionEnd = findSkillsSectionEnd(
      availableSkillsEnd,
      dateLineIdx,
      prompt.length
    );
    if (availableSkillsStart !== -1 && availableSkillsEnd !== -1) {
      const xmlBlock = prompt.slice(
        availableSkillsStart,
        availableSkillsEnd + "</available_skills>".length
      );
      parseSkillEntries(xmlBlock, skills);
    }

    const children = skills.map((s) => ({
      label: s.name,
      chars: s.chars,
      tokens: s.tokens,
    }));

    sections.push({
      ...measureSpan(
        `Skills (${String(skills.length)})`,
        prompt,
        skillsSectionStart,
        skillsSectionEnd
      ),
      children,
    });
  }

  // 4. Metadata footer
  if (dateLineIdx !== -1) {
    sections.push(
      measureSpan(
        "Metadata (date/time, cwd)",
        prompt,
        dateLineIdx,
        prompt.length
      )
    );
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
  return parameters &&
    typeof parameters === "object" &&
    !Array.isArray(parameters)
    ? (parameters as Record<string, unknown>)
    : {};
}

function buildToolEnvelopePayload(
  tools: ToolDefinitionInput[],
  envelope: ToolEnvelope
): unknown {
  if (envelope === ToolEnvelope.Compact) {
    return tools.map(createToolSchemaPayload);
  }

  if (envelope === ToolEnvelope.OpenAiResponses) {
    return tools.map((tool) => ({
      type: "function",
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
      strict: false,
    }));
  }

  if (
    envelope === ToolEnvelope.OpenAiChat ||
    envelope === ToolEnvelope.Mistral
  ) {
    return tools.map((tool) => ({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
        strict: false,
      },
    }));
  }

  if (envelope === ToolEnvelope.Anthropic) {
    return tools.map((tool) => {
      const parameters = toolParametersObject(tool.parameters);
      return {
        name: tool.name,
        description: tool.description,
        input_schema: {
          type: "object",
          properties: parameters.properties ?? {},
          required: parameters.required ?? [],
        },
      };
    });
  }

  if (envelope === ToolEnvelope.Bedrock) {
    return {
      tools: tools.map((tool) => ({
        toolSpec: {
          name: tool.name,
          description: tool.description,
          inputSchema: { json: tool.parameters },
        },
      })),
      toolChoice: { auto: {} },
    };
  }

  return [
    {
      functionDeclarations: tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        parametersJsonSchema: tool.parameters,
      })),
    },
  ];
}

export function toolEnvelopeForProvider(
  provider: string | undefined
): ToolEnvelope {
  const normalizedProvider = provider?.toLowerCase() ?? "";
  if (normalizedProvider.includes("anthropic")) {
    return ToolEnvelope.Anthropic;
  }
  if (
    normalizedProvider.includes("bedrock") ||
    normalizedProvider.includes("amazon")
  ) {
    return ToolEnvelope.Bedrock;
  }
  if (
    normalizedProvider.includes("google") ||
    normalizedProvider.includes("gemini") ||
    normalizedProvider.includes("vertex")
  ) {
    return ToolEnvelope.Google;
  }
  if (normalizedProvider.includes("mistral")) {
    return ToolEnvelope.Mistral;
  }
  return ToolEnvelope.OpenAiResponses;
}

export function toolEnvelopeForModel(
  api: string | undefined,
  provider?: string
): ToolEnvelope {
  switch (api) {
    case "anthropic-messages": {
      return ToolEnvelope.Anthropic;
    }
    case "bedrock-converse-stream": {
      return ToolEnvelope.Bedrock;
    }
    case "google-generative-ai":
    case "google-vertex": {
      return ToolEnvelope.Google;
    }
    case "mistral-conversations": {
      return ToolEnvelope.Mistral;
    }
    case "openai-completions": {
      return ToolEnvelope.OpenAiChat;
    }
    case "azure-openai-responses":
    case "openai-codex-responses":
    case "openai-responses": {
      return ToolEnvelope.OpenAiResponses;
    }
    default: {
      return toolEnvelopeForProvider(provider);
    }
  }
}

function buildToolEnvelopeVariants(
  tools: ToolDefinitionInput[]
): ToolEnvelopeVariantPayload[] {
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
  countedEnvelope: ToolEnvelope = ToolEnvelope.Compact
): PromptSection | null {
  if (tools.length === 0) {
    return null;
  }

  const activeSet = activeToolNames ? new Set(activeToolNames) : null;
  const countedTools = activeSet
    ? tools.filter((tool) => activeSet.has(tool.name))
    : tools;
  const inactiveTools = activeSet
    ? tools.filter((tool) => !activeSet.has(tool.name))
    : [];

  function serializeTools(input: ToolDefinitionInput[]): ToolEntry[] {
    return input.map((tool) => {
      const payload =
        countedEnvelope === ToolEnvelope.Compact
          ? createToolSchemaPayload(tool)
          : buildToolEnvelopePayload([tool], countedEnvelope);
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

  const activeEnvelopePayload = buildToolEnvelopePayload(
    countedTools,
    countedEnvelope
  );
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
    children,
  };
}
