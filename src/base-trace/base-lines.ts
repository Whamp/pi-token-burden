import type { BaseLines } from "./types.js";

/**
 * Extract tool and guideline bullet lines from Base prompt text.
 *
 * Looks for:
 *   "Available tools:" → bullet lines until blank line or "In addition to"
 *   "Guidelines:" → bullet lines until blank line or "Pi documentation"
 */
export function extractBaseLines(baseText: string): BaseLines {
  const lines = baseText.split("\n");
  const toolLines: string[] = [];
  const guidelineLines: string[] = [];

  let section: "none" | "tools" | "guidelines" = "none";

  for (const line of lines) {
    if (line.startsWith("Available tools:")) {
      section = "tools";
      continue;
    }

    if (line.startsWith("Guidelines:")) {
      section = "guidelines";
      continue;
    }

    if (line.startsWith("In addition to the tools above")) {
      section = "none";
      continue;
    }

    if (line.startsWith("Pi documentation")) {
      section = "none";
      continue;
    }

    if (section === "tools") {
      if (line.startsWith("- ")) {
        toolLines.push(line);
      } else if (line.trim() === "") {
        if (toolLines.length > 0) {
          section = "none";
        }
      }
    }

    if (section === "guidelines") {
      if (line.startsWith("- ")) {
        guidelineLines.push(line);
      } else if (line.trim() === "") {
        if (guidelineLines.length > 0) {
          section = "none";
        }
      }
    }
  }

  return { toolLines, guidelineLines };
}
