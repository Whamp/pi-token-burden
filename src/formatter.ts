import type { ParsedPrompt, ReportLine } from "./types.js";

export type { ReportLine };

function fmt(n: number): string {
  return n.toLocaleString("en-US");
}

export function formatReport(
  parsed: ParsedPrompt,
  contextWindow?: number
): ReportLine[] {
  const lines: ReportLine[] = [];
  const { totalTokens, sections } = parsed;

  let headerText = `System Prompt: ${fmt(totalTokens)} tokens (${fmt(parsed.totalChars)} chars)`;
  if (contextWindow) {
    const pct = ((totalTokens / contextWindow) * 100).toFixed(1);
    headerText += ` — ${pct}% of ${fmt(contextWindow)} context window`;
  }
  lines.push({ kind: "header", text: headerText });
  lines.push({ kind: "separator", text: "" });

  for (const section of sections) {
    const pct = ((section.tokens / totalTokens) * 100).toFixed(1);
    lines.push({
      kind: "section",
      text: `${section.label}  ${fmt(section.tokens)} tokens  ${pct}%`,
    });

    if (section.children) {
      for (const child of section.children) {
        const childPct = ((child.tokens / totalTokens) * 100).toFixed(1);
        lines.push({
          kind: "child",
          text: `  ${child.label}  ${fmt(child.tokens)} tokens  ${childPct}%`,
        });
      }
    }
  }

  return lines;
}
