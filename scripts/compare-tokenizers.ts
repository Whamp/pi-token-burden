/**
 * Compare the ceil(chars/4) heuristic against real BPE tokenizers.
 *
 * Usage:
 *   pnpm tsx scripts/compare-tokenizers.ts                    # use embedded sample
 *   pnpm tsx scripts/compare-tokenizers.ts path/to/prompt.txt # use real captured prompt
 *
 * To capture a real system prompt, add this to an extension or one-off script:
 *   const prompt = ctx.getSystemPrompt();
 *   fs.writeFileSync("prompt-dump.txt", prompt);
 * Then pass that file as the argument.
 */

import { readFileSync, existsSync } from "node:fs";

import { encode as encode_cl100k } from "gpt-tokenizer/encoding/cl100k_base";
// Each encoding is imported separately to keep things explicit
import { encode as encode_o200k } from "gpt-tokenizer/encoding/o200k_base";
import { encode as encode_p50k } from "gpt-tokenizer/encoding/p50k_base";
import { encode as encode_r50k } from "gpt-tokenizer/encoding/r50k_base";

// ---------------------------------------------------------------------------
// Heuristic (current implementation)
// ---------------------------------------------------------------------------

function heuristicTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// ---------------------------------------------------------------------------
// Encodings to compare
// ---------------------------------------------------------------------------

interface Encoding {
  name: string;
  models: string;
  encode: (text: string) => number[];
}

const encodings: Encoding[] = [
  {
    name: "o200k_base",
    models: "GPT-4o, o1, o3, o4, GPT-4.1",
    encode: encode_o200k,
  },
  {
    name: "cl100k_base",
    models: "GPT-4, GPT-3.5-turbo",
    encode: encode_cl100k,
  },
  {
    name: "p50k_base",
    models: "text-davinci-003, Codex",
    encode: encode_p50k,
  },
  {
    name: "r50k_base",
    models: "text-davinci-001, GPT-3",
    encode: encode_r50k,
  },
];

// ---------------------------------------------------------------------------
// Test samples
// ---------------------------------------------------------------------------

const SAMPLE_SYSTEM_PROMPT = `You are an expert coding assistant operating inside pi, a coding agent harness. You help users by reading files, executing commands, editing code, and writing new files.

Available tools:
- bash: Execute bash commands (ls, grep, find, etc.)
- edit: Make surgical edits to files (find exact text and replace)
- write: Create or overwrite files
- read: Read file contents

Guidelines:
- Use bash for file operations like ls, rg, find
- Use read to examine files before editing
- Use edit for precise changes (old text must match exactly)
- Use write only for new files or complete rewrites
- Be concise in your responses

# Project Context

## /home/user/project/AGENTS.md

# Project Agent Guidelines

## Before Acting
- Read files before editing. Read ENTIRE files when claiming to review them.
- If user references a specific file/path, open and inspect it before explaining.
- Understand existing style, conventions, and abstractions before implementing.

## Implementation
- Prefer the simplest change that solves the problem.
- Code readability matters most.
- No \`any\` types unless absolutely necessary.
- Never disable linter rules. Fix them.

\`\`\`typescript
export function parseSystemPrompt(prompt: string): ParsedPrompt {
  const sections: PromptSection[] = [];
  const skills: SkillEntry[] = [];
  const projectCtxIdx = prompt.indexOf("\\n\\n# Project Context\\n");
  return { sections, totalChars: prompt.length, totalTokens: estimateTokens(prompt), skills };
}
\`\`\`

<available_skills>
  <skill>
    <name>brainstorming</name>
    <description>You MUST use this before any creative work - creating features, building components, adding functionality, or modifying behavior. Explores user intent, requirements and design before implementation.</description>
    <location>/home/user/.local/lib/node_modules/pi-superpowers-plus/skills/brainstorming/SKILL.md</location>
  </skill>
  <skill>
    <name>test-driven-development</name>
    <description>Use when implementing any feature or bugfix, before writing implementation code</description>
    <location>/home/user/.local/lib/node_modules/pi-superpowers-plus/skills/test-driven-development/SKILL.md</location>
  </skill>
  <skill>
    <name>systematic-debugging</name>
    <description>Use when encountering any bug, test failure, or unexpected behavior, before proposing fixes</description>
    <location>/home/user/.local/lib/node_modules/pi-superpowers-plus/skills/systematic-debugging/SKILL.md</location>
  </skill>
</available_skills>
Current date and time: Thursday, February 26, 2026 at 09:14:39 PM PST
Current working directory: /home/user/projects/my-project
`;

// ---------------------------------------------------------------------------
// Comparison logic
// ---------------------------------------------------------------------------

interface ComparisonRow {
  encoding: string;
  models: string;
  bpeTokens: number;
  heuristic: number;
  delta: number;
  errorPct: string;
  encodeMs: string;
}

function compare(label: string, text: string): void {
  const chars = text.length;
  const heuristic = heuristicTokens(text);

  console.log(`\n${"=".repeat(72)}`);
  console.log(`  ${label}`);
  console.log(
    `  Characters: ${chars.toLocaleString()}  |  Heuristic estimate: ${heuristic.toLocaleString()} tokens`
  );
  console.log(`${"=".repeat(72)}`);

  const rows: ComparisonRow[] = [];

  for (const enc of encodings) {
    const start = performance.now();
    const tokens = enc.encode(text);
    const elapsed = performance.now() - start;
    const bpeTokens = tokens.length;
    const delta = heuristic - bpeTokens;
    const errorPct =
      bpeTokens > 0 ? ((delta / bpeTokens) * 100).toFixed(1) : "N/A";

    rows.push({
      encoding: enc.name,
      models: enc.models,
      bpeTokens,
      heuristic,
      delta,
      errorPct: `${errorPct}%`,
      encodeMs: `${elapsed.toFixed(1)}ms`,
    });
  }

  // Print table
  const colWidths = {
    encoding: 14,
    models: 30,
    bpe: 10,
    heuristic: 10,
    delta: 8,
    error: 10,
    time: 10,
  };

  const header = [
    "Encoding".padEnd(colWidths.encoding),
    "Models".padEnd(colWidths.models),
    "BPE".padStart(colWidths.bpe),
    "Heuristic".padStart(colWidths.heuristic),
    "Delta".padStart(colWidths.delta),
    "Error %".padStart(colWidths.error),
    "Time".padStart(colWidths.time),
  ].join("  ");

  console.log();
  console.log(header);
  console.log("-".repeat(header.length));

  for (const row of rows) {
    console.log(
      [
        row.encoding.padEnd(colWidths.encoding),
        row.models.padEnd(colWidths.models),
        String(row.bpeTokens).padStart(colWidths.bpe),
        String(row.heuristic).padStart(colWidths.heuristic),
        (row.delta >= 0 ? `+${row.delta}` : String(row.delta)).padStart(
          colWidths.delta
        ),
        row.errorPct.padStart(colWidths.error),
        row.encodeMs.padStart(colWidths.time),
      ].join("  ")
    );
  }

  // Summary statistics
  console.log();
  const bpeValues = rows.map((r) => r.bpeTokens);
  const minBpe = Math.min(...bpeValues);
  const maxBpe = Math.max(...bpeValues);

  let bpeSum = 0;
  for (const v of bpeValues) {
    bpeSum += v;
  }
  const avgBpe = bpeSum / bpeValues.length;

  let errorSum = 0;
  for (const r of rows) {
    const bpe = r.bpeTokens;
    if (bpe > 0) {
      errorSum += Math.abs(r.delta / bpe) * 100;
    }
  }
  const avgError = errorSum / rows.length;

  console.log(
    `  BPE range: ${minBpe.toLocaleString()} – ${maxBpe.toLocaleString()} tokens`
  );
  console.log(`  BPE mean:  ${Math.round(avgBpe).toLocaleString()} tokens`);
  console.log(`  Chars/token ratio (BPE mean): ${(chars / avgBpe).toFixed(2)}`);
  console.log(`  Avg |error|: ${avgError.toFixed(1)}%`);
  console.log(
    `  Heuristic direction: ${heuristic > avgBpe ? "OVERESTIMATES" : "UNDERESTIMATES"} by ~${Math.abs(Math.round(((heuristic - avgBpe) / avgBpe) * 100))}%`
  );
}

// ---------------------------------------------------------------------------
// Segmented analysis — break the prompt into section types
// ---------------------------------------------------------------------------

function segmentedAnalysis(text: string): void {
  console.log(`\n${"=".repeat(72)}`);
  console.log("  Segmented Analysis: Heuristic Error by Content Type");
  console.log(`${"=".repeat(72)}\n`);

  // Extract segments from the prompt
  const segments: { label: string; text: string }[] = [];

  // Try to find code blocks
  const codeBlockRegex = /```[\s\S]*?```/g;
  const codeBlocks = text.match(codeBlockRegex);
  if (codeBlocks) {
    segments.push({ label: "Code blocks", text: codeBlocks.join("\n") });
  }

  // XML/skill blocks
  const skillRegex = /<skill>[\s\S]*?<\/skill>/g;
  const skillBlocks = text.match(skillRegex);
  if (skillBlocks) {
    segments.push({ label: "Skill XML entries", text: skillBlocks.join("\n") });
  }

  // Prose (rough: lines that don't start with special chars)
  const lines = text.split("\n");
  const proseLines = lines.filter(
    (l) =>
      l.length > 20 &&
      !l.startsWith("#") &&
      !l.startsWith("-") &&
      !l.startsWith("<") &&
      !l.startsWith("```") &&
      !l.startsWith("  ")
  );
  if (proseLines.length > 0) {
    segments.push({ label: "Prose lines", text: proseLines.join("\n") });
  }

  // Markdown headings + list items
  const structLines = lines.filter(
    (l) => l.startsWith("#") || l.startsWith("- ")
  );
  if (structLines.length > 0) {
    segments.push({
      label: "Headings + list items",
      text: structLines.join("\n"),
    });
  }

  // Use o200k_base as the reference encoding
  const header = [
    "Segment".padEnd(25),
    "Chars".padStart(8),
    "BPE".padStart(8),
    "Heur.".padStart(8),
    "Error".padStart(8),
    "Chars/Tok".padStart(10),
  ].join("  ");

  console.log(header);
  console.log("-".repeat(header.length));

  for (const seg of segments) {
    const bpe = encode_o200k(seg.text).length;
    const heur = heuristicTokens(seg.text);
    const delta = heur - bpe;
    const errorPct = bpe > 0 ? ((delta / bpe) * 100).toFixed(1) : "N/A";
    const charsPerTok = bpe > 0 ? (seg.text.length / bpe).toFixed(2) : "N/A";

    console.log(
      [
        seg.label.padEnd(25),
        String(seg.text.length).padStart(8),
        String(bpe).padStart(8),
        String(heur).padStart(8),
        `${errorPct}%`.padStart(8),
        String(charsPerTok).padStart(10),
      ].join("  ")
    );
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  console.log("Token Estimator Comparison: ceil(chars/4) vs BPE Tokenizers");
  console.log("============================================================");

  const [filePath] = process.argv.slice(2);
  let promptText: string;

  if (filePath && existsSync(filePath)) {
    promptText = readFileSync(filePath, "utf8");
    console.log(`\nLoaded real prompt from: ${filePath}`);
  } else {
    promptText = SAMPLE_SYSTEM_PROMPT;
    if (filePath) {
      console.log(`\nFile not found: ${filePath} — using embedded sample`);
    } else {
      console.log("\nNo file provided — using embedded sample system prompt");
    }
    console.log(
      "Tip: capture a real prompt with ctx.getSystemPrompt() and pass it as an argument."
    );
  }

  // Full prompt comparison
  compare("Full System Prompt", promptText);

  // Segmented analysis
  segmentedAnalysis(promptText);

  // Recommendation
  console.log(`\n${"=".repeat(72)}`);
  console.log("  Recommendation");
  console.log(`${"=".repeat(72)}\n`);

  const bpe_o200k = encode_o200k(promptText).length;
  const heur = heuristicTokens(promptText);
  const errorPct = Math.abs(((heur - bpe_o200k) / bpe_o200k) * 100);

  if (errorPct < 10) {
    console.log(
      `  The heuristic is within ${errorPct.toFixed(1)}% of o200k_base BPE.`
    );
    console.log("  For a budget visualization tool, this may be acceptable.");
  } else {
    console.log(
      `  The heuristic deviates ${errorPct.toFixed(1)}% from o200k_base BPE.`
    );
    console.log(
      "  Consider switching to gpt-tokenizer for more accurate estimates."
    );
  }

  console.log(
    `  Note: pi serves multiple models (Claude, Gemini, GPT). No single BPE`
  );
  console.log(
    `  encoding is exact for all. o200k_base is a strong default for modern models.`
  );
  console.log();
}

main();
