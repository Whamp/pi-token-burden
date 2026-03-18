import type {
  ExtensionToolContribution,
  TraceBucket,
  TraceLineEvidence,
} from "./types.js";

/** Known built-in tool names from pi core's toolDescriptions. */
const BUILT_IN_TOOLS = new Set([
  "read",
  "bash",
  "edit",
  "write",
  "grep",
  "find",
  "ls",
]);

/** Known built-in guideline strings (trimmed, without "- " prefix). */
const BUILT_IN_GUIDELINES = new Set([
  "Use bash for file operations like ls, rg, find",
  "Prefer grep/find/ls tools over bash for file exploration (faster, respects .gitignore)",
  "Use read to examine files before editing. You must use this tool instead of cat or sed.",
  "Use edit for precise changes (old text must match exactly)",
  "Use write only for new files or complete rewrites",
  "When summarizing your actions, output plain text directly - do NOT use cat or bash to display what you did",
  "Be concise in your responses",
  "Show file paths clearly when working with files",
]);

/**
 * Normalize a snippet string the same way pi core does:
 * collapse all whitespace (including newlines) to single spaces, then trim.
 */
export function normalizeSnippet(text: string): string {
  return text.replaceAll(/\s+/g, " ").trim();
}

/**
 * Extract the tool name from a "- toolName: snippet" line.
 * Returns empty string if the line doesn't match the pattern.
 */
function extractToolName(line: string): string {
  const match = line.match(/^- (\S+):/);
  return match?.[1] ?? "";
}

/**
 * Extract the guideline text from a "- guideline text" line.
 * Returns the text after "- ", trimmed.
 */
function extractGuidelineText(line: string): string {
  if (line.startsWith("- ")) {
    return line.slice(2).trim();
  }
  return line.trim();
}

interface AttributionResult {
  buckets: TraceBucket[];
  evidence: TraceLineEvidence[];
}

/** Attribute a single line and return evidence. */
function attributeLine(
  line: string,
  kind: "tool-line" | "guideline-line",
  tokenize: (text: string) => number,
  lookupContributors: (line: string) => string[] | undefined,
  isBuiltIn: (line: string) => boolean
): TraceLineEvidence {
  const tokens = tokenize(line);

  if (isBuiltIn(line)) {
    return {
      line,
      tokens,
      kind,
      contributors: ["built-in"],
      bucket: "built-in",
    };
  }

  const contributors = lookupContributors(line);

  if (contributors && contributors.length === 1) {
    return {
      line,
      tokens,
      kind,
      contributors: [...contributors],
      bucket: "extension",
    };
  }
  if (contributors && contributors.length > 1) {
    return {
      line,
      tokens,
      kind,
      contributors: [...contributors],
      bucket: "shared",
    };
  }
  return { line, tokens, kind, contributors: [], bucket: "unattributed" };
}

/** Resolve the bucket id and label from an evidence item. */
function resolveBucketId(e: TraceLineEvidence): { id: string; label: string } {
  if (e.bucket === "built-in") {
    return { id: "built-in", label: "Built-in/core" };
  }
  if (e.bucket === "shared") {
    return { id: "shared", label: "Shared (multi-extension)" };
  }
  if (e.bucket === "unattributed") {
    return { id: "unattributed", label: "Unattributed" };
  }
  const [contributor] = e.contributors;
  return { id: contributor, label: contributor };
}

/**
 * Attribute Base prompt tool and guideline lines to extension sources.
 *
 * Accepts a tokenize function for counting tokens (e.g. estimateTokens).
 */
export function attributeBasePrompt(
  toolLines: string[],
  guidelineLines: string[],
  contributions: ExtensionToolContribution[],
  baseTokens: number,
  tokenize: (text: string) => number = (t) => t.length
): AttributionResult {
  if (toolLines.length === 0 && guidelineLines.length === 0) {
    return { buckets: [], evidence: [] };
  }

  // Build lookup maps from contributions
  const toolSnippetMap = new Map<string, string[]>();
  for (const c of contributions) {
    if (c.snippet) {
      const key = `${c.toolName}:${normalizeSnippet(c.snippet)}`;
      const existing = toolSnippetMap.get(key) ?? [];
      existing.push(c.extensionPath);
      toolSnippetMap.set(key, existing);
    }
  }

  const guidelineMap = new Map<string, string[]>();
  for (const c of contributions) {
    for (const g of c.guidelines) {
      const normalized = g.trim();
      if (normalized.length === 0) {
        continue;
      }
      const existing = guidelineMap.get(normalized) ?? [];
      existing.push(c.extensionPath);
      guidelineMap.set(normalized, existing);
    }
  }

  const evidence: TraceLineEvidence[] = [];

  // Attribute tool lines
  for (const line of toolLines) {
    evidence.push(
      attributeLine(
        line,
        "tool-line",
        tokenize,
        (l) => {
          const toolName = extractToolName(l);
          const snippetPart = l.replace(/^- \S+:\s*/, "");
          const key = `${toolName}:${normalizeSnippet(snippetPart)}`;
          return toolSnippetMap.get(key);
        },
        (l) => BUILT_IN_TOOLS.has(extractToolName(l))
      )
    );
  }

  // Attribute guideline lines
  for (const line of guidelineLines) {
    evidence.push(
      attributeLine(
        line,
        "guideline-line",
        tokenize,
        (l) => guidelineMap.get(extractGuidelineText(l)),
        (l) => BUILT_IN_GUIDELINES.has(extractGuidelineText(l))
      )
    );
  }

  // Aggregate into buckets
  const bucketMap = new Map<
    string,
    { label: string; tokens: number; lineCount: number }
  >();

  for (const e of evidence) {
    const { id, label } = resolveBucketId(e);
    const existing = bucketMap.get(id) ?? { label, tokens: 0, lineCount: 0 };
    existing.tokens += e.tokens;
    existing.lineCount += 1;
    bucketMap.set(id, existing);
  }

  const buckets: TraceBucket[] = [...bucketMap.entries()]
    .map(([id, data]) => ({
      id,
      label: data.label,
      tokens: data.tokens,
      lineCount: data.lineCount,
      pctOfBase: baseTokens > 0 ? (data.tokens / baseTokens) * 100 : 0,
    }))
    .toSorted((a, b) => b.tokens - a.tokens);

  return { buckets, evidence };
}
