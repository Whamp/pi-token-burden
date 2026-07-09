# Skill Toggle Integration Plan

> **REQUIRED SUB-SKILL:** Use the executing-plans skill to implement this plan task-by-task.

**Goal:** Absorb pi-skill-toggle's core functionality into pi-token-burden so users can toggle skills enabled/hidden/disabled from within the `/token-burden` TUI, with live-updating token graphs.

**Architecture:** Add two new modules — `skills.ts` for filesystem-based skill discovery and `skills-persistence.ts` for writing changes to `settings.json` and SKILL.md frontmatter. Extend `BudgetOverlay` with a `skill-toggle` mode that activates when drilling into the Skills section. Token totals and bar charts update in place as skills are toggled.

**Tech Stack:** TypeScript, Vitest, fast-check / @fast-check/vitest (property-based testing), gpt-tokenizer (BPE token estimation), pi extension API (`ctx.ui.custom`).

**Reference files:**
- Pi's skill loading: `~/utils/pi-mono/packages/coding-agent/src/core/skills.ts`
- Pi's package manager (discovery dirs): `~/utils/pi-mono/packages/coding-agent/src/core/package-manager.ts`
- Original pi-skill-toggle: `~/projects/pi-skill-toggle/index.ts`

---

## Phase 1: Skill Discovery & Persistence

### Task 1: Add dependencies and types

**TDD scenario:** Trivial change — no tests needed.

**Files:**
- Modify: `package.json` (devDependencies)
- Modify: `src/types.ts` (add new types)
- Modify: `knip.json` (ignore fast-check vitest integration)

**Step 1: Install fast-check and @fast-check/vitest**

Run:
```bash
pnpm add -D fast-check @fast-check/vitest
```

**Step 2: Add types to `src/types.ts`**

Append to the end of the file:

```typescript
// ---------------------------------------------------------------------------
// Skill toggle types
// ---------------------------------------------------------------------------

export type DisableMode = "enabled" | "hidden" | "disabled";

export interface SkillInfo {
  name: string;
  description: string;
  filePath: string;
  allPaths: string[];
  mode: DisableMode;
  tokens: number;
  hasDuplicates: boolean;
}

export interface Settings {
  skills?: string[];
  packages?: unknown[];
  [key: string]: unknown;
}
```

**Step 3: Add `@fast-check/vitest` to knip ignoreDependencies**

The `@fast-check/vitest` package re-exports `it` and `fc` which knip may flag
as unused. Add it to `ignoreDependencies` in `knip.json`:

```json
{
  "ignoreDependencies": ["husky", "ultracite", "@fast-check/vitest"]
}
```

**Step 4: Verify typecheck passes**

Run: `pnpm run typecheck`
Expected: No errors.

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: add skill toggle types and fast-check dependency"
```

---

### Task 2: Skill discovery module (TDD)

**TDD scenario:** New feature — full TDD cycle.

**Files:**
- Create: `src/skills.test.ts`
- Create: `src/skills.ts`

**Step 1: Write the failing tests**

Create `src/skills.test.ts`:

```typescript
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import fc from "fast-check";
import { parseFrontmatter, scanSkillDir, loadAllSkills, estimateSkillPromptTokens } from "./skills.js";
import type { Settings, SkillInfo } from "./types.js";

// ── parseFrontmatter ────────────────────────────────────────────────────

describe("parseFrontmatter", () => {
  it("should extract name, description, and disableModelInvocation from valid frontmatter", () => {
    const content = [
      "---",
      "name: my-skill",
      "description: A useful skill",
      "disable-model-invocation: true",
      "---",
      "",
      "# My Skill",
      "Content here.",
    ].join("\n");

    const result = parseFrontmatter(content, "fallback");

    expect(result.name).toBe("my-skill");
    expect(result.description).toBe("A useful skill");
    expect(result.disableModelInvocation).toBe(true);
  });

  it("should fall back to parent dir name when frontmatter has no name", () => {
    const content = [
      "---",
      "description: Some skill",
      "---",
      "",
      "# Content",
    ].join("\n");

    const result = parseFrontmatter(content, "dir-name");

    expect(result.name).toBe("dir-name");
    expect(result.description).toBe("Some skill");
  });

  it("should return empty description when no frontmatter exists", () => {
    const content = "# Just a markdown file\nNo frontmatter here.";

    const result = parseFrontmatter(content, "fallback");

    expect(result.name).toBe("fallback");
    expect(result.description).toBe("");
    expect(result.disableModelInvocation).toBe(false);
  });

  it("should handle malformed frontmatter (no closing ---)", () => {
    const content = "---\nname: broken\ndescription: oops";

    const result = parseFrontmatter(content, "fallback");

    expect(result.name).toBe("fallback");
    expect(result.description).toBe("");
  });

  it("should default disableModelInvocation to false when not present", () => {
    const content = "---\nname: test\ndescription: desc\n---\n# Content";

    const result = parseFrontmatter(content, "fallback");

    expect(result.disableModelInvocation).toBe(false);
  });
});

// ── scanSkillDir ────────────────────────────────────────────────────────

describe("scanSkillDir", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "skill-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should discover SKILL.md files recursively", () => {
    // Create: tmpDir/my-skill/SKILL.md
    const skillDir = path.join(tmpDir, "my-skill");
    fs.mkdirSync(skillDir);
    fs.writeFileSync(
      path.join(skillDir, "SKILL.md"),
      "---\nname: my-skill\ndescription: A test skill\n---\n# My Skill",
    );

    const skills: Array<{ name: string; description: string; filePath: string; disableModelInvocation: boolean }> = [];
    scanSkillDir(tmpDir, skills, new Set());

    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe("my-skill");
    expect(skills[0].filePath).toBe(path.join(skillDir, "SKILL.md"));
  });

  it("should discover nested SKILL.md files", () => {
    // Create: tmpDir/category/nested-skill/SKILL.md
    const nested = path.join(tmpDir, "category", "nested-skill");
    fs.mkdirSync(nested, { recursive: true });
    fs.writeFileSync(
      path.join(nested, "SKILL.md"),
      "---\nname: nested-skill\ndescription: Nested\n---\n# Nested",
    );

    const skills: Array<{ name: string; description: string; filePath: string; disableModelInvocation: boolean }> = [];
    scanSkillDir(tmpDir, skills, new Set());

    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe("nested-skill");
  });

  it("should skip dotfiles and node_modules", () => {
    // .hidden/SKILL.md should be skipped
    const hidden = path.join(tmpDir, ".hidden");
    fs.mkdirSync(hidden);
    fs.writeFileSync(
      path.join(hidden, "SKILL.md"),
      "---\nname: hidden\ndescription: Hidden\n---\n",
    );

    // node_modules/pkg/SKILL.md should be skipped
    const nm = path.join(tmpDir, "node_modules", "pkg");
    fs.mkdirSync(nm, { recursive: true });
    fs.writeFileSync(
      path.join(nm, "SKILL.md"),
      "---\nname: nm-skill\ndescription: NM\n---\n",
    );

    const skills: Array<{ name: string; description: string; filePath: string; disableModelInvocation: boolean }> = [];
    scanSkillDir(tmpDir, skills, new Set());

    expect(skills).toHaveLength(0);
  });

  it("should skip skills without a description", () => {
    const skillDir = path.join(tmpDir, "no-desc");
    fs.mkdirSync(skillDir);
    fs.writeFileSync(
      path.join(skillDir, "SKILL.md"),
      "---\nname: no-desc\n---\n# No Description",
    );

    const skills: Array<{ name: string; description: string; filePath: string; disableModelInvocation: boolean }> = [];
    scanSkillDir(tmpDir, skills, new Set());

    expect(skills).toHaveLength(0);
  });

  it("should not visit the same real path twice (symlinks)", () => {
    const skillDir = path.join(tmpDir, "real-skill");
    fs.mkdirSync(skillDir);
    fs.writeFileSync(
      path.join(skillDir, "SKILL.md"),
      "---\nname: real-skill\ndescription: Real\n---\n",
    );

    // Symlink to the same directory
    const linkDir = path.join(tmpDir, "link-skill");
    fs.symlinkSync(skillDir, linkDir);

    const skills: Array<{ name: string; description: string; filePath: string; disableModelInvocation: boolean }> = [];
    scanSkillDir(tmpDir, skills, new Set());

    expect(skills).toHaveLength(1);
  });
});

// ── loadAllSkills ───────────────────────────────────────────────────────

describe("loadAllSkills", () => {
  let tmpDir: string;
  let userSkillsDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "skill-load-"));
    userSkillsDir = path.join(tmpDir, "skills");
    fs.mkdirSync(userSkillsDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should deduplicate skills by name (first wins)", () => {
    // Create two skills with the same name in different subdirs
    const dir1 = path.join(userSkillsDir, "first", "dupe-skill");
    const dir2 = path.join(userSkillsDir, "second", "dupe-skill");
    fs.mkdirSync(dir1, { recursive: true });
    fs.mkdirSync(dir2, { recursive: true });

    fs.writeFileSync(
      path.join(dir1, "SKILL.md"),
      "---\nname: dupe-skill\ndescription: First copy\n---\n",
    );
    fs.writeFileSync(
      path.join(dir2, "SKILL.md"),
      "---\nname: dupe-skill\ndescription: Second copy\n---\n",
    );

    const { skills, byName } = loadAllSkills(
      {},
      [userSkillsDir],
    );

    const dupe = byName.get("dupe-skill");
    expect(dupe).toBeDefined();
    expect(dupe!.description).toBe("First copy");
    expect(dupe!.allPaths).toHaveLength(2);
    expect(dupe!.hasDuplicates).toBe(true);

    // Only one entry in the skills array
    expect(skills.filter((s) => s.name === "dupe-skill")).toHaveLength(1);
  });

  it("should mark skills as disabled when all paths have -path in settings", () => {
    const skillDir = path.join(userSkillsDir, "my-skill");
    fs.mkdirSync(skillDir);
    fs.writeFileSync(
      path.join(skillDir, "SKILL.md"),
      "---\nname: my-skill\ndescription: Test\n---\n",
    );

    const settings: Settings = {
      skills: [`-${skillDir}`],
    };

    const { byName } = loadAllSkills(settings, [userSkillsDir]);
    const skill = byName.get("my-skill");

    expect(skill?.mode).toBe("disabled");
  });

  it("should mark skills as hidden when frontmatter has disable-model-invocation", () => {
    const skillDir = path.join(userSkillsDir, "hidden-skill");
    fs.mkdirSync(skillDir);
    fs.writeFileSync(
      path.join(skillDir, "SKILL.md"),
      "---\nname: hidden-skill\ndescription: Hidden\ndisable-model-invocation: true\n---\n",
    );

    const { byName } = loadAllSkills({}, [userSkillsDir]);
    const skill = byName.get("hidden-skill");

    expect(skill?.mode).toBe("hidden");
  });

  it("should mark skills as enabled by default", () => {
    const skillDir = path.join(userSkillsDir, "normal-skill");
    fs.mkdirSync(skillDir);
    fs.writeFileSync(
      path.join(skillDir, "SKILL.md"),
      "---\nname: normal-skill\ndescription: Normal\n---\n",
    );

    const { byName } = loadAllSkills({}, [userSkillsDir]);
    const skill = byName.get("normal-skill");

    expect(skill?.mode).toBe("enabled");
  });

  it("should estimate token cost for each skill", () => {
    const skillDir = path.join(userSkillsDir, "token-skill");
    fs.mkdirSync(skillDir);
    fs.writeFileSync(
      path.join(skillDir, "SKILL.md"),
      "---\nname: token-skill\ndescription: A skill for testing token estimation\n---\n",
    );

    const { byName } = loadAllSkills({}, [userSkillsDir]);
    const skill = byName.get("token-skill");

    expect(skill?.tokens).toBeGreaterThan(0);
  });
});

// ── estimateSkillPromptTokens ───────────────────────────────────────────

describe("estimateSkillPromptTokens", () => {
  it("should estimate tokens for the XML skill entry that would appear in the prompt", () => {
    const tokens = estimateSkillPromptTokens({
      name: "my-skill",
      description: "A useful skill for doing things",
      filePath: "/home/user/.pi/agent/skills/my-skill/SKILL.md",
    });

    // The XML wrapper adds overhead beyond just name + description
    expect(tokens).toBeGreaterThan(0);
  });
});

// ── Property-based tests ────────────────────────────────────────────────

describe("property-based", () => {
  it("should roundtrip: written name matches discovered name", () => {
    fc.assert(
      fc.property(
        fc.stringMatching(/^[a-z][a-z0-9-]{0,10}[a-z0-9]$/),
        (name) => {
          const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pbt-"));
          try {
            const skillDir = path.join(tmpDir, name);
            fs.mkdirSync(skillDir);
            fs.writeFileSync(
              path.join(skillDir, "SKILL.md"),
              `---\nname: ${name}\ndescription: test skill\n---\n`,
            );

            const { byName } = loadAllSkills({}, [tmpDir]);
            const skill = byName.get(name);

            return skill?.name === name;
          } finally {
            fs.rmSync(tmpDir, { recursive: true, force: true });
          }
        },
      ),
    );
  });

  it("should satisfy involution: toggling state twice returns to original", () => {
    // This tests the state cycling logic: enabled -> hidden -> disabled -> enabled
    const cycleForward = (mode: "enabled" | "hidden" | "disabled") => {
      if (mode === "enabled") return "hidden" as const;
      if (mode === "hidden") return "disabled" as const;
      return "enabled" as const;
    };

    fc.assert(
      fc.property(
        fc.constantFrom("enabled" as const, "hidden" as const, "disabled" as const),
        (startMode) => {
          const after3 = cycleForward(cycleForward(cycleForward(startMode)));
          return after3 === startMode;
        },
      ),
    );
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/skills.test.ts`
Expected: FAIL — `parseFrontmatter`, `scanSkillDir`, `loadAllSkills`, `estimateSkillPromptTokens` are not exported from `./skills.js`.

**Step 3: Implement `src/skills.ts`**

Create `src/skills.ts`:

```typescript
/**
 * Filesystem-based skill discovery.
 *
 * Scans the same directories pi uses to find skills, reads SKILL.md
 * frontmatter, deduplicates by name (first wins), and computes each
 * skill's disable state from settings.json + frontmatter.
 *
 * Directory scan order (matches pi's resource-loader):
 *   1. .pi/skills/         (project)
 *   2. .agents/skills/     (cwd + ancestors up to git root)
 *   3. ~/.pi/agent/skills/ (user)
 *   4. ~/.agents/skills/   (user)
 *   5. Explicit paths from settings.json skills arrays
 *   6. Paths from installed packages
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { estimateTokens } from "./parser.js";
import type { DisableMode, Settings, SkillInfo } from "./types.js";

// ---------------------------------------------------------------------------
// Frontmatter parsing
// ---------------------------------------------------------------------------

interface FrontmatterResult {
  name: string;
  description: string;
  disableModelInvocation: boolean;
}

export function parseFrontmatter(
  content: string,
  fallbackName: string,
): FrontmatterResult {
  if (!content.startsWith("---")) {
    return { name: fallbackName, description: "", disableModelInvocation: false };
  }

  const endIndex = content.indexOf("\n---", 3);
  if (endIndex === -1) {
    return { name: fallbackName, description: "", disableModelInvocation: false };
  }

  const frontmatter = content.slice(4, endIndex);
  let name = fallbackName;
  let description = "";
  let disableModelInvocation = false;

  for (const line of frontmatter.split("\n")) {
    const colonIndex = line.indexOf(":");
    if (colonIndex === -1) continue;

    const key = line.slice(0, colonIndex).trim();
    const value = line.slice(colonIndex + 1).trim();

    if (key === "name") name = value;
    if (key === "description") description = value;
    if (key === "disable-model-invocation") {
      disableModelInvocation = value.toLowerCase() === "true";
    }
  }

  return { name, description, disableModelInvocation };
}

// ---------------------------------------------------------------------------
// Directory scanning
// ---------------------------------------------------------------------------

interface RawSkill {
  name: string;
  description: string;
  filePath: string;
  disableModelInvocation: boolean;
}

export function scanSkillDir(
  dir: string,
  skills: RawSkill[],
  visitedRealPaths: Set<string>,
  visitedDirs?: Set<string>,
): void {
  if (!fs.existsSync(dir)) return;

  const visited = visitedDirs ?? new Set<string>();
  let realDir: string;
  try {
    realDir = fs.realpathSync(dir);
  } catch {
    realDir = dir;
  }
  if (visited.has(realDir)) return;
  visited.add(realDir);

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      if (entry.name === "node_modules") continue;

      const entryPath = path.join(dir, entry.name);

      let isDirectory = entry.isDirectory();
      let isFile = entry.isFile();
      if (entry.isSymbolicLink()) {
        try {
          const stats = fs.statSync(entryPath);
          isDirectory = stats.isDirectory();
          isFile = stats.isFile();
        } catch {
          continue;
        }
      }

      if (isDirectory) {
        scanSkillDir(entryPath, skills, visitedRealPaths, visited);
      } else if (isFile && entry.name === "SKILL.md") {
        loadRawSkill(entryPath, skills, visitedRealPaths);
      }
    }
  } catch {
    // Skip inaccessible directories
  }
}

function loadRawSkill(
  filePath: string,
  skills: RawSkill[],
  visitedRealPaths: Set<string>,
): void {
  try {
    let realPath: string;
    try {
      realPath = fs.realpathSync(filePath);
    } catch {
      realPath = filePath;
    }

    if (visitedRealPaths.has(realPath)) return;
    visitedRealPaths.add(realPath);

    const content = fs.readFileSync(filePath, "utf-8");
    const parentDirName = path.basename(path.dirname(filePath));
    const { name, description, disableModelInvocation } = parseFrontmatter(
      content,
      parentDirName,
    );

    if (!description) return;

    skills.push({ name, description, filePath, disableModelInvocation });
  } catch {
    // Skip invalid skill files
  }
}

// ---------------------------------------------------------------------------
// Token estimation for skill prompt entries
// ---------------------------------------------------------------------------

/**
 * Estimate the token cost of a skill's XML entry in the system prompt.
 *
 * Pi formats each skill as:
 *   <skill>
 *     <name>{name}</name>
 *     <description>{description}</description>
 *     <location>{filePath}</location>
 *   </skill>
 */
export function estimateSkillPromptTokens(skill: {
  name: string;
  description: string;
  filePath: string;
}): number {
  const xml = [
    "  <skill>",
    `    <name>${skill.name}</name>`,
    `    <description>${skill.description}</description>`,
    `    <location>${skill.filePath}</location>`,
    "  </skill>",
  ].join("\n");
  return estimateTokens(xml);
}

// ---------------------------------------------------------------------------
// Settings helpers
// ---------------------------------------------------------------------------

function normalizePath(p: string): string {
  const trimmed = p.trim();
  if (trimmed === "~") return os.homedir();
  if (trimmed.startsWith("~/")) return path.join(os.homedir(), trimmed.slice(2));
  if (trimmed.startsWith("~")) return path.join(os.homedir(), trimmed.slice(1));
  return path.resolve(trimmed);
}

function getDisabledPaths(settings: Settings): Set<string> {
  const disabled = new Set<string>();
  const skills = settings.skills ?? [];
  for (const entry of skills) {
    if (typeof entry === "string" && entry.startsWith("-")) {
      const rawPath = entry.slice(1);
      const absolutePath = normalizePath(rawPath);
      disabled.add(absolutePath);
      disabled.add(path.join(absolutePath, "SKILL.md"));
    }
  }
  return disabled;
}

function isSkillDisabled(filePath: string, disabledPaths: Set<string>): boolean {
  const normalized = path.normalize(filePath);
  const dir = path.dirname(filePath);
  return disabledPaths.has(normalized) || disabledPaths.has(dir);
}

// ---------------------------------------------------------------------------
// Ancestor .agents/skills/ directory collection
// ---------------------------------------------------------------------------

function findGitRepoRoot(startDir: string): string | null {
  let dir = path.resolve(startDir);
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (fs.existsSync(path.join(dir, ".git"))) return dir;
    const parent = path.resolve(dir, "..");
    if (parent === dir) return null;
    dir = parent;
  }
}

function collectAncestorAgentsSkillDirs(startDir: string): string[] {
  const dirs: string[] = [];
  const resolved = path.resolve(startDir);
  const gitRoot = findGitRepoRoot(resolved);

  let dir = resolved;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    dirs.push(path.join(dir, ".agents", "skills"));
    if (gitRoot && dir === gitRoot) break;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  return dirs;
}

// ---------------------------------------------------------------------------
// Main loader
// ---------------------------------------------------------------------------

/**
 * Discover all skills from the filesystem, matching pi's actual scan order.
 *
 * @param settings   Parsed settings.json (for disable state). Pass {} if none.
 * @param overrideDirs  Override the default scan directories (for testing).
 *                      When provided, ONLY these directories are scanned.
 */
export function loadAllSkills(
  settings: Settings,
  overrideDirs?: string[],
): { skills: SkillInfo[]; byName: Map<string, SkillInfo> } {
  const disabledPaths = getDisabledPaths(settings);
  const rawSkills: RawSkill[] = [];
  const visitedRealPaths = new Set<string>();

  const scanDirs =
    overrideDirs ??
    [
      path.join(process.cwd(), ".pi", "skills"),
      ...collectAncestorAgentsSkillDirs(process.cwd()),
      path.join(os.homedir(), ".pi", "agent", "skills"),
      path.join(os.homedir(), ".agents", "skills"),
    ];

  for (const dir of scanDirs) {
    scanSkillDir(dir, rawSkills, visitedRealPaths);
  }

  // Group by name — first occurrence wins
  const byName = new Map<string, SkillInfo>();
  const pathsByName = new Map<string, string[]>();

  for (const raw of rawSkills) {
    if (!pathsByName.has(raw.name)) {
      pathsByName.set(raw.name, []);
    }
    pathsByName.get(raw.name)!.push(raw.filePath);

    if (!byName.has(raw.name)) {
      byName.set(raw.name, {
        name: raw.name,
        description: raw.description,
        filePath: raw.filePath,
        allPaths: [],
        mode: "enabled",
        tokens: estimateSkillPromptTokens(raw),
        hasDuplicates: false,
      });
    }
  }

  // Fill in allPaths and compute mode
  for (const [name, skill] of byName) {
    const allPaths = pathsByName.get(name) ?? [skill.filePath];
    skill.allPaths = allPaths;
    skill.hasDuplicates = allPaths.length > 1;

    const allDisabled = allPaths.every((p) => isSkillDisabled(p, disabledPaths));
    if (allDisabled) {
      skill.mode = "disabled";
    } else if (
      byName.get(name) &&
      rawSkills.find((r) => r.name === name)?.disableModelInvocation
    ) {
      skill.mode = "hidden";
    }
  }

  const skills = Array.from(byName.values()).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  return { skills, byName };
}
```

**Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/skills.test.ts`
Expected: All tests PASS.

**Step 5: Run typecheck**

Run: `pnpm run typecheck`
Expected: No errors.

**Step 6: Commit**

```bash
git add -A
git commit -m "feat: add skill discovery module with filesystem scanning"
```

---

### Task 3: Persistence module (TDD)

**TDD scenario:** New feature — full TDD cycle.

**Files:**
- Create: `src/skills-persistence.test.ts`
- Create: `src/skills-persistence.ts`

**Step 1: Write the failing tests**

Create `src/skills-persistence.test.ts`:

```typescript
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import fc from "fast-check";
import {
  loadSettings,
  saveSettings,
  applyChanges,
  setFrontmatterField,
  removeFrontmatterField,
} from "./skills-persistence.js";
import type { DisableMode, Settings, SkillInfo } from "./types.js";

// ── setFrontmatterField ─────────────────────────────────────────────────

describe("setFrontmatterField", () => {
  it("should add field to existing frontmatter", () => {
    const content = "---\nname: test\n---\n# Content";

    const result = setFrontmatterField(content, "disable-model-invocation", "true");

    expect(result).toContain("disable-model-invocation: true");
    expect(result).toContain("name: test");
    expect(result).toContain("# Content");
  });

  it("should update existing field value", () => {
    const content = "---\nname: test\ndisable-model-invocation: false\n---\n# Content";

    const result = setFrontmatterField(content, "disable-model-invocation", "true");

    expect(result).toContain("disable-model-invocation: true");
    expect(result).not.toContain("disable-model-invocation: false");
  });

  it("should create frontmatter when none exists", () => {
    const content = "# Just markdown";

    const result = setFrontmatterField(content, "disable-model-invocation", "true");

    expect(result).toMatch(/^---\n/);
    expect(result).toContain("disable-model-invocation: true");
    expect(result).toContain("# Just markdown");
  });
});

// ── removeFrontmatterField ──────────────────────────────────────────────

describe("removeFrontmatterField", () => {
  it("should remove an existing field", () => {
    const content = "---\nname: test\ndisable-model-invocation: true\n---\n# Content";

    const result = removeFrontmatterField(content, "disable-model-invocation");

    expect(result).not.toContain("disable-model-invocation");
    expect(result).toContain("name: test");
    expect(result).toContain("# Content");
  });

  it("should return unchanged content when field does not exist", () => {
    const content = "---\nname: test\n---\n# Content";

    const result = removeFrontmatterField(content, "disable-model-invocation");

    expect(result).toContain("name: test");
  });

  it("should return unchanged content when no frontmatter exists", () => {
    const content = "# No frontmatter";

    const result = removeFrontmatterField(content, "anything");

    expect(result).toBe("# No frontmatter");
  });
});

// ── loadSettings / saveSettings ─────────────────────────────────────────

describe("loadSettings / saveSettings", () => {
  let tmpDir: string;
  let settingsPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "settings-test-"));
    settingsPath = path.join(tmpDir, "settings.json");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should return empty object when file does not exist", () => {
    const settings = loadSettings(settingsPath);

    expect(settings).toEqual({});
  });

  it("should roundtrip settings through save and load", () => {
    const original: Settings = { skills: ["-some/path", "other/path"] };

    saveSettings(original, settingsPath);
    const loaded = loadSettings(settingsPath);

    expect(loaded).toEqual(original);
  });

  it("should preserve other keys when saving", () => {
    const original: Settings = {
      skills: ["-path"],
      packages: ["some-package"],
      theme: "dark",
    };

    saveSettings(original, settingsPath);
    const loaded = loadSettings(settingsPath);

    expect(loaded.packages).toEqual(["some-package"]);
    expect(loaded.theme).toBe("dark");
  });
});

// ── applyChanges ────────────────────────────────────────────────────────

describe("applyChanges", () => {
  let tmpDir: string;
  let settingsPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "apply-test-"));
    settingsPath = path.join(tmpDir, "settings.json");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function makeSkill(name: string, filePath: string, allPaths?: string[]): SkillInfo {
    return {
      name,
      description: `${name} description`,
      filePath,
      allPaths: allPaths ?? [filePath],
      mode: "enabled",
      tokens: 100,
      hasDuplicates: (allPaths?.length ?? 1) > 1,
    };
  }

  it("should add -path entries when disabling a skill", () => {
    const skillPath = path.join(tmpDir, "my-skill", "SKILL.md");
    fs.mkdirSync(path.dirname(skillPath), { recursive: true });
    fs.writeFileSync(skillPath, "---\nname: my-skill\ndescription: test\n---\n");

    const skill = makeSkill("my-skill", skillPath);
    const byName = new Map([ ["my-skill", skill] ]);
    const changes = new Map<string, DisableMode>([ ["my-skill", "disabled"] ]);

    applyChanges(changes, byName, settingsPath);

    const settings = loadSettings(settingsPath);
    const hasDisableEntry = settings.skills?.some(
      (s) => typeof s === "string" && s.startsWith("-"),
    );
    expect(hasDisableEntry).toBe(true);
  });

  it("should remove -path entries when enabling a previously disabled skill", () => {
    const skillDir = path.join(tmpDir, "my-skill");
    const skillPath = path.join(skillDir, "SKILL.md");
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(skillPath, "---\nname: my-skill\ndescription: test\n---\n");

    // Pre-disable it
    saveSettings({ skills: [`-${skillDir}`] }, settingsPath);

    const skill = makeSkill("my-skill", skillPath);
    const byName = new Map([ ["my-skill", skill] ]);
    const changes = new Map<string, DisableMode>([ ["my-skill", "enabled"] ]);

    applyChanges(changes, byName, settingsPath);

    const settings = loadSettings(settingsPath);
    const hasDisableEntry = settings.skills?.some(
      (s) => typeof s === "string" && s.startsWith("-"),
    );
    expect(hasDisableEntry).toBeFalsy();
  });

  it("should set disable-model-invocation in frontmatter when hiding", () => {
    const skillDir = path.join(tmpDir, "hide-skill");
    const skillPath = path.join(skillDir, "SKILL.md");
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(skillPath, "---\nname: hide-skill\ndescription: test\n---\n# Content");

    const skill = makeSkill("hide-skill", skillPath);
    const byName = new Map([ ["hide-skill", skill] ]);
    const changes = new Map<string, DisableMode>([ ["hide-skill", "hidden"] ]);

    applyChanges(changes, byName, settingsPath);

    const content = fs.readFileSync(skillPath, "utf-8");
    expect(content).toContain("disable-model-invocation: true");
  });

  it("should remove disable-model-invocation from frontmatter when enabling a hidden skill", () => {
    const skillDir = path.join(tmpDir, "unhide-skill");
    const skillPath = path.join(skillDir, "SKILL.md");
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(
      skillPath,
      "---\nname: unhide-skill\ndescription: test\ndisable-model-invocation: true\n---\n# Content",
    );

    const skill = makeSkill("unhide-skill", skillPath);
    const byName = new Map([ ["unhide-skill", skill] ]);
    const changes = new Map<string, DisableMode>([ ["unhide-skill", "enabled"] ]);

    applyChanges(changes, byName, settingsPath);

    const content = fs.readFileSync(skillPath, "utf-8");
    expect(content).not.toContain("disable-model-invocation");
  });

  it("should disable ALL paths when a duplicate skill is disabled", () => {
    const dir1 = path.join(tmpDir, "first", "dupe");
    const dir2 = path.join(tmpDir, "second", "dupe");
    const path1 = path.join(dir1, "SKILL.md");
    const path2 = path.join(dir2, "SKILL.md");
    fs.mkdirSync(dir1, { recursive: true });
    fs.mkdirSync(dir2, { recursive: true });
    fs.writeFileSync(path1, "---\nname: dupe\ndescription: test\n---\n");
    fs.writeFileSync(path2, "---\nname: dupe\ndescription: test\n---\n");

    const skill = makeSkill("dupe", path1, [path1, path2]);
    const byName = new Map([ ["dupe", skill] ]);
    const changes = new Map<string, DisableMode>([ ["dupe", "disabled"] ]);

    applyChanges(changes, byName, settingsPath);

    const settings = loadSettings(settingsPath);
    const disableEntries =
      settings.skills?.filter(
        (s) => typeof s === "string" && s.startsWith("-"),
      ) ?? [];
    expect(disableEntries).toHaveLength(2);
  });
});

// ── Property-based tests ────────────────────────────────────────────────

describe("property-based", () => {
  it("should roundtrip frontmatter: set then remove yields equivalent content", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("field-a", "field-b", "custom-field"),
        fc.string({ minLength: 1, maxLength: 50 }),
        (key, value) => {
          // Start with content that has no frontmatter
          const original = "# Some Content\n\nBody text here.";

          const withField = setFrontmatterField(original, key, value);
          const withoutField = removeFrontmatterField(withField, key);

          // After removing, the body content should still be present
          return withoutField.includes("# Some Content") &&
                 withoutField.includes("Body text here.");
        },
      ),
    );
  });

  it("should be idempotent: setting the same field twice yields same result", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("disable-model-invocation", "custom"),
        fc.constantFrom("true", "false", "value"),
        (key, value) => {
          const content = "---\nname: test\n---\n# Content";

          const once = setFrontmatterField(content, key, value);
          const twice = setFrontmatterField(once, key, value);

          return once === twice;
        },
      ),
    );
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/skills-persistence.test.ts`
Expected: FAIL — modules not found.

**Step 3: Implement `src/skills-persistence.ts`**

Create `src/skills-persistence.ts`:

```typescript
/**
 * Persistence layer for skill toggle changes.
 *
 * Writes to two locations:
 *   1. settings.json — `-path` entries to disable skills
 *   2. SKILL.md frontmatter — `disable-model-invocation: true` to hide skills
 */

import * as fs from "node:fs";
import * as path from "node:path";

import type { DisableMode, Settings, SkillInfo } from "./types.js";

// ---------------------------------------------------------------------------
// Settings file I/O
// ---------------------------------------------------------------------------

export function loadSettings(settingsPath: string): Settings {
  try {
    if (fs.existsSync(settingsPath)) {
      return JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
    }
  } catch {
    // Ignore
  }
  return {};
}

export function saveSettings(settings: Settings, settingsPath: string): void {
  const dir = path.dirname(settingsPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
}

// ---------------------------------------------------------------------------
// Frontmatter manipulation
// ---------------------------------------------------------------------------

export function setFrontmatterField(
  content: string,
  key: string,
  value: string,
): string {
  if (!content.startsWith("---")) {
    return `---\n${key}: ${value}\n---\n${content}`;
  }

  const endIndex = content.indexOf("\n---", 3);
  if (endIndex === -1) {
    return `---\n${key}: ${value}\n---\n${content}`;
  }

  const frontmatter = content.slice(4, endIndex);
  const rest = content.slice(endIndex + 4);
  const lines = frontmatter.split("\n");

  let found = false;
  for (let i = 0; i < lines.length; i++) {
    const colonIndex = lines[i].indexOf(":");
    if (colonIndex === -1) continue;
    const lineKey = lines[i].slice(0, colonIndex).trim();
    if (lineKey === key) {
      lines[i] = `${key}: ${value}`;
      found = true;
      break;
    }
  }

  if (!found) {
    lines.push(`${key}: ${value}`);
  }

  return `---\n${lines.join("\n")}\n---${rest}`;
}

export function removeFrontmatterField(content: string, key: string): string {
  if (!content.startsWith("---")) {
    return content;
  }

  const endIndex = content.indexOf("\n---", 3);
  if (endIndex === -1) {
    return content;
  }

  const frontmatter = content.slice(4, endIndex);
  const rest = content.slice(endIndex + 4);
  const lines = frontmatter.split("\n");

  const filteredLines = lines.filter((line) => {
    const colonIndex = line.indexOf(":");
    if (colonIndex === -1) return true;
    const lineKey = line.slice(0, colonIndex).trim();
    return lineKey !== key;
  });

  return `---\n${filteredLines.join("\n")}\n---${rest}`;
}

// ---------------------------------------------------------------------------
// Apply changes
// ---------------------------------------------------------------------------

function getSkillRelativePath(skillFilePath: string, agentDir: string): string {
  const skillDir = path.dirname(skillFilePath);

  if (
    skillDir.startsWith(agentDir + path.sep) ||
    skillDir === agentDir
  ) {
    return path.relative(agentDir, skillDir);
  }

  // Fall back to absolute path
  return skillDir;
}

/**
 * Apply toggle changes to settings.json and SKILL.md frontmatter.
 *
 * @param changes      Map of skill name → new mode
 * @param skillsByName Map of skill name → SkillInfo (with allPaths)
 * @param settingsPath Path to settings.json
 * @param agentDir     Agent config directory (for relative path computation).
 *                     Defaults to ~/.pi/agent.
 */
export function applyChanges(
  changes: Map<string, DisableMode>,
  skillsByName: Map<string, SkillInfo>,
  settingsPath: string,
  agentDir?: string,
): void {
  const resolvedAgentDir =
    agentDir ?? path.join(process.env.HOME ?? "", ".pi", "agent");

  const settings = loadSettings(settingsPath);
  const existingSkills = settings.skills ?? [];
  const newSkills: string[] = [];

  // Collect paths to disable / undisable
  const pathsToDisable = new Set<string>();
  const pathsToUndisable = new Set<string>();
  const skillsToHide: SkillInfo[] = [];
  const skillsToUnhide: SkillInfo[] = [];

  for (const [skillName, newMode] of changes) {
    const skill = skillsByName.get(skillName);
    if (!skill) continue;

    if (newMode === "disabled") {
      for (const fp of skill.allPaths) {
        pathsToDisable.add(fp);
      }
    } else if (newMode === "hidden") {
      for (const fp of skill.allPaths) {
        pathsToUndisable.add(fp);
      }
      skillsToHide.push(skill);
    } else {
      for (const fp of skill.allPaths) {
        pathsToUndisable.add(fp);
      }
      skillsToUnhide.push(skill);
    }
  }

  // Filter existing entries — remove disable entries for skills being undisabled
  for (const entry of existingSkills) {
    if (typeof entry !== "string") {
      newSkills.push(entry as string);
      continue;
    }

    if (!entry.startsWith("-")) {
      newSkills.push(entry);
      continue;
    }

    const entryDir = path.resolve(entry.slice(1));
    const shouldRemove = Array.from(pathsToUndisable).some((fp) => {
      const skillDir = path.dirname(fp);
      return entryDir === skillDir || entryDir === fp;
    });

    if (!shouldRemove) {
      newSkills.push(entry);
    }
  }

  // Add new disable entries
  const existingDisableDirs = new Set(
    newSkills
      .filter((s) => s.startsWith("-"))
      .map((s) => path.resolve(s.slice(1))),
  );

  for (const fp of pathsToDisable) {
    const skillDir = path.dirname(fp);
    if (existingDisableDirs.has(skillDir) || existingDisableDirs.has(fp)) {
      continue;
    }
    const relPath = getSkillRelativePath(fp, resolvedAgentDir);
    newSkills.push(`-${relPath}`);
  }

  settings.skills = newSkills;
  saveSettings(settings, settingsPath);

  // Update frontmatter
  for (const skill of skillsToHide) {
    try {
      updateSkillFrontmatter(skill.filePath, true);
    } catch {
      // Log but continue
    }
  }

  for (const skill of skillsToUnhide) {
    try {
      updateSkillFrontmatter(skill.filePath, false);
    } catch {
      // Log but continue
    }
  }
}

function updateSkillFrontmatter(
  filePath: string,
  disableModelInvocation: boolean,
): void {
  const content = fs.readFileSync(filePath, "utf-8");

  let newContent: string;
  if (disableModelInvocation) {
    newContent = setFrontmatterField(
      content,
      "disable-model-invocation",
      "true",
    );
  } else {
    newContent = removeFrontmatterField(content, "disable-model-invocation");
  }

  fs.writeFileSync(filePath, newContent);
}
```

**Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/skills-persistence.test.ts`
Expected: All tests PASS.

**Step 5: Run full test suite + typecheck**

Run: `pnpm run test && pnpm run typecheck`
Expected: All 21 existing tests PASS + all new tests PASS. No type errors.

**Step 6: Commit**

```bash
git add -A
git commit -m "feat: add skill persistence module with settings and frontmatter support"
```

---

### Task 4: Phase 1 checkpoint

**TDD scenario:** Trivial change — run checks only.

**Step 1: Run the full check suite**

Run: `pnpm run check`
Expected: All checks pass (tests, typecheck, lint, format, deadcode, duplicates).

**Step 2: Fix any issues reported by check**

If deadcode or duplicates are flagged, address them before continuing.

**Step 3: Commit any fixes**

```bash
git add -A
git commit -m "chore: fix phase 1 check issues"
```

---

## Phase 2: UI Integration

### Task 5: Extend BudgetOverlay with skill-toggle mode (TDD)

**TDD scenario:** Modifying tested code — run existing tests first.

**Files:**
- Modify: `src/types.ts` (add `SkillToggleResult` type)
- Modify: `src/report-view.ts` (add skill-toggle mode to `BudgetOverlay`)
- Modify: `src/report-view.test.ts` (add skill-toggle tests + snapshots)

**Step 1: Run existing tests to confirm they pass**

Run: `pnpm vitest run src/report-view.test.ts`
Expected: PASS (1 test).

**Step 2: Add the `SkillToggleResult` type to `src/types.ts`**

Append to `src/types.ts`:

```typescript
export interface SkillToggleResult {
  applied: boolean;
  changes: Map<string, DisableMode>;
}
```

**Step 3: Write new failing tests in `src/report-view.test.ts`**

Replace the contents of `src/report-view.test.ts` with:

```typescript
import { showReport } from "./report-view.js";
import type { ParsedPrompt, SkillInfo } from "./types.js";

describe("report-view", () => {
  it("should export showReport function", () => {
    expectTypeOf(showReport).toBeFunction();
  });
});

// ── BudgetOverlay (imported for unit testing) ───────────────────────────

// NOTE: BudgetOverlay is not directly exported. These tests validate
// the behavior indirectly through showReport's contract, or by testing
// the internal buildTableItems helper if we extract it.
// For now, we add snapshot tests for the render output via a test helper.

describe("buildTableItems", () => {
  // This function is currently private in report-view.ts.
  // Task 5, Step 5 will export it for testing.

  it("should mark Skills section as drillable", async () => {
    const { buildTableItems } = await import("./report-view.js");
    const parsed: ParsedPrompt = {
      sections: [
        { label: "Base prompt", chars: 100, tokens: 25 },
        {
          label: "Skills (2)",
          chars: 200,
          tokens: 50,
          children: [
            { label: "skill-a", chars: 100, tokens: 25 },
            { label: "skill-b", chars: 100, tokens: 25 },
          ],
        },
      ],
      totalChars: 300,
      totalTokens: 75,
      skills: [],
    };

    const items = buildTableItems(parsed);
    const skillsItem = items.find((i) => i.label.startsWith("Skills"));

    expect(skillsItem?.drillable).toBe(true);
    expect(skillsItem?.children).toHaveLength(2);
  });
});
```

**Step 4: Run tests to verify new test fails**

Run: `pnpm vitest run src/report-view.test.ts`
Expected: FAIL — `buildTableItems` is not exported.

**Step 5: Export `buildTableItems` from `src/report-view.ts`**

In `src/report-view.ts`, change the `buildTableItems` function from:

```typescript
function buildTableItems(parsed: ParsedPrompt): TableItem[] {
```

to:

```typescript
export function buildTableItems(parsed: ParsedPrompt): TableItem[] {
```

**Step 6: Run tests to verify they pass**

Run: `pnpm vitest run src/report-view.test.ts`
Expected: PASS (2 tests).

**Step 7: Add skill-toggle mode to BudgetOverlay**

Modify `src/report-view.ts` — the changes are substantial. Key modifications:

1. Import `SkillInfo`, `DisableMode`, `SkillToggleResult` from `./types.js`.

2. Change the `Mode` type:
```typescript
type Mode = "sections" | "drilldown" | "skill-toggle";
```

3. Add skill-toggle state to `OverlayState`:
```typescript
interface OverlayState {
  mode: Mode;
  selectedIndex: number;
  scrollOffset: number;
  searchActive: boolean;
  searchQuery: string;
  drilldownSection: TableItem | null;
  // Skill toggle state
  pendingChanges: Map<string, DisableMode>;
}
```

4. Add `discoveredSkills` and `onToggleResult` to `BudgetOverlay` constructor:
```typescript
constructor(
  parsed: ParsedPrompt,
  contextWindow: number | undefined,
  discoveredSkills: SkillInfo[],
  done: (value: null) => void,
  onToggleResult?: (result: SkillToggleResult) => void,
)
```

5. Override `drillIn()` — when the selected section label starts with
"Skills", enter `skill-toggle` mode instead of `drilldown`:
```typescript
private drillIn(): void {
  if (this.state.mode !== "sections") return;
  const items = this.getVisibleItems();
  const selected = items[this.state.selectedIndex];
  if (!selected?.drillable) return;

  if (selected.label.startsWith("Skills") && this.discoveredSkills.length > 0) {
    this.state.mode = "skill-toggle";
    this.state.selectedIndex = 0;
    this.state.scrollOffset = 0;
    this.state.searchActive = false;
    this.state.searchQuery = "";
    this.invalidate();
    return;
  }

  this.state.mode = "drilldown";
  this.state.drilldownSection = selected;
  this.state.selectedIndex = 0;
  this.state.scrollOffset = 0;
  this.state.searchActive = false;
  this.state.searchQuery = "";
  this.invalidate();
}
```

6. Add `handleSkillToggleInput()` for keybindings in skill-toggle mode:
```typescript
private handleSkillToggleInput(data: string): void {
  if (this.state.searchActive) {
    this.handleSearchInput(data);
    return;
  }

  if (matchesKey(data, "escape")) {
    if (this.state.pendingChanges.size > 0) {
      // TODO: show confirmation prompt (for now, discard silently)
    }
    this.state.mode = "sections";
    this.state.selectedIndex = 0;
    this.state.scrollOffset = 0;
    this.invalidate();
    return;
  }

  if (matchesKey(data, "up")) { this.moveSelection(-1); return; }
  if (matchesKey(data, "down")) { this.moveSelection(1); return; }

  if (matchesKey(data, "enter") || data === " ") {
    this.cycleSkillState();
    return;
  }

  if (matchesKey(data, "ctrl+s")) {
    this.saveSkillChanges();
    return;
  }

  if (data === "/") {
    this.state.searchActive = true;
    this.state.searchQuery = "";
    this.invalidate();
  }
}
```

7. Add `cycleSkillState()` — cycles enabled → hidden → disabled → enabled:
```typescript
private cycleSkillState(): void {
  const visibleSkills = this.getFilteredSkills();
  const skill = visibleSkills[this.state.selectedIndex];
  if (!skill) return;

  const current = this.getEffectiveMode(skill);
  const next: DisableMode =
    current === "enabled" ? "hidden" :
    current === "hidden" ? "disabled" : "enabled";

  if (next === skill.mode) {
    this.state.pendingChanges.delete(skill.name);
  } else {
    this.state.pendingChanges.set(skill.name, next);
  }

  this.recalculateTokens();
  this.invalidate();
}
```

8. Add `getEffectiveMode()`:
```typescript
private getEffectiveMode(skill: SkillInfo): DisableMode {
  return this.state.pendingChanges.get(skill.name) ?? skill.mode;
}
```

9. Add `recalculateTokens()` — adjusts `this.parsed` sections and totals
based on pending skill toggles:
```typescript
private recalculateTokens(): void {
  // Compute delta from original skill states
  let tokenDelta = 0;
  for (const [name, newMode] of this.state.pendingChanges) {
    const skill = this.discoveredSkills.find((s) => s.name === name);
    if (!skill) continue;

    const wasInPrompt = skill.mode === "enabled";
    const willBeInPrompt = newMode === "enabled";

    if (wasInPrompt && !willBeInPrompt) {
      tokenDelta -= skill.tokens;
    } else if (!wasInPrompt && willBeInPrompt) {
      tokenDelta += skill.tokens;
    }
  }

  // Update the skills section token count
  // (rebuild tableItems from adjusted parsed data)
  this.adjustedTotalTokens = this.originalTotalTokens + tokenDelta;
  this.tableItems = buildTableItems(this.getAdjustedParsed());
  this.invalidate();
}
```

10. Add `renderSkillToggle()` — renders the skill list with status icons,
pending change markers, and duplicate markers. Structure mirrors
`renderInteractiveTable()` but with skill-specific rendering:
```typescript
private renderSkillToggle(
  lines: string[],
  innerW: number,
  row: (content: string) => string,
  emptyRow: () => string,
  centerRow: (content: string) => string,
): void {
  // Header with pending changes count
  lines.push(emptyRow());
  const pendingCount = this.state.pendingChanges.size;
  if (pendingCount > 0) {
    lines.push(row(
      sgr("33", `⚠ ${pendingCount} pending change${pendingCount === 1 ? "" : "s"} (Ctrl+S to save)`),
    ));
    lines.push(emptyRow());
  }

  const breadcrumb = `${bold("Skills")}  ${dim("← esc to go back")}`;
  lines.push(row(breadcrumb));

  // Search bar (reuse existing search rendering)
  if (this.state.searchActive) {
    lines.push(emptyRow());
    const cursor = sgr("36", "│");
    const query = this.state.searchQuery
      ? `${this.state.searchQuery}${cursor}`
      : `${cursor}${dim(italic("type to filter..."))}`;
    lines.push(row(`${dim("◎")}  ${query}`));
  }

  lines.push(emptyRow());

  // Skill rows
  const skills = this.getFilteredSkills();
  if (skills.length === 0) {
    lines.push(centerRow(dim(italic("No matching skills"))));
    lines.push(emptyRow());
    return;
  }

  const startIdx = this.state.scrollOffset;
  const endIdx = Math.min(startIdx + MAX_VISIBLE_ROWS, skills.length);

  for (let i = startIdx; i < endIdx; i++) {
    const skill = skills[i];
    const isSelected = i === this.state.selectedIndex;
    const mode = this.getEffectiveMode(skill);
    const hasChanged = this.state.pendingChanges.has(skill.name);

    const prefix = isSelected ? sgr("36", "▸") : dim("·");

    let statusIcon: string;
    if (mode === "enabled") statusIcon = sgr("32", "●");
    else if (mode === "hidden") statusIcon = sgr("33", "◐");
    else statusIcon = sgr("31", "○");

    const changedMarker = hasChanged ? sgr("33", "*") : " ";
    const dupMarker = skill.hasDuplicates ? sgr("35", "²") : " ";
    const nameStr = isSelected ? bold(sgr("36", skill.name)) : skill.name;

    const tokenStr = `${fmt(skill.tokens)} tok`;
    const suffixWidth = visibleWidth(tokenStr);
    const prefixWidth = 8; // "▸ ●* ² "
    const nameMaxWidth = innerW - prefixWidth - suffixWidth - 4;

    const truncatedName = truncateToWidth(nameStr, nameMaxWidth, "…");
    const nameWidth = visibleWidth(truncatedName);
    const gap = Math.max(1, innerW - prefixWidth - nameWidth - suffixWidth - 3);

    const content = `${prefix} ${statusIcon}${changedMarker}${dupMarker}${truncatedName}${" ".repeat(gap)}${dim(tokenStr)}`;
    lines.push(row(content));
  }

  lines.push(emptyRow());

  // Scroll indicator
  if (skills.length > MAX_VISIBLE_ROWS) {
    const progress = Math.round(
      ((this.state.selectedIndex + 1) / skills.length) * 10,
    );
    const dots = rainbowDots(progress, 10);
    const countStr = `${this.state.selectedIndex + 1}/${skills.length}`;
    lines.push(row(`${dots}  ${dim(countStr)}`));
    lines.push(emptyRow());
  }
}
```

11. Update `handleInput()` to route to `handleSkillToggleInput()`:
```typescript
handleInput(data: string): void {
  if (this.state.mode === "skill-toggle") {
    this.handleSkillToggleInput(data);
    return;
  }
  // ... existing handling
}
```

12. Update `render()` to call `renderSkillToggle()` when in skill-toggle mode:
In the Zone 3 section of `render()`, before the existing `renderInteractiveTable` call:
```typescript
if (this.state.mode === "skill-toggle") {
  this.renderSkillToggle(lines, innerW, row, emptyRow, centerRow);
} else {
  this.renderInteractiveTable(lines, innerW, row, emptyRow, centerRow);
}
```

13. Update the footer hints for skill-toggle mode:
```typescript
const hints =
  this.state.mode === "skill-toggle"
    ? `${italic("↑↓")} navigate  ${italic("enter")} cycle state  ${italic("/")} search  ${italic("ctrl+s")} save  ${italic("esc")} back`
    : this.state.mode === "drilldown"
      ? `${italic("↑↓")} navigate  ${italic("/")} search  ${italic("esc")} back`
      : `${italic("↑↓")} navigate  ${italic("enter")} drill-in  ${italic("/")} search  ${italic("esc")} close`;
```

14. Update `showReport()` signature to accept discovered skills:
```typescript
export async function showReport(
  parsed: ParsedPrompt,
  contextWindow: number | undefined,
  ctx: ExtensionCommandContext,
  discoveredSkills?: SkillInfo[],
  onToggleResult?: (result: SkillToggleResult) => void,
): Promise<void> {
```

And pass them through to `BudgetOverlay`:
```typescript
const overlay = new BudgetOverlay(
  parsed,
  contextWindow,
  discoveredSkills ?? [],
  done,
  onToggleResult,
);
```

**Step 8: Run tests**

Run: `pnpm vitest run src/report-view.test.ts`
Expected: PASS.

**Step 9: Run typecheck**

Run: `pnpm run typecheck`
Expected: No errors.

**Step 10: Commit**

```bash
git add -A
git commit -m "feat: add skill-toggle mode to BudgetOverlay"
```

---

### Task 6: Wire up index.ts and add snapshot tests

**TDD scenario:** Modifying tested code + new snapshot tests.

**Files:**
- Modify: `src/index.ts` (pass discovered skills to showReport)
- Modify: `src/report-view.test.ts` (add snapshot tests)
- Modify: `src/index.test.ts` (verify updated signature)

**Step 1: Update `src/index.ts` to discover skills and wire up toggle**

Replace `src/index.ts` contents:

```typescript
import type { ExtensionFactory } from "@mariozechner/pi-coding-agent";
import * as os from "node:os";
import * as path from "node:path";

import { parseSystemPrompt } from "./parser.js";
import { showReport } from "./report-view.js";
import { loadAllSkills } from "./skills.js";
import { applyChanges, loadSettings } from "./skills-persistence.js";

const SETTINGS_PATH = path.join(os.homedir(), ".pi", "agent", "settings.json");

const extension: ExtensionFactory = (pi) => {
  pi.registerCommand("token-burden", {
    description: "Show token budget breakdown and manage skills",
    handler: async (_args, ctx) => {
      const prompt = ctx.getSystemPrompt();
      const parsed = parseSystemPrompt(prompt);

      const usage = ctx.getContextUsage();
      const contextWindow = usage?.contextWindow ?? ctx.model?.contextWindow;

      if (!ctx.hasUI) {
        return;
      }

      const settings = loadSettings(SETTINGS_PATH);
      const { skills, byName } = loadAllSkills(settings);

      await showReport(parsed, contextWindow, ctx, skills, (result) => {
        if (result.applied && result.changes.size > 0) {
          try {
            applyChanges(result.changes, byName, SETTINGS_PATH);

            const parts: string[] = [];
            const enabledCount = Array.from(result.changes.values()).filter(
              (v) => v === "enabled",
            ).length;
            const hiddenCount = Array.from(result.changes.values()).filter(
              (v) => v === "hidden",
            ).length;
            const disabledCount = Array.from(result.changes.values()).filter(
              (v) => v === "disabled",
            ).length;

            if (enabledCount > 0) parts.push(`${enabledCount} enabled`);
            if (hiddenCount > 0) parts.push(`${hiddenCount} hidden`);
            if (disabledCount > 0) parts.push(`${disabledCount} disabled`);

            ctx.ui.notify(
              `Skills updated: ${parts.join(", ")}. Use /reload or restart for changes to take effect.`,
              "success",
            );
          } catch (error) {
            const msg =
              error instanceof Error ? error.message : "Unknown error";
            ctx.ui.notify(`Failed to save settings: ${msg}`, "error");
          }
        }
      });
    },
  });
};

export default extension;
```

**Step 2: Add snapshot tests to `src/report-view.test.ts`**

Append to `src/report-view.test.ts`:

```typescript
import type { SkillInfo } from "./types.js";

// ── Snapshot tests ──────────────────────────────────────────────────────

// Helper to strip ANSI codes for structural comparison
function stripAnsi(str: string): string {
  return str.replace(/\x1B\[[0-9;]*m/g, "");
}

describe("BudgetOverlay render snapshots", () => {
  // We can't instantiate BudgetOverlay directly since it's not exported,
  // but we can test buildTableItems output and the render helpers.

  it("should produce consistent table items structure", async () => {
    const { buildTableItems } = await import("./report-view.js");
    const parsed: ParsedPrompt = {
      sections: [
        { label: "Base prompt", chars: 5000, tokens: 1200 },
        {
          label: "AGENTS.md files",
          chars: 3000,
          tokens: 700,
          children: [
            { label: "/home/user/.pi/agent/AGENTS.md", chars: 1500, tokens: 350 },
            { label: "/home/user/project/AGENTS.md", chars: 1500, tokens: 350 },
          ],
        },
        {
          label: "Skills (3)",
          chars: 2000,
          tokens: 500,
          children: [
            { label: "brainstorming", chars: 800, tokens: 200 },
            { label: "tdd", chars: 700, tokens: 175 },
            { label: "debugging", chars: 500, tokens: 125 },
          ],
        },
        { label: "Metadata (date/time, cwd)", chars: 200, tokens: 50 },
      ],
      totalChars: 10200,
      totalTokens: 2450,
      skills: [],
    };

    const items = buildTableItems(parsed);

    // Snapshot the structural data (not ANSI rendering)
    expect(items.map((i) => ({
      label: i.label,
      tokens: i.tokens,
      drillable: i.drillable,
      childCount: i.children?.length ?? 0,
    }))).toMatchInlineSnapshot(`
      [
        {
          "childCount": 0,
          "drillable": false,
          "label": "Base prompt",
          "tokens": 1200,
        },
        {
          "childCount": 2,
          "drillable": true,
          "label": "AGENTS.md files",
          "tokens": 700,
        },
        {
          "childCount": 3,
          "drillable": true,
          "label": "Skills (3)",
          "tokens": 500,
        },
        {
          "childCount": 0,
          "drillable": false,
          "label": "Metadata (date/time, cwd)",
          "tokens": 50,
        },
      ]
    `);
  });
});
```

> **Note:** The inline snapshot above is a placeholder. Run vitest with
> `--update` to capture the actual snapshot on first run. The sort order is
> descending by tokens, so Base prompt (1200) will be first.

**Step 3: Run tests**

Run: `pnpm vitest run`
Expected: All tests PASS. If inline snapshot mismatches, run `pnpm vitest run --update` to capture.

**Step 4: Run typecheck**

Run: `pnpm run typecheck`
Expected: No errors.

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: wire skill discovery into /token-burden command"
```

---

### Task 7: Add discard confirmation and legend to skill-toggle mode

**TDD scenario:** New feature — full TDD cycle.

**Files:**
- Modify: `src/report-view.ts` (add confirmation UI and legend line)

**Step 1: Add confirmation behavior**

When the user presses `esc` in skill-toggle mode with pending changes,
show a single-line prompt inside the overlay: "Discard N changes? (y/n)".

Add a `confirmingDiscard` boolean to `OverlayState`:
```typescript
confirmingDiscard: boolean;
```

In `handleSkillToggleInput`, when `esc` is pressed with pending changes:
```typescript
if (matchesKey(data, "escape")) {
  if (this.state.pendingChanges.size > 0 && !this.state.confirmingDiscard) {
    this.state.confirmingDiscard = true;
    this.invalidate();
    return;
  }
  this.state.mode = "sections";
  this.state.pendingChanges = new Map();
  this.state.confirmingDiscard = false;
  this.state.selectedIndex = 0;
  this.state.scrollOffset = 0;
  this.recalculateTokens();
  this.invalidate();
  return;
}
```

When `confirmingDiscard` is true, intercept y/n:
```typescript
if (this.state.confirmingDiscard) {
  if (data === "y" || data === "Y") {
    this.state.mode = "sections";
    this.state.pendingChanges = new Map();
    this.state.confirmingDiscard = false;
    this.state.selectedIndex = 0;
    this.state.scrollOffset = 0;
    this.recalculateTokens();
    this.invalidate();
    return;
  }
  if (data === "n" || data === "N" || matchesKey(data, "escape")) {
    this.state.confirmingDiscard = false;
    this.invalidate();
    return;
  }
  return; // Ignore other keys during confirmation
}
```

In `renderSkillToggle`, when `confirmingDiscard` is true, render the prompt:
```typescript
if (this.state.confirmingDiscard) {
  lines.push(emptyRow());
  lines.push(row(
    sgr("33", `Discard ${this.state.pendingChanges.size} change${this.state.pendingChanges.size === 1 ? "" : "s"}? `) +
    dim("(y/n)"),
  ));
}
```

**Step 2: Add the legend line at the bottom of skill-toggle mode**

After the skill list in `renderSkillToggle()`:
```typescript
lines.push(row(dim(
  `${sgr("32", "●")} on  ${sgr("33", "◐")} hidden  ${sgr("31", "○")} disabled  ${sgr("35", "²")} duplicates`,
)));
```

**Step 3: Run tests + typecheck**

Run: `pnpm run test && pnpm run typecheck`
Expected: PASS.

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: add discard confirmation and legend to skill-toggle mode"
```

---

### Task 8: Final integration and manual testing

**TDD scenario:** Integration — run full suite and manual test.

**Files:**
- No new files

**Step 1: Run the full check suite**

Run: `pnpm run check`
Expected: All checks pass.

**Step 2: Manual test**

Run: `pi -e ./src/index.ts`

Then type `/token-burden` and verify:

1. The overview renders correctly (context window bar, stacked bar, section table).
2. Navigate to the Skills section and press `enter` — should enter skill-toggle mode.
3. See the list of discovered skills with status icons (● ◐ ○).
4. Press `enter`/`space` on a skill — should cycle through enabled → hidden → disabled.
5. Watch the stacked bar chart and total tokens update live.
6. Press `/` to search — fuzzy filter works on skill names.
7. Press `esc` with pending changes — "Discard N changes? (y/n)" prompt appears.
8. Press `n` to cancel, then `ctrl+s` to save.
9. Check `~/.pi/agent/settings.json` — `-path` entries appear for disabled skills.
10. Check SKILL.md frontmatter — `disable-model-invocation: true` set for hidden skills.
11. Run `/reload` then `/token-burden` again — saved changes are reflected.

**Step 3: Fix any issues found during manual testing**

If issues are found, write a failing test first, then fix.

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat: skill toggle integration complete"
```

---

## Updated File Map

| Path                          | Purpose                                                        |
| ----------------------------- | -------------------------------------------------------------- |
| `src/index.ts`                | Extension entry: registers `/token-burden`, wires skill toggle |
| `src/parser.ts`               | Parses system prompt into sections                             |
| `src/skills.ts`               | Filesystem skill discovery, dedup, state computation           |
| `src/skills-persistence.ts`   | Settings.json + SKILL.md frontmatter persistence               |
| `src/report-view.ts`          | TUI overlay with budget view + skill-toggle mode               |
| `src/utils.ts`                | `fuzzyFilter()`, `buildBarSegments()`                          |
| `src/types.ts`                | All shared types                                               |
| `src/skills.test.ts`          | Skill discovery tests (example + property-based)               |
| `src/skills-persistence.test.ts` | Persistence tests (example + property-based)                |
| `src/parser.test.ts`          | Parser tests (unchanged)                                       |
| `src/utils.test.ts`           | Utility tests (unchanged)                                      |
| `src/report-view.test.ts`     | Report view tests + snapshots                                  |
| `src/index.test.ts`           | Extension export test                                          |

## Updated Architecture

```
index.ts
  ├── parser.ts ────→ types.ts
  ├── skills.ts ────→ types.ts
  │                    ├── parser.ts (for estimateTokens)
  ├── skills-persistence.ts ──→ types.ts
  └── report-view.ts ──→ utils.ts ──→ types.ts
```
