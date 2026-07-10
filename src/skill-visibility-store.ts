/**
 * Skill Visibility Store.
 *
 * Persists Skill Visibility State to two durable locations:
 *   1. settings.json — `-path` entries for Disabled skills
 *   2. SKILL.md frontmatter — `disable-model-invocation: true` for Hidden skills
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { DisableMode } from './enums.js';
import type { Settings, SkillInfo } from './types.js';
import { isRecord } from './utils.js';

// ---------------------------------------------------------------------------
// Settings file I/O
// ---------------------------------------------------------------------------

function decodeSettings(value: unknown): Settings {
  if (!isRecord(value)) {
    return {};
  }

  const settings: Settings = {};
  for (const [key, entry] of Object.entries(value)) {
    if (key === 'skills') {
      if (Array.isArray(entry) && entry.every((item) => typeof item === 'string')) {
        settings.skills = entry;
      }
      continue;
    }

    if (key === 'packages') {
      if (Array.isArray(entry)) {
        settings.packages = entry;
      }
      continue;
    }

    settings[key] = entry;
  }
  return settings;
}

/** Load and validate known Pi settings fields while preserving extension keys. */
export function loadSettings(settingsPath: string): Settings {
  try {
    if (fs.existsSync(settingsPath)) {
      const parsed: unknown = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      return decodeSettings(parsed);
    }
  } catch {
    // Ignore
  }
  return {};
}

/** Persist Pi settings as formatted JSON, creating the parent directory. */
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

/** Set or create one scalar field in a skill's YAML frontmatter. */
export function setFrontmatterField(content: string, key: string, value: string): string {
  if (!content.startsWith('---')) {
    return `---\n${key}: ${value}\n---\n${content}`;
  }

  const endIndex = content.indexOf('\n---', 3);
  if (endIndex === -1) {
    return `---\n${key}: ${value}\n---\n${content}`;
  }

  const frontmatter = content.slice(4, endIndex);
  const rest = content.slice(endIndex + 4);
  const lines = frontmatter.split('\n');

  let found = false;
  for (const [index, line] of lines.entries()) {
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) {
      continue;
    }

    const lineKey = line.slice(0, colonIndex).trim();
    if (lineKey === key) {
      lines[index] = `${key}: ${value}`;
      found = true;
      break;
    }
  }

  if (!found) {
    lines.push(`${key}: ${value}`);
  }

  return `---\n${lines.join('\n')}\n---${rest}`;
}

/** Remove one field from a skill's YAML frontmatter when present. */
export function removeFrontmatterField(content: string, key: string): string {
  if (!content.startsWith('---')) {
    return content;
  }

  const endIndex = content.indexOf('\n---', 3);
  if (endIndex === -1) {
    return content;
  }

  const frontmatter = content.slice(4, endIndex);
  const rest = content.slice(endIndex + 4);
  const lines = frontmatter.split('\n');

  const filteredLines = lines.filter((line) => {
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) {
      return true;
    }

    const lineKey = line.slice(0, colonIndex).trim();
    return lineKey !== key;
  });

  return `---\n${filteredLines.join('\n')}\n---${rest}`;
}

// ---------------------------------------------------------------------------
// Apply changes
// ---------------------------------------------------------------------------

function resolvePathFromBase(input: string, baseDir: string): string {
  const trimmed = input.trim();
  if (trimmed === '~') {
    return path.normalize(os.homedir());
  }
  if (trimmed.startsWith('~/')) {
    return path.join(os.homedir(), trimmed.slice(2));
  }
  if (trimmed.startsWith('~')) {
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

function buildFrontmatterContent(content: string, disableModelInvocation: boolean): string {
  return disableModelInvocation
    ? setFrontmatterField(content, 'disable-model-invocation', 'true')
    : removeFrontmatterField(content, 'disable-model-invocation');
}

function rollbackFrontmatterWrites(
  writtenPaths: string[],
  originalContents: Map<string, string>,
): void {
  for (const filePath of writtenPaths.toReversed()) {
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

/** Apply durable Skill Visibility State changes. */
function applyChanges(
  changes: Map<string, DisableMode>,
  skillsByName: Map<string, SkillInfo>,
  settingsPath: string,
  agentDir?: string,
): void {
  const resolvedAgentDir = agentDir ?? path.join(process.env.HOME ?? '', '.pi', 'agent');
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

    if (newMode === DisableMode.DISABLED) {
      for (const fp of skill.allPaths) {
        pathsToDisable.add(normalizeChangePath(fp));
      }
      continue;
    }

    for (const fp of skill.allPaths) {
      pathsToUndisable.add(normalizeChangePath(fp));
    }

    if (newMode === DisableMode.HIDDEN) {
      frontmatterUpdates.set(skill.filePath, true);
    }

    if (newMode === DisableMode.ENABLED) {
      frontmatterUpdates.set(skill.filePath, false);
    }
  }

  // Filter existing entries — remove disable entries for skills being re-enabled/unhidden.
  for (const entry of existingSkills) {
    if (typeof entry !== 'string') {
      continue;
    }

    if (!entry.startsWith('-')) {
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
      .filter((s) => s.startsWith('-'))
      .map((s) => resolvePathFromBase(s.slice(1), settingsBaseDir)),
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
      const originalContent = fs.readFileSync(filePath, 'utf8');
      originalContents.set(filePath, originalContent);

      const newContent = buildFrontmatterContent(originalContent, disableModelInvocation);

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

/** Persist Skill Visibility State changes across settings and skill files. */
export class SkillVisibilityStore {
  private readonly settingsPath: string;
  private readonly agentDir?: string;

  constructor(settingsPath: string, agentDir?: string) {
    this.settingsPath = settingsPath;
    this.agentDir = agentDir;
  }

  applyChanges(changes: Map<string, DisableMode>, skillsByName: Map<string, SkillInfo>): void {
    applyChanges(changes, skillsByName, this.settingsPath, this.agentDir);
  }
}
