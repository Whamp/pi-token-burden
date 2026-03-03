/**
 * Filesystem-based skill discovery.
 *
 * Scans the same directories pi uses to find skills, reads SKILL.md
 * frontmatter, deduplicates by name (first wins), and computes each
 * skill's disable state from settings.json + frontmatter.
 */

import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { DisableMode } from "./enums.js";
import { estimateTokens } from "./parser.js";
import type { Settings, SkillInfo } from "./types.js";

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
  fallbackName: string
): FrontmatterResult {
  if (!content.startsWith("---")) {
    return {
      name: fallbackName,
      description: "",
      disableModelInvocation: false,
    };
  }

  const endIndex = content.indexOf("\n---", 3);
  if (endIndex === -1) {
    return {
      name: fallbackName,
      description: "",
      disableModelInvocation: false,
    };
  }

  const frontmatter = content.slice(4, endIndex);
  let name = fallbackName;
  let description = "";
  let disableModelInvocation = false;

  for (const line of frontmatter.split("\n")) {
    const colonIndex = line.indexOf(":");
    if (colonIndex === -1) {
      continue;
    }

    const key = line.slice(0, colonIndex).trim();
    const value = line.slice(colonIndex + 1).trim();

    if (key === "name") {
      name = value;
    }
    if (key === "description") {
      description = value;
    }
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

function loadRawSkill(
  filePath: string,
  skills: RawSkill[],
  visitedRealPaths: Set<string>
): void {
  try {
    let realPath: string;
    try {
      realPath = fs.realpathSync(filePath);
    } catch {
      realPath = filePath;
    }

    if (visitedRealPaths.has(realPath)) {
      return;
    }
    visitedRealPaths.add(realPath);

    const content = fs.readFileSync(filePath, "utf8");
    const parentDirName = path.basename(path.dirname(filePath));
    const { name, description, disableModelInvocation } = parseFrontmatter(
      content,
      parentDirName
    );

    if (!description) {
      return;
    }

    skills.push({ name, description, filePath, disableModelInvocation });
  } catch {
    // Skip invalid skill files
  }
}

export function scanSkillDir(
  dir: string,
  skills: RawSkill[],
  visitedRealPaths: Set<string>,
  visitedDirs?: Set<string>,
  includeRootFiles?: boolean
): void {
  if (!fs.existsSync(dir)) {
    return;
  }

  const visited = visitedDirs ?? new Set<string>();
  let realDir: string;
  try {
    realDir = fs.realpathSync(dir);
  } catch {
    realDir = dir;
  }
  if (visited.has(realDir)) {
    return;
  }
  visited.add(realDir);

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".")) {
        continue;
      }
      if (entry.name === "node_modules") {
        continue;
      }

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
        scanSkillDir(entryPath, skills, visitedRealPaths, visited, false);
      } else if (isFile) {
        const isRootMd =
          (includeRootFiles ?? false) && entry.name.endsWith(".md");
        const isSkillMd = !includeRootFiles && entry.name === "SKILL.md";
        if (isRootMd || isSkillMd) {
          loadRawSkill(entryPath, skills, visitedRealPaths);
        }
      }
    }
  } catch {
    // Skip inaccessible directories
  }
}

function scanSkillPath(
  sourcePath: string,
  skills: RawSkill[],
  visitedRealPaths: Set<string>
): void {
  if (!fs.existsSync(sourcePath)) {
    return;
  }

  try {
    const stats = fs.statSync(sourcePath);
    if (stats.isDirectory()) {
      scanSkillDir(sourcePath, skills, visitedRealPaths, undefined, true);
      return;
    }

    if (stats.isFile() && sourcePath.endsWith(".md")) {
      loadRawSkill(sourcePath, skills, visitedRealPaths);
    }
  } catch {
    // Skip inaccessible files/paths
  }
}

// ---------------------------------------------------------------------------
// Token estimation for skill prompt entries
// ---------------------------------------------------------------------------

/**
 * Estimate the token cost of a skill's XML entry in the system prompt.
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

function isPatternEntry(entry: string): boolean {
  return (
    entry.startsWith("!") ||
    entry.startsWith("+") ||
    entry.startsWith("-") ||
    entry.includes("*") ||
    entry.includes("?")
  );
}

function resolvePathFromBase(input: string, baseDir: string): string {
  const trimmed = input.trim();
  if (trimmed === "~") {
    return os.homedir();
  }
  if (trimmed.startsWith("~/")) {
    return path.join(os.homedir(), trimmed.slice(2));
  }
  if (trimmed.startsWith("~")) {
    return path.join(os.homedir(), trimmed.slice(1));
  }
  if (path.isAbsolute(trimmed)) {
    return path.normalize(trimmed);
  }
  return path.resolve(baseDir, trimmed);
}

function getDisabledPaths(
  settings: Settings,
  settingsBaseDir: string
): Set<string> {
  const disabled = new Set<string>();
  const skills = settings.skills ?? [];
  for (const entry of skills) {
    if (typeof entry === "string" && entry.startsWith("-")) {
      const rawPath = entry.slice(1);
      const absolutePath = resolvePathFromBase(rawPath, settingsBaseDir);
      disabled.add(path.normalize(absolutePath));
      disabled.add(path.normalize(path.join(absolutePath, "SKILL.md")));
    }
  }
  return disabled;
}

function isSkillDisabled(
  filePath: string,
  disabledPaths: Set<string>
): boolean {
  const normalized = path.normalize(filePath);
  const dir = path.dirname(filePath);
  return disabledPaths.has(normalized) || disabledPaths.has(dir);
}

function getPackageSource(entry: unknown): string | null {
  if (typeof entry === "string") {
    return entry;
  }
  if (!entry || typeof entry !== "object") {
    return null;
  }

  if (!("source" in entry)) {
    return null;
  }

  const { source } = entry as { source?: unknown };
  if (typeof source !== "string") {
    return null;
  }

  return source;
}

function isLocalPathLike(source: string): boolean {
  const trimmed = source.trim();
  return (
    trimmed.startsWith(".") ||
    trimmed.startsWith("/") ||
    trimmed === "~" ||
    trimmed.startsWith("~/") ||
    /^[A-Za-z]:[\\/]|^\\\\/.test(trimmed)
  );
}

function parseNpmPackageName(spec: string): string {
  const match = spec.match(/^(@?[^@]+(?:\/[^@]+)?)(?:@(.+))?$/);
  if (!match) {
    return spec;
  }
  return match[1] ?? spec;
}

function getGlobalNpmRoot(): string | null {
  const result = spawnSync("npm", ["root", "-g"], {
    encoding: "utf8",
  });

  if (result.status !== 0) {
    return null;
  }

  const value = result.stdout.trim();
  if (!value) {
    return null;
  }

  return value;
}

function looksLikeGitSource(source: string): boolean {
  return (
    source.startsWith("git:") ||
    source.startsWith("http://") ||
    source.startsWith("https://") ||
    source.startsWith("ssh://") ||
    source.startsWith("git@")
  );
}

function parseGitSource(
  source: string
): { host: string; repoPath: string } | null {
  const trimmed = source.trim();
  const withoutPrefix = trimmed.startsWith("git:")
    ? trimmed.slice("git:".length)
    : trimmed;
  const withoutRef = withoutPrefix.split("#")[0]?.trim() ?? "";

  if (!withoutRef) {
    return null;
  }

  if (
    withoutRef.startsWith("http://") ||
    withoutRef.startsWith("https://") ||
    withoutRef.startsWith("ssh://")
  ) {
    try {
      const parsed = new URL(withoutRef);
      const { host, pathname } = parsed;
      const repoPath = pathname.replace(/^\/+/, "").replace(/\.git$/, "");

      if (!host || !repoPath) {
        return null;
      }

      return { host, repoPath };
    } catch {
      return null;
    }
  }

  if (withoutRef.startsWith("git@")) {
    const atIndex = withoutRef.indexOf("@");
    const colonIndex = withoutRef.indexOf(":");
    if (colonIndex === -1 || colonIndex <= atIndex) {
      return null;
    }

    const host = withoutRef.slice(atIndex + 1, colonIndex);
    const repoPath = withoutRef.slice(colonIndex + 1).replace(/\.git$/, "");

    if (!host || !repoPath) {
      return null;
    }

    return { host, repoPath };
  }

  const firstSlash = withoutRef.indexOf("/");
  if (firstSlash === -1) {
    return null;
  }

  const host = withoutRef.slice(0, firstSlash);
  const repoPath = withoutRef.slice(firstSlash + 1).replace(/\.git$/, "");
  if (!host || !repoPath) {
    return null;
  }

  return { host, repoPath };
}

function resolvePackageRoot(
  source: string,
  settingsBaseDir: string,
  npmRoot: string | null
): string | null {
  const trimmed = source.trim();

  if (trimmed.startsWith("npm:")) {
    if (!npmRoot) {
      return null;
    }
    const spec = trimmed.slice("npm:".length).trim();
    const packageName = parseNpmPackageName(spec);
    return path.join(npmRoot, packageName);
  }

  if (looksLikeGitSource(trimmed)) {
    const parsedGit = parseGitSource(trimmed);
    if (!parsedGit) {
      return null;
    }
    return path.join(
      settingsBaseDir,
      "git",
      parsedGit.host,
      parsedGit.repoPath
    );
  }

  if (isLocalPathLike(trimmed)) {
    return resolvePathFromBase(trimmed, settingsBaseDir);
  }

  // Fallback aligns with package-manager behavior for unknown sources.
  return resolvePathFromBase(trimmed, settingsBaseDir);
}

function resolvePackageSkillPaths(packageRoot: string): string[] {
  const packageJsonPath = path.join(packageRoot, "package.json");
  const resolvedPaths: string[] = [];

  if (fs.existsSync(packageJsonPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as {
        pi?: { skills?: unknown };
      };
      const manifestSkills = parsed.pi?.skills;

      if (Array.isArray(manifestSkills)) {
        const plainEntries = manifestSkills.filter(
          (entry): entry is string =>
            typeof entry === "string" && !isPatternEntry(entry)
        );

        for (const entry of plainEntries) {
          resolvedPaths.push(path.resolve(packageRoot, entry));
        }
      }
    } catch {
      // Ignore invalid package.json
    }
  }

  if (resolvedPaths.length > 0) {
    return resolvedPaths;
  }

  const conventionalSkillsDir = path.join(packageRoot, "skills");
  if (fs.existsSync(conventionalSkillsDir)) {
    return [conventionalSkillsDir];
  }

  return [packageRoot];
}

function collectConfiguredSkillPaths(
  settings: Settings,
  settingsBaseDir: string
): string[] {
  const configuredPaths: string[] = [];

  for (const entry of settings.skills ?? []) {
    if (typeof entry !== "string") {
      continue;
    }

    const trimmed = entry.trim();
    if (!trimmed || isPatternEntry(trimmed)) {
      continue;
    }

    configuredPaths.push(resolvePathFromBase(trimmed, settingsBaseDir));
  }

  const packageEntries = settings.packages ?? [];
  const hasNpmPackage = packageEntries.some((entry) => {
    const source = getPackageSource(entry);
    return source?.startsWith("npm:") ?? false;
  });
  const npmRoot = hasNpmPackage ? getGlobalNpmRoot() : null;

  for (const entry of packageEntries) {
    const source = getPackageSource(entry);
    if (!source) {
      continue;
    }

    const packageRoot = resolvePackageRoot(source, settingsBaseDir, npmRoot);
    if (!packageRoot) {
      continue;
    }

    configuredPaths.push(...resolvePackageSkillPaths(packageRoot));
  }

  return configuredPaths;
}

function uniquePaths(paths: string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];

  for (const p of paths) {
    const normalized = path.normalize(p);
    if (seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    unique.push(p);
  }

  return unique;
}

// ---------------------------------------------------------------------------
// Ancestor .agents/skills/ directory collection
// ---------------------------------------------------------------------------

function findGitRepoRoot(startDir: string): string | null {
  let dir = path.resolve(startDir);
  for (;;) {
    if (fs.existsSync(path.join(dir, ".git"))) {
      return dir;
    }
    const parent = path.resolve(dir, "..");
    if (parent === dir) {
      return null;
    }
    dir = parent;
  }
}

function collectAncestorAgentsSkillDirs(startDir: string): string[] {
  const dirs: string[] = [];
  const resolved = path.resolve(startDir);
  const gitRoot = findGitRepoRoot(resolved);

  let dir = resolved;
  for (;;) {
    dirs.push(path.join(dir, ".agents", "skills"));
    if (gitRoot && dir === gitRoot) {
      break;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }

  return dirs;
}

// ---------------------------------------------------------------------------
// Main loader
// ---------------------------------------------------------------------------

/**
 * Discover all skills from the filesystem, matching pi scan order.
 *
 * Pass `overrideDirs` to limit default scanning (used by tests).
 */
export function loadAllSkills(
  settings: Settings,
  overrideDirs?: string[],
  settingsBaseDir?: string
): { skills: SkillInfo[]; byName: Map<string, SkillInfo> } {
  const resolvedSettingsBaseDir =
    settingsBaseDir ?? path.join(os.homedir(), ".pi", "agent");

  const disabledPaths = getDisabledPaths(settings, resolvedSettingsBaseDir);
  const rawSkills: RawSkill[] = [];
  const visitedRealPaths = new Set<string>();

  const defaultScanDirs = [
    path.join(process.cwd(), ".pi", "skills"),
    ...collectAncestorAgentsSkillDirs(process.cwd()),
    path.join(os.homedir(), ".pi", "agent", "skills"),
    path.join(os.homedir(), ".agents", "skills"),
  ];

  const configuredPaths = collectConfiguredSkillPaths(
    settings,
    resolvedSettingsBaseDir
  );

  const scanTargets = uniquePaths([
    ...(overrideDirs ?? defaultScanDirs),
    ...configuredPaths,
  ]);

  for (const target of scanTargets) {
    scanSkillPath(target, rawSkills, visitedRealPaths);
  }

  // Group by name — first occurrence wins.
  const byName = new Map<string, SkillInfo>();
  const pathsByName = new Map<string, string[]>();

  for (const raw of rawSkills) {
    if (!pathsByName.has(raw.name)) {
      pathsByName.set(raw.name, []);
    }
    pathsByName.get(raw.name)?.push(raw.filePath);

    if (!byName.has(raw.name)) {
      byName.set(raw.name, {
        name: raw.name,
        description: raw.description,
        filePath: raw.filePath,
        allPaths: [],
        mode: DisableMode.Enabled,
        tokens: estimateSkillPromptTokens(raw),
        hasDuplicates: false,
      });
    }
  }

  // Fill in allPaths and compute mode.
  for (const [name, skill] of byName) {
    const allPaths = pathsByName.get(name) ?? [skill.filePath];
    skill.allPaths = allPaths;
    skill.hasDuplicates = allPaths.length > 1;

    const allDisabled = allPaths.every((p) =>
      isSkillDisabled(path.resolve(p), disabledPaths)
    );

    if (allDisabled) {
      skill.mode = DisableMode.Disabled;
    } else if (rawSkills.find((r) => r.name === name)?.disableModelInvocation) {
      skill.mode = DisableMode.Hidden;
    }
  }

  const skills = [...byName.values()].toSorted((a, b) =>
    a.name.localeCompare(b.name)
  );
  return { skills, byName };
}
