/**
 * Persistence layer for skill toggle changes.
 *
 * Writes to two locations:
 *   1. settings.json — `-path` entries to disable skills
 *   2. SKILL.md frontmatter — `disable-model-invocation: true` to hide skills
 */

import * as fs from "node:fs";
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

function updateSkillFrontmatter(
  filePath: string,
  disableModelInvocation: boolean
): void {
  const content = fs.readFileSync(filePath, "utf8");

  const newContent = disableModelInvocation
    ? setFrontmatterField(content, "disable-model-invocation", "true")
    : removeFrontmatterField(content, "disable-model-invocation");

  fs.writeFileSync(filePath, newContent);
}

function getSkillRelativePath(skillFilePath: string, agentDir: string): string {
  const skillDir = path.dirname(skillFilePath);

  if (skillDir.startsWith(`${agentDir}${path.sep}`) || skillDir === agentDir) {
    return path.relative(agentDir, skillDir);
  }

  // Fall back to absolute path
  return skillDir;
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
    if (!skill) {
      continue;
    }

    if (newMode === DisableMode.Disabled) {
      for (const fp of skill.allPaths) {
        pathsToDisable.add(fp);
      }
    } else if (newMode === DisableMode.Hidden) {
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
    const shouldRemove = [...pathsToUndisable].some((fp) => {
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
      .map((s) => path.resolve(s.slice(1)))
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
