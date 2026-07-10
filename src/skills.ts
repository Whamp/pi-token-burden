/**
 * Filesystem-based skill discovery.
 *
 * Scans the same directories pi uses to find skills, reads SKILL.md
 * frontmatter, deduplicates by name (first wins), and computes each
 * skill's disable state from settings.json + frontmatter.
 */

import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { parse as parseYaml } from 'yaml';

import { DisableMode } from './enums.js';
import { estimateTokens } from './parser.js';
import type { Settings, SkillInfo } from './types.js';
import { isRecord } from './utils.js';

// ---------------------------------------------------------------------------
// Frontmatter parsing
// ---------------------------------------------------------------------------

interface FrontmatterResult {
  name: string;
  description: string;
  disableModelInvocation: boolean;
}

/** Decode the skill fields used by discovery from a SKILL.md document. */
export function parseFrontmatter(content: string, fallbackName: string): FrontmatterResult {
  if (!content.startsWith('---')) {
    return {
      name: fallbackName,
      description: '',
      disableModelInvocation: false,
    };
  }

  const normalized = content.replaceAll('\r\n', '\n').replaceAll('\r', '\n');
  const endIndex = normalized.indexOf('\n---', 3);
  if (endIndex === -1) {
    return {
      name: fallbackName,
      description: '',
      disableModelInvocation: false,
    };
  }

  try {
    const parsed: unknown = parseYaml(normalized.slice(4, endIndex));
    const frontmatter = isRecord(parsed) ? parsed : {};

    const nameValue = frontmatter.name;
    const descriptionValue = frontmatter.description;
    const disableModelInvocationValue = frontmatter['disable-model-invocation'];

    return {
      name: typeof nameValue === 'string' ? nameValue : fallbackName,
      description: typeof descriptionValue === 'string' ? descriptionValue : '',
      disableModelInvocation: disableModelInvocationValue === true,
    };
  } catch {
    return {
      name: fallbackName,
      description: '',
      disableModelInvocation: false,
    };
  }
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

interface SkillPatternRules {
  excludes: string[];
  forceIncludes: string[];
  forceExcludes: string[];
}

interface ScopedSkillPatternRules extends SkillPatternRules {
  baseDir: string;
}

interface SkillDisableRules extends SkillPatternRules {
  exactPaths: Set<string>;
  scoped: ScopedSkillPatternRules[];
}

interface ConfiguredSkillSources {
  paths: string[];
  scopedRules: ScopedSkillPatternRules[];
}

interface IgnoreRule {
  baseDir: string;
  pattern: string;
  negated: boolean;
  directoryOnly: boolean;
  rooted: boolean;
}

const IGNORE_FILE_NAMES = ['.gitignore', '.ignore', '.fdignore'];

function loadRawSkill(filePath: string, skills: RawSkill[], visitedRealPaths: Set<string>): void {
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

    const content = fs.readFileSync(filePath, 'utf8');
    const parentDirName = path.basename(path.dirname(filePath));
    const { name, description, disableModelInvocation } = parseFrontmatter(content, parentDirName);

    if (!description) {
      return;
    }

    skills.push({ name, description, filePath, disableModelInvocation });
  } catch {
    // Skip invalid skill files
  }
}

function toPosixPath(input: string): string {
  return input.split(path.sep).join('/');
}

function parseIgnoreRule(line: string, baseDir: string): IgnoreRule | null {
  const trimmed = line.trim();
  if (!trimmed || (trimmed.startsWith('#') && !trimmed.startsWith('\\#'))) {
    return null;
  }

  let pattern = trimmed;
  let negated = false;
  if (pattern.startsWith('!')) {
    negated = true;
    pattern = pattern.slice(1);
  } else if (pattern.startsWith('\\!')) {
    pattern = pattern.slice(1);
  }
  if (pattern.startsWith('\\#')) {
    pattern = pattern.slice(1);
  }

  const rooted = pattern.startsWith('/');
  if (rooted) {
    pattern = pattern.slice(1);
  }

  const directoryOnly = pattern.endsWith('/');
  if (directoryOnly) {
    pattern = pattern.slice(0, -1);
  }

  return {
    baseDir,
    pattern: toPosixPath(pattern),
    negated,
    directoryOnly,
    rooted,
  };
}

function addIgnoreRules(dir: string, rules: IgnoreRule[]): void {
  for (const filename of IGNORE_FILE_NAMES) {
    const ignorePath = path.join(dir, filename);
    if (!fs.existsSync(ignorePath)) {
      continue;
    }

    try {
      const content = fs.readFileSync(ignorePath, 'utf8');
      for (const line of content.split(/\r?\n/)) {
        const rule = parseIgnoreRule(line, dir);
        if (rule) {
          rules.push(rule);
        }
      }
    } catch {
      // Ignore unreadable ignore files
    }
  }
}

function ignoreRuleMatches(rule: IgnoreRule, entryPath: string, isDirectory: boolean): boolean {
  if (rule.directoryOnly && !isDirectory) {
    return false;
  }

  const relativePath = toPosixPath(path.relative(rule.baseDir, entryPath));
  if (!relativePath || relativePath.startsWith('../') || relativePath === '..') {
    return false;
  }

  if (rule.rooted || rule.pattern.includes('/')) {
    return relativePath === rule.pattern || relativePath.startsWith(`${rule.pattern}/`);
  }

  return relativePath.split('/').includes(rule.pattern);
}

function isIgnored(entryPath: string, isDirectory: boolean, rules: IgnoreRule[]): boolean {
  let ignored = false;
  for (const rule of rules) {
    if (ignoreRuleMatches(rule, entryPath, isDirectory)) {
      ignored = !rule.negated;
    }
  }
  return ignored;
}

function getEntryKind(
  entry: fs.Dirent,
  entryPath: string,
): { isDirectory: boolean; isFile: boolean } | null {
  let isDirectory = entry.isDirectory();
  let isFile = entry.isFile();
  if (entry.isSymbolicLink()) {
    try {
      const stats = fs.statSync(entryPath);
      isDirectory = stats.isDirectory();
      isFile = stats.isFile();
    } catch {
      return null;
    }
  }

  return { isDirectory, isFile };
}

/** Discover skill documents below one filesystem root without following cycles. */
export function scanSkillDir(
  dir: string,
  skills: RawSkill[],
  visitedRealPaths: Set<string>,
  visitedDirs?: Set<string>,
  includeRootFiles?: boolean,
  ignoreRules?: IgnoreRule[],
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

  const rules = ignoreRules ?? [];
  addIgnoreRules(dir, rules);

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name !== 'SKILL.md') {
        continue;
      }

      const entryPath = path.join(dir, entry.name);
      const kind = getEntryKind(entry, entryPath);
      if (!kind?.isFile || isIgnored(entryPath, false, rules)) {
        continue;
      }

      loadRawSkill(entryPath, skills, visitedRealPaths);
      return;
    }

    for (const entry of entries) {
      if (entry.name.startsWith('.')) {
        continue;
      }
      if (entry.name === 'node_modules') {
        continue;
      }

      const entryPath = path.join(dir, entry.name);
      const kind = getEntryKind(entry, entryPath);
      if (!kind) {
        continue;
      }

      if (isIgnored(entryPath, kind.isDirectory, rules)) {
        continue;
      }

      if (kind.isDirectory) {
        scanSkillDir(entryPath, skills, visitedRealPaths, visited, false, rules);
      } else if ((includeRootFiles ?? false) && kind.isFile && entry.name.endsWith('.md')) {
        loadRawSkill(entryPath, skills, visitedRealPaths);
      }
    }
  } catch {
    // Skip inaccessible directories
  }
}

function shouldIncludeRootSkillFiles(sourcePath: string): boolean {
  return !toPosixPath(path.normalize(sourcePath)).includes('/.agents/skills');
}

function scanSkillPath(
  sourcePath: string,
  skills: RawSkill[],
  visitedRealPaths: Set<string>,
): void {
  if (!fs.existsSync(sourcePath)) {
    return;
  }

  try {
    const stats = fs.statSync(sourcePath);
    if (stats.isDirectory()) {
      scanSkillDir(
        sourcePath,
        skills,
        visitedRealPaths,
        undefined,
        shouldIncludeRootSkillFiles(sourcePath),
      );
      return;
    }

    if (stats.isFile() && sourcePath.endsWith('.md')) {
      loadRawSkill(sourcePath, skills, visitedRealPaths);
    }
  } catch {
    // Skip inaccessible files/paths
  }
}

// ---------------------------------------------------------------------------
// Token estimation for skill prompt entries
// ---------------------------------------------------------------------------

/** Escape one value for the model-facing skill-catalog XML. */
function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

/** Render one skill as its model-facing XML catalog entry. */
export function formatSkillPromptEntry(skill: {
  name: string;
  description: string;
  filePath: string;
}): string {
  return [
    '  <skill>',
    `    <name>${escapeXml(skill.name)}</name>`,
    `    <description>${escapeXml(skill.description)}</description>`,
    `    <location>${escapeXml(skill.filePath)}</location>`,
    '  </skill>',
  ].join('\n');
}

/** Render the complete model-facing catalog for enabled skills. */
export function formatSkillsPromptSection(
  skills: {
    name: string;
    description: string;
    filePath: string;
    mode: DisableMode;
  }[],
): string {
  const visibleSkills = skills.filter((skill) => skill.mode === DisableMode.ENABLED);
  if (visibleSkills.length === 0) {
    return '';
  }

  return [
    '\n\nThe following skills provide specialized instructions for specific tasks.',
    "Use the read tool to load a skill's file when the task matches its description.",
    'When a skill file references a relative path, resolve it against the skill directory (parent of SKILL.md / dirname of the path) and use that absolute path in tool commands.',
    '',
    '<available_skills>',
    ...visibleSkills.map(formatSkillPromptEntry),
    '</available_skills>',
  ].join('\n');
}

/** Count the full skill catalog with the same tokenizer as the budget parser. */
export function estimateSkillsPromptSectionTokens(
  skills: {
    name: string;
    description: string;
    filePath: string;
    mode: DisableMode;
  }[],
): number {
  return estimateTokens(formatSkillsPromptSection(skills));
}

/** Count one model-facing skill catalog entry. */
export function estimateSkillPromptTokens(skill: {
  name: string;
  description: string;
  filePath: string;
}): number {
  return estimateTokens(formatSkillPromptEntry(skill));
}

// ---------------------------------------------------------------------------
// Settings helpers
// ---------------------------------------------------------------------------

function isPatternEntry(entry: string): boolean {
  return (
    entry.startsWith('!') ||
    entry.startsWith('+') ||
    entry.startsWith('-') ||
    entry.includes('*') ||
    entry.includes('?')
  );
}

function resolvePathFromBase(input: string, baseDir: string): string {
  const trimmed = input.trim();
  if (trimmed === '~') {
    return os.homedir();
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

function createSkillDisableRules(settings: Settings, settingsBaseDir: string): SkillDisableRules {
  const rules: SkillDisableRules = {
    exactPaths: new Set<string>(),
    excludes: [],
    forceIncludes: [],
    forceExcludes: [],
    scoped: [],
  };

  for (const entry of settings.skills ?? []) {
    if (typeof entry !== 'string') {
      continue;
    }

    if (entry.startsWith('!')) {
      rules.excludes.push(entry.slice(1));
      continue;
    }
    if (entry.startsWith('+')) {
      rules.forceIncludes.push(entry.slice(1));
      continue;
    }
    if (entry.startsWith('-')) {
      const rawPath = entry.slice(1);
      const absolutePath = resolvePathFromBase(rawPath, settingsBaseDir);
      rules.exactPaths.add(path.normalize(absolutePath));
      rules.exactPaths.add(path.normalize(path.join(absolutePath, 'SKILL.md')));
      rules.forceExcludes.push(rawPath);
    }
  }

  return rules;
}

function globPatternToRegExp(pattern: string): RegExp {
  const escaped = pattern.replaceAll(/[$()+./:=?[\\\]^{|}]/g, '\\$&');
  return new RegExp(`^${escaped.replaceAll('*', '.*').replaceAll('?', '.')}$`);
}

function patternMatchesSkill(
  pattern: string,
  filePath: string,
  skillName: string,
  settingsBaseDir: string,
): boolean {
  const normalizedPattern = toPosixPath(pattern.replace(/^\.\//, ''));
  const normalizedFilePath = toPosixPath(path.normalize(filePath));
  const normalizedDir = toPosixPath(path.dirname(filePath));
  const candidates = [
    skillName,
    path.basename(path.dirname(filePath)),
    normalizedFilePath,
    normalizedDir,
    toPosixPath(path.relative(settingsBaseDir, filePath)),
    toPosixPath(path.relative(settingsBaseDir, path.dirname(filePath))),
  ];

  if (normalizedPattern.includes('*') || normalizedPattern.includes('?')) {
    const matcher = globPatternToRegExp(normalizedPattern);
    return candidates.some((candidate) => matcher.test(candidate));
  }

  return candidates.some(
    (candidate) => candidate === normalizedPattern || candidate.endsWith(`/${normalizedPattern}`),
  );
}

function applyPatternRules(
  disabled: boolean,
  filePath: string,
  skillName: string,
  baseDir: string,
  rules: SkillPatternRules,
): boolean {
  let nextDisabled = disabled;

  if (
    rules.excludes.some((pattern) => patternMatchesSkill(pattern, filePath, skillName, baseDir))
  ) {
    nextDisabled = true;
  }

  if (
    rules.forceIncludes.some((pattern) =>
      patternMatchesSkill(pattern, filePath, skillName, baseDir),
    )
  ) {
    nextDisabled = false;
  }

  if (
    rules.forceExcludes.some((pattern) =>
      patternMatchesSkill(pattern, filePath, skillName, baseDir),
    )
  ) {
    nextDisabled = true;
  }

  return nextDisabled;
}

function isUnderPath(filePath: string, baseDir: string): boolean {
  const relativePath = path.relative(baseDir, filePath);
  return Boolean(relativePath) && !relativePath.startsWith('..') && !path.isAbsolute(relativePath);
}

function isSkillDisabled(
  filePath: string,
  skillName: string,
  rules: SkillDisableRules,
  settingsBaseDir: string,
): boolean {
  const normalized = path.normalize(filePath);
  const dir = path.dirname(filePath);
  let disabled = rules.exactPaths.has(normalized) || rules.exactPaths.has(dir);

  disabled = applyPatternRules(disabled, filePath, skillName, settingsBaseDir, rules);

  for (const scopedRules of rules.scoped) {
    if (isUnderPath(filePath, scopedRules.baseDir)) {
      disabled = applyPatternRules(disabled, filePath, skillName, scopedRules.baseDir, scopedRules);
    }
  }

  return disabled;
}

function getPackageSource(entry: unknown): string | null {
  if (typeof entry === 'string') {
    return entry;
  }
  if (!entry || typeof entry !== 'object') {
    return null;
  }

  if (!('source' in entry)) {
    return null;
  }

  const { source } = entry;
  if (typeof source !== 'string') {
    return null;
  }

  return source;
}

function getPackageSkillPatterns(entry: unknown): string[] {
  if (!entry || typeof entry !== 'object' || !('skills' in entry)) {
    return [];
  }

  const { skills } = entry;
  if (!Array.isArray(skills)) {
    return [];
  }

  return skills.filter((skill): skill is string => typeof skill === 'string');
}

function createScopedSkillPatternRules(
  baseDir: string,
  patterns: string[],
): ScopedSkillPatternRules {
  return {
    baseDir,
    excludes: patterns
      .filter((pattern) => pattern.startsWith('!'))
      .map((pattern) => pattern.slice(1)),
    forceIncludes: patterns
      .filter((pattern) => pattern.startsWith('+'))
      .map((pattern) => pattern.slice(1)),
    forceExcludes: patterns
      .filter((pattern) => pattern.startsWith('-'))
      .map((pattern) => pattern.slice(1)),
  };
}

function isLocalPathLike(source: string): boolean {
  const trimmed = source.trim();
  return (
    trimmed.startsWith('.') ||
    trimmed.startsWith('/') ||
    trimmed === '~' ||
    trimmed.startsWith('~/') ||
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
  const result = spawnSync('npm', ['root', '-g'], {
    encoding: 'utf8',
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
    source.startsWith('git:') ||
    source.startsWith('http://') ||
    source.startsWith('https://') ||
    source.startsWith('ssh://') ||
    source.startsWith('git@')
  );
}

function parseGitSource(source: string): { host: string; repoPath: string } | null {
  const trimmed = source.trim();
  const withoutPrefix = trimmed.startsWith('git:') ? trimmed.slice('git:'.length) : trimmed;
  const withoutRef = withoutPrefix.split('#')[0]?.trim() ?? '';

  if (!withoutRef) {
    return null;
  }

  if (
    withoutRef.startsWith('http://') ||
    withoutRef.startsWith('https://') ||
    withoutRef.startsWith('ssh://')
  ) {
    try {
      const parsed = new URL(withoutRef);
      const { host, pathname } = parsed;
      const repoPath = pathname.replace(/^\/+/, '').replace(/\.git$/, '');

      if (!host || !repoPath) {
        return null;
      }

      return { host, repoPath };
    } catch {
      return null;
    }
  }

  if (withoutRef.startsWith('git@')) {
    const atIndex = withoutRef.indexOf('@');
    const colonIndex = withoutRef.indexOf(':');
    if (colonIndex === -1 || colonIndex <= atIndex) {
      return null;
    }

    const host = withoutRef.slice(atIndex + 1, colonIndex);
    const repoPath = withoutRef.slice(colonIndex + 1).replace(/\.git$/, '');

    if (!host || !repoPath) {
      return null;
    }

    return { host, repoPath };
  }

  const firstSlash = withoutRef.indexOf('/');
  if (firstSlash === -1) {
    return null;
  }

  const host = withoutRef.slice(0, firstSlash);
  const repoPath = withoutRef.slice(firstSlash + 1).replace(/\.git$/, '');
  if (!host || !repoPath) {
    return null;
  }

  return { host, repoPath };
}

function resolvePackageRoot(
  source: string,
  settingsBaseDir: string,
  npmRoot: string | null,
): string | null {
  const trimmed = source.trim();

  if (trimmed.startsWith('npm:')) {
    if (!npmRoot) {
      return null;
    }
    const spec = trimmed.slice('npm:'.length).trim();
    const packageName = parseNpmPackageName(spec);
    return path.join(npmRoot, packageName);
  }

  if (looksLikeGitSource(trimmed)) {
    const parsedGit = parseGitSource(trimmed);
    if (!parsedGit) {
      return null;
    }
    return path.join(settingsBaseDir, 'git', parsedGit.host, parsedGit.repoPath);
  }

  if (isLocalPathLike(trimmed)) {
    return resolvePathFromBase(trimmed, settingsBaseDir);
  }

  // Fallback aligns with package-manager behavior for unknown sources.
  return resolvePathFromBase(trimmed, settingsBaseDir);
}

function resolvePackageSkillPaths(packageRoot: string): string[] {
  const packageJsonPath = path.join(packageRoot, 'package.json');
  const resolvedPaths: string[] = [];

  if (fs.existsSync(packageJsonPath)) {
    try {
      const parsed: unknown = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      const manifestSkills = isRecord(parsed) && isRecord(parsed.pi) ? parsed.pi.skills : undefined;

      if (Array.isArray(manifestSkills)) {
        const plainEntries = manifestSkills.filter(
          (entry): entry is string => typeof entry === 'string' && !isPatternEntry(entry),
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

  const conventionalSkillsDir = path.join(packageRoot, 'skills');
  if (fs.existsSync(conventionalSkillsDir)) {
    return [conventionalSkillsDir];
  }

  return [packageRoot];
}

function collectConfiguredSkillSources(
  settings: Settings,
  settingsBaseDir: string,
): ConfiguredSkillSources {
  const configuredPaths: string[] = [];
  const scopedRules: ScopedSkillPatternRules[] = [];

  for (const entry of settings.skills ?? []) {
    if (typeof entry !== 'string') {
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
    return source?.startsWith('npm:') ?? false;
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

    const skillPatterns = getPackageSkillPatterns(entry);
    if (skillPatterns.length > 0) {
      scopedRules.push(createScopedSkillPatternRules(packageRoot, skillPatterns));
    }
  }

  return { paths: configuredPaths, scopedRules };
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
    if (fs.existsSync(path.join(dir, '.git'))) {
      return dir;
    }
    const parent = path.resolve(dir, '..');
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
    dirs.push(path.join(dir, '.agents', 'skills'));
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
  settingsBaseDir?: string,
): { skills: SkillInfo[]; byName: Map<string, SkillInfo> } {
  const resolvedSettingsBaseDir = settingsBaseDir ?? path.join(os.homedir(), '.pi', 'agent');

  const disableRules = createSkillDisableRules(settings, resolvedSettingsBaseDir);
  const rawSkills: RawSkill[] = [];
  const visitedRealPaths = new Set<string>();

  const defaultScanDirs = [
    path.join(process.cwd(), '.pi', 'skills'),
    ...collectAncestorAgentsSkillDirs(process.cwd()),
    path.join(os.homedir(), '.pi', 'agent', 'skills'),
    path.join(os.homedir(), '.agents', 'skills'),
  ];

  const configuredSources = collectConfiguredSkillSources(settings, resolvedSettingsBaseDir);
  disableRules.scoped.push(...configuredSources.scopedRules);

  const scanTargets = uniquePaths([
    ...(overrideDirs ?? defaultScanDirs),
    ...configuredSources.paths,
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
        mode: DisableMode.ENABLED,
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
      isSkillDisabled(path.resolve(p), name, disableRules, resolvedSettingsBaseDir),
    );

    if (allDisabled) {
      skill.mode = DisableMode.DISABLED;
    } else if (rawSkills.find((r) => r.name === name)?.disableModelInvocation) {
      skill.mode = DisableMode.HIDDEN;
    }
  }

  const skills = [...byName.values()].toSorted((a, b) => a.name.localeCompare(b.name));
  return { skills, byName };
}
