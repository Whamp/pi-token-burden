# Context Budget Analyzer — Implementation Plan

> **REQUIRED SUB-SKILL:** Use the executing-plans skill to implement this plan task-by-task.

**Goal:** Build a pi extension that parses the assembled system prompt into sections and displays a token-budget breakdown via a `/context-budget` command with a TUI table.

**Architecture:** A parser module splits the concatenated system prompt string into sections (base prompt, AGENTS.md files, skills frontmatter, SYSTEM.md overrides, metadata) using regex for major boundaries and XML matching for per-skill detail. A formatter module renders the parsed data into a table. The extension entry point registers a `/context-budget` command that calls `ctx.getSystemPrompt()`, parses it, and displays the report via `ctx.ui.custom()`.

**Tech Stack:** TypeScript, `@mariozechner/pi-coding-agent` (ExtensionAPI, DynamicBorder), `@mariozechner/pi-tui` (Container, Text, matchesKey)

---

### Task 1: Parser module — `estimateTokens` + `parseSystemPrompt`

**TDD scenario:** New feature — full TDD cycle.

**Files:**

- Create: `src/parser.ts`
- Create: `src/parser.test.ts`

**Step 1: Write the failing tests**

```typescript
// src/parser.test.ts
import { estimateTokens, parseSystemPrompt } from "./parser.js";
import type { ParsedPrompt } from "./parser.js";

describe("estimateTokens", () => {
  it("returns ceil(chars / 4)", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("abcde")).toBe(2);
    expect(estimateTokens("a")).toBe(1);
  });
});

describe("parseSystemPrompt", () => {
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

  it("parses a full system prompt into sections", () => {
    const prompt =
      basePrompt + agentsBlock + skillsPreamble + skillsBlock + metadata;
    const result: ParsedPrompt = parseSystemPrompt(prompt);

    expect(result.totalChars).toBe(prompt.length);
    expect(result.totalTokens).toBe(Math.ceil(prompt.length / 4));

    const labels = result.sections.map((s) => s.label);
    expect(labels).toContain("Base prompt");
    expect(labels).toContain("AGENTS.md files");
    expect(labels).toContain("Skills (2)");
    expect(labels).toContain("Metadata (date/time, cwd)");
  });

  it("parses AGENTS.md files into children", () => {
    const prompt = basePrompt + agentsBlock + metadata;
    const result = parseSystemPrompt(prompt);

    const agentsSection = result.sections.find((s) =>
      s.label.includes("AGENTS.md")
    );
    expect(agentsSection).toBeDefined();
    expect(agentsSection!.children).toHaveLength(2);
    expect(agentsSection!.children![0].label).toBe(
      "/home/user/.pi/agent/AGENTS.md"
    );
    expect(agentsSection!.children![1].label).toBe(
      "/home/user/project/AGENTS.md"
    );
  });

  it("parses individual skills from XML", () => {
    const prompt = basePrompt + skillsPreamble + skillsBlock + metadata;
    const result = parseSystemPrompt(prompt);

    expect(result.skills).toHaveLength(2);
    expect(result.skills[0].name).toBe("brainstorming");
    expect(result.skills[1].name).toBe("tdd");
    expect(result.skills[0].chars).toBeGreaterThan(0);
    expect(result.skills[0].tokens).toBeGreaterThan(0);

    const skillsSection = result.sections.find((s) =>
      s.label.startsWith("Skills")
    );
    expect(skillsSection!.children).toHaveLength(2);
  });

  it("handles a minimal prompt with no optional sections", () => {
    const prompt = "You are a helpful assistant." + metadata;
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
    expect(systemMdSection!.chars).toBeGreaterThan(0);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `pnpm run test -- src/parser.test.ts`
Expected: FAIL — `src/parser.ts` doesn't exist yet (we'll delete the premature one).

**Step 3: Write minimal implementation**

Create `src/parser.ts` with the `estimateTokens`, `parseSystemPrompt` functions and supporting types. The parser uses:

- String `indexOf` for `# Project Context`, `<available_skills>`, `Current date and time:` boundaries
- Regex `## <path>` matching for AGENTS.md blocks within Project Context
- Regex `<skill>...</skill>` matching for individual skill entries
- Gap detection between base prompt end and next section for SYSTEM.md content

Key types exported: `SkillEntry`, `AgentsFileEntry`, `PromptSection`, `ParsedPrompt`.

**Step 4: Run tests to verify they pass**

Run: `pnpm run test -- src/parser.test.ts`
Expected: PASS (all tests green)

**Step 5: Commit**

```bash
git add src/parser.ts src/parser.test.ts
git commit -m "feat: add system prompt parser with section breakdown"
```

---

### Task 2: Formatter module — `formatReport`

**TDD scenario:** New feature — full TDD cycle.

**Files:**

- Create: `src/formatter.ts`
- Create: `src/formatter.test.ts`

**Step 1: Write the failing tests**

```typescript
// src/formatter.test.ts
import { formatReport, type ReportLine } from "./formatter.js";
import type { ParsedPrompt } from "./parser.js";

describe("formatReport", () => {
  const parsed: ParsedPrompt = {
    totalChars: 10000,
    totalTokens: 2500,
    skills: [],
    sections: [
      { label: "Base prompt", chars: 2000, tokens: 500 },
      {
        label: "AGENTS.md files",
        chars: 4000,
        tokens: 1000,
        children: [
          { label: "/home/user/.pi/agent/AGENTS.md", chars: 1500, tokens: 375 },
          { label: "/home/user/project/AGENTS.md", chars: 2500, tokens: 625 },
        ],
      },
      {
        label: "Skills (2)",
        chars: 3600,
        tokens: 900,
        children: [
          { label: "brainstorming", chars: 1800, tokens: 450 },
          { label: "tdd", chars: 1800, tokens: 450 },
        ],
      },
      { label: "Metadata (date/time, cwd)", chars: 400, tokens: 100 },
    ],
  };

  it("returns a header line with totals", () => {
    const lines = formatReport(parsed);
    const header = lines.find((l) => l.kind === "header");
    expect(header).toBeDefined();
    expect(header!.text).toContain("2,500");
  });

  it("returns one line per top-level section", () => {
    const lines = formatReport(parsed);
    const sectionLines = lines.filter((l) => l.kind === "section");
    expect(sectionLines.length).toBe(4);
  });

  it("returns child lines for sections with children", () => {
    const lines = formatReport(parsed);
    const childLines = lines.filter((l) => l.kind === "child");
    // 2 AGENTS.md children + 2 skill children
    expect(childLines.length).toBe(4);
  });

  it("each line includes a percentage", () => {
    const lines = formatReport(parsed);
    const sectionLines = lines.filter((l) => l.kind === "section");
    for (const line of sectionLines) {
      expect(line.text).toMatch(/\d+\.\d%/);
    }
  });

  it("includes a context window percentage when provided", () => {
    const lines = formatReport(parsed, 200000);
    const header = lines.find((l) => l.kind === "header");
    expect(header!.text).toContain("200,000");
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `pnpm run test -- src/formatter.test.ts`
Expected: FAIL — module not found.

**Step 3: Write minimal implementation**

Create `src/formatter.ts`:

```typescript
import type { ParsedPrompt } from "./parser.js";

export interface ReportLine {
  kind: "header" | "separator" | "section" | "child" | "footer";
  text: string;
}

export function formatReport(
  parsed: ParsedPrompt,
  contextWindow?: number
): ReportLine[] {
  const lines: ReportLine[] = [];
  const { totalTokens, sections } = parsed;

  // Header
  let headerText = `System Prompt: ${fmt(totalTokens)} tokens (${fmt(parsed.totalChars)} chars)`;
  if (contextWindow) {
    const pct = ((totalTokens / contextWindow) * 100).toFixed(1);
    headerText += ` — ${pct}% of ${fmt(contextWindow)} context window`;
  }
  lines.push({ kind: "header", text: headerText });
  lines.push({ kind: "separator", text: "" });

  // Sections
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

function fmt(n: number): string {
  return n.toLocaleString("en-US");
}
```

**Step 4: Run tests to verify they pass**

Run: `pnpm run test -- src/formatter.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/formatter.ts src/formatter.test.ts
git commit -m "feat: add report formatter for parsed prompt sections"
```

---

### Task 3: TUI report component

**TDD scenario:** Trivial UI glue — use judgment. Manual testing with `pi -e ./src/index.ts`.

**Files:**

- Create: `src/report-view.ts`

**Step 1: Write the report view component**

Create `src/report-view.ts` — a function that takes `ParsedPrompt`, optional `contextWindow`, and displays via `ctx.ui.custom()`.

Uses: `Container`, `Text`, `DynamicBorder` from pi-tui/pi-coding-agent. Renders the `formatReport` output with theme colors:

- Header: `theme.bold` + `theme.fg("accent")`
- Section labels: `theme.fg("toolTitle")`
- Token counts: `theme.fg("muted")`
- Percentages: `theme.fg("warning")` for >10%, `theme.fg("dim")` otherwise
- Children: indented with `theme.fg("dim")`
- Footer: `theme.fg("dim", "Press Enter or Esc to close")`

Keyboard: Enter or Escape calls `done(undefined)`.

**Step 2: Commit**

```bash
git add src/report-view.ts
git commit -m "feat: add TUI report view component for context budget"
```

---

### Task 4: Extension entry point — `/context-budget` command

**TDD scenario:** Modifying tested code — run existing test first.

**Files:**

- Modify: `src/index.ts`
- Modify: `src/index.test.ts`

**Step 1: Run existing tests**

Run: `pnpm run test`
Expected: PASS (existing test passes)

**Step 2: Update the test**

```typescript
// src/index.test.ts
describe("extension", () => {
  it("exports a default function", async () => {
    const mod = await import("./index.js");
    expectTypeOf(mod.default).toBeFunction();
  });
});
```

Keep the existing test. The command itself is best tested manually with `pi -e ./src/index.ts`.

**Step 3: Write the extension entry point**

Wire up `src/index.ts`:

```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { parseSystemPrompt } from "./parser.js";
import { showReport } from "./report-view.js";

export default function (pi: ExtensionAPI) {
  pi.registerCommand("context-budget", {
    description: "Show token budget breakdown of the system prompt",
    handler: async (_args, ctx) => {
      const prompt = ctx.getSystemPrompt();
      const parsed = parseSystemPrompt(prompt);

      const usage = ctx.getContextUsage();
      const contextWindow = usage?.contextWindow ?? ctx.model?.contextWindow;

      if (!ctx.hasUI) {
        // Print mode fallback
        return;
      }

      await showReport(parsed, contextWindow, ctx);
    },
  });
}
```

**Step 4: Run all tests**

Run: `pnpm run test`
Expected: PASS

**Step 5: Commit**

```bash
git add src/index.ts src/index.test.ts
git commit -m "feat: register /context-budget command"
```

---

### Task 5: Full check + manual test

**TDD scenario:** Integration verification.

**Files:** None modified.

**Step 1: Run full check suite**

Run: `pnpm run check`
Expected: All checks pass (lint, typecheck, format, dead code, duplicates, secrets, tests).

**Step 2: Fix any issues**

Fix lint, format, or typecheck errors. Re-run `pnpm run check` until clean.

**Step 3: Manual test**

Run: `pi -e ./src/index.ts`
Then type: `/context-budget`
Expected: TUI table showing system prompt breakdown by section.

**Step 4: Final commit**

```bash
git add -A
git commit -m "chore: pass all checks"
```

---

### Summary

| Task | Description              | Depends On |
| ---- | ------------------------ | ---------- |
| 1    | Parser module (TDD)      | —          |
| 2    | Formatter module (TDD)   | 1          |
| 3    | TUI report view          | 2          |
| 4    | Extension entry point    | 1, 3       |
| 5    | Full check + manual test | 1–4        |
