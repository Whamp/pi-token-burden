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

import type {
  AgentsFileEntry,
  ParsedPrompt,
  PromptSection,
  SkillEntry,
} from "./types.js";

export type { ParsedPrompt };

/** Token count using BPE tokenization (o200k_base encoding). */
export function estimateTokens(text: string): number {
  return encode(text).length;
}

// ---------------------------------------------------------------------------
// Internal helpers (defined before use to satisfy no-use-before-define)
// ---------------------------------------------------------------------------

function measure(label: string, text: string): PromptSection {
  return { label, chars: text.length, tokens: estimateTokens(text) };
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

/** Parse `## /path/to/AGENTS.md` blocks inside the Project Context section. */
function parseAgentsFiles(contextBlock: string): AgentsFileEntry[] {
  const files: AgentsFileEntry[] = [];
  // Match `## ` headings that look like file paths (start with `/`).
  const headingPattern = /^## (\/.+)$/gm;
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
 *   - `Current date and time:` footer
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
  const dateLineIdx = prompt.lastIndexOf("\nCurrent date and time:");

  // 1. Base system prompt
  const baseEnd = findBasePromptEnd(
    prompt,
    projectCtxIdx,
    skillsPreambleIdx,
    dateLineIdx
  );
  const baseText = baseEnd >= 0 ? prompt.slice(0, baseEnd) : prompt;
  sections.push(measure("Base prompt", baseText));

  // 2. Project Context / AGENTS.md files
  if (projectCtxIdx !== -1) {
    const contextStart = projectCtxIdx + 2; // skip leading \n\n
    const contextEnd = firstPositive(skillsPreambleIdx, dateLineIdx);
    const contextBlock =
      contextEnd >= 0
        ? prompt.slice(contextStart, contextEnd)
        : prompt.slice(contextStart);

    const agentsFiles = parseAgentsFiles(contextBlock);
    const children = agentsFiles.map((f) => ({
      label: f.path,
      chars: f.chars,
      tokens: f.tokens,
    }));

    sections.push({
      ...measure("AGENTS.md files", contextBlock),
      children,
    });
  }

  // 3. Skills section
  if (skillsPreambleIdx !== -1) {
    const skillsSectionStart = skillsPreambleIdx + 2;
    const skillsSectionEnd = findSkillsSectionEnd(
      availableSkillsEnd,
      dateLineIdx,
      prompt.length
    );
    const skillsSectionText = prompt.slice(
      skillsSectionStart,
      skillsSectionEnd
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
      ...measure(`Skills (${String(skills.length)})`, skillsSectionText),
      children,
    });
  }

  // 4. Metadata footer
  if (dateLineIdx !== -1) {
    const metaText = prompt.slice(dateLineIdx + 1);
    sections.push(measure("Metadata (date/time, cwd)", metaText));
  }

  // 5. Detect SYSTEM.md / APPEND_SYSTEM.md gap
  const nextSectionStart =
    projectCtxIdx === -1 ? skillsPreambleIdx : projectCtxIdx;

  if (baseEnd >= 0 && nextSectionStart >= 0 && nextSectionStart > baseEnd) {
    const gap = prompt.slice(baseEnd, nextSectionStart);
    const trimmed = gap.trim();
    if (trimmed.length > 0) {
      sections.splice(1, 0, measure("SYSTEM.md / APPEND_SYSTEM.md", trimmed));
    }
  }

  const totalChars = prompt.length;
  const totalTokens = estimateTokens(prompt);

  return { sections, totalChars, totalTokens, skills };
}
