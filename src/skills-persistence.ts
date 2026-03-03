/**
 * Persistence layer for skill toggle changes.
 *
 * Writes to two locations:
 *   1. settings.json — `-path` entries to disable skills
 *   2. SKILL.md frontmatter — `disable-model-invocation: true` to hide skills
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { DisableMode } from "./enums.js";
import type { Settings, SkillInfo } from "./types.js";

// ---------------------------------------------------------------------------
// Settings file I/O
// ---------------------------------------------------------------------------

export function loadSettings(settingsPath: string): Settings {
  try {
    if (fs.existsSync(settingsPath)) {
      return JSON.parse(fs.readFileSync(settingsPath, "utf8"));
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
  value: string
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
    if (colonIndex === -1) {
      continue;
    }

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
    if (colonIndex === -1) {
      return true;
    }

    const lineKey = line.slice(0, colonIndex).trim();
    return lineKey !== key;
  });

  return `---\n${filteredLines.join("\n")}\n---${rest}`;
}

// ---------------------------------------------------------------------------
// Apply changes
// ---------------------------------------------------------------------------

function resolvePathFromBase(input: string, baseDir: string): string {
  const trimmed = input.trim();
  if (trimmed === "~") {
    return path.normalize(os.homedir());
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

function getSkillRelativePath(skillFilePath: string, agentDir: string): string {
  const skillDir = path.dirname(skillFilePath);

  if (skillDir.startsWith(`${agentDir}${path.sep}`) || skillDir === agentDir) {
    return path.relative(agentDir, skillDir);
  }

  // Fall back to absolute path.
  return skillDir;
}

function buildFrontmatterContent(
  content: string,
  disableModelInvocation: boolean
): string {
  return disableModelInvocation
    ? setFrontmatterField(content, "disable-model-invocation", "true")
    : removeFrontmatterField(content, "disable-model-invocation");
}

function rollbackFrontmatterWrites(
  writtenPaths: string[],
  originalContents: Map<string, string>
): void {
  for (let i = writtenPaths.length - 1; i >= 0; i--) {
    const filePath = writtenPaths[i];
    const original = originalContents.get(filePath);
    if (original === undefined) {
      continue;
    }

    try {
      fs.writeFileSync(filePath, original);
    } catch {
      // Best-effort rollback.
    }
  }
}

function normalizeChangePath(filePath: string): string {
  return path.normalize(path.resolve(filePath));
}

/**
 * Apply toggle changes to settings.json and SKILL.md frontmatter.
 */
export function applyChanges(
  changes: Map<string, DisableMode>,
  skillsByName: Map<string, SkillInfo>,
  settingsPath: string,
  agentDir?: string
): void {
  const resolvedAgentDir =
    agentDir ?? path.join(process.env.HOME ?? "", ".pi", "agent");
  const settingsBaseDir = path.dirname(settingsPath);

  const settings = loadSettings(settingsPath);
  const existingSkills = settings.skills ?? [];
  const newSkills: string[] = [];

  // Collect paths to disable / undisable.
  const pathsToDisable = new Set<string>();
  const pathsToUndisable = new Set<string>();
  const frontmatterUpdates = new Map<string, boolean>();

  for (const [skillName, newMode] of changes) {
    const skill = skillsByName.get(skillName);
    if (!skill) {
      continue;
    }

    if (newMode === DisableMode.Disabled) {
      for (const fp of skill.allPaths) {
        pathsToDisable.add(normalizeChangePath(fp));
      }
      continue;
    }

    for (const fp of skill.allPaths) {
      pathsToUndisable.add(normalizeChangePath(fp));
    }

    if (newMode === DisableMode.Hidden) {
      frontmatterUpdates.set(skill.filePath, true);
    }

    if (newMode === DisableMode.Enabled) {
      frontmatterUpdates.set(skill.filePath, false);
    }
  }

  // Filter existing entries — remove disable entries for skills being re-enabled/unhidden.
  for (const entry of existingSkills) {
    if (typeof entry !== "string") {
      continue;
    }

    if (!entry.startsWith("-")) {
      newSkills.push(entry);
      continue;
    }

    const entryDir = resolvePathFromBase(entry.slice(1), settingsBaseDir);
    const shouldRemove = [...pathsToUndisable].some((fp) => {
      const skillDir = path.dirname(fp);
      return entryDir === skillDir || entryDir === fp;
    });

    if (!shouldRemove) {
      newSkills.push(entry);
    }
  }

  // Add new disable entries.
  const existingDisableDirs = new Set(
    newSkills
      .filter((s) => s.startsWith("-"))
      .map((s) => resolvePathFromBase(s.slice(1), settingsBaseDir))
  );

  for (const fp of pathsToDisable) {
    const skillDir = path.dirname(fp);
    if (existingDisableDirs.has(skillDir) || existingDisableDirs.has(fp)) {
      continue;
    }

    const relPath = getSkillRelativePath(fp, resolvedAgentDir);
    newSkills.push(`-${relPath}`);
    existingDisableDirs.add(skillDir);
  }

  const originalContents = new Map<string, string>();
  const writtenFrontmatterPaths: string[] = [];

  // Apply frontmatter updates first. If this fails, settings are left untouched.
  try {
    for (const [filePath, disableModelInvocation] of frontmatterUpdates) {
      const originalContent = fs.readFileSync(filePath, "utf8");
      originalContents.set(filePath, originalContent);

      const newContent = buildFrontmatterContent(
        originalContent,
        disableModelInvocation
      );

      if (newContent !== originalContent) {
        fs.writeFileSync(filePath, newContent);
        writtenFrontmatterPaths.push(filePath);
      }
    }
  } catch (error) {
    rollbackFrontmatterWrites(writtenFrontmatterPaths, originalContents);
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to update skill frontmatter: ${message}`, {
      cause: error,
    });
  }

  // Persist settings; roll back frontmatter if this write fails.
  settings.skills = newSkills;
  try {
    saveSettings(settings, settingsPath);
  } catch (error) {
    rollbackFrontmatterWrites(writtenFrontmatterPaths, originalContents);
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to save settings: ${message}`, {
      cause: error,
    });
  }
}
