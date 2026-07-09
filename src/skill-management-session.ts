import { DisableMode } from './enums.js';
import { estimateTokens } from './parser.js';
import {
  estimateSkillsPromptSectionTokens,
  formatSkillPromptEntry,
  formatSkillsPromptSection,
} from './skills.js';
import type {
  ParsedPrompt,
  PromptSection,
  SkillEntry,
  SkillInfo,
  SkillManagementRow,
} from './types.js';
import { fuzzyFilter } from './utils.js';

function nextVisibilityState(mode: DisableMode): DisableMode {
  if (mode === DisableMode.Enabled) {
    return DisableMode.Hidden;
  }
  if (mode === DisableMode.Hidden) {
    return DisableMode.Disabled;
  }
  return DisableMode.Enabled;
}

const SKILLS_BUDGET_SECTION_LABEL = 'Skills';

/** Return whether a Budget Section label identifies the skill catalog. */
export function isSkillsBudgetSectionLabel(label: string): boolean {
  return (
    label === SKILLS_BUDGET_SECTION_LABEL || label.startsWith(`${SKILLS_BUDGET_SECTION_LABEL} (`)
  );
}

function decodeXml(value: string): string {
  return value
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&amp;', '&');
}

/** Merge discovered skills with their current Combined System Prompt entries. */
export function reconcileSkillsWithPrompt(
  discoveredSkills: SkillInfo[],
  promptSkills: SkillEntry[],
): SkillInfo[] {
  const promptByName = new Map(promptSkills.map((skill) => [skill.name, skill]));

  return discoveredSkills.map((skill) => {
    const promptSkill = promptByName.get(skill.name);
    if (!promptSkill) {
      return skill.mode === DisableMode.Enabled
        ? { ...skill, mode: DisableMode.Hidden }
        : { ...skill };
    }

    return {
      ...skill,
      description: decodeXml(promptSkill.description),
      filePath: decodeXml(promptSkill.location),
      mode: DisableMode.Enabled,
      tokens: promptSkill.tokens,
    };
  });
}

/** Build the skill-catalog Budget Section for the current visibility states. */
export function buildSkillsBudgetSection(skills: SkillInfo[]): PromptSection {
  const visibleSkills = skills.filter((skill) => skill.mode === DisableMode.Enabled);
  const content = formatSkillsPromptSection(skills);

  return {
    label: `Skills (${String(visibleSkills.length)})`,
    chars: content.length,
    tokens: estimateTokens(content),
    content,
    children: visibleSkills.map((skill) => {
      const childContent = formatSkillPromptEntry(skill);
      return {
        label: skill.name,
        chars: childContent.length,
        tokens: estimateTokens(childContent),
        content: childContent,
      };
    }),
  };
}

/** Add a manageable skill Budget Section when discovery found hidden skills. */
export function ensureSkillsSectionForManagement(
  parsed: ParsedPrompt,
  discoveredSkills: SkillInfo[],
): ParsedPrompt {
  if (
    discoveredSkills.length === 0 ||
    parsed.sections.some((section) => isSkillsBudgetSectionLabel(section.label))
  ) {
    return parsed;
  }

  return {
    ...parsed,
    sections: [...parsed.sections, buildSkillsBudgetSection(discoveredSkills)],
  };
}

/** Project pending Skill Management Session changes into parsed budget data. */
export function applySkillManagementToParsed(
  originalParsed: ParsedPrompt,
  session: SkillManagementSession,
): ParsedPrompt {
  const sections = originalParsed.sections.map((section) => ({ ...section }));
  const skillsSectionIndex = sections.findIndex((section) =>
    isSkillsBudgetSectionLabel(section.label),
  );

  if (skillsSectionIndex !== -1) {
    sections[skillsSectionIndex] = buildSkillsBudgetSection(session.effectiveSkills());
  }

  return {
    sections,
    totalChars: originalParsed.totalChars,
    totalTokens: session.adjustedTotalTokens(originalParsed.totalTokens),
    skills: originalParsed.skills,
  };
}

/** Own pending skill-visibility edits until the user saves or discards them. */
export class SkillManagementSession {
  private readonly skillsList: SkillInfo[];
  private readonly skillsByName: Map<string, SkillInfo>;
  private readonly pendingChanges = new Map<string, DisableMode>();

  constructor(skills: SkillInfo[]) {
    this.skillsList = skills;
    this.skillsByName = new Map(skills.map((skill) => [skill.name, skill]));
  }

  get skills(): SkillInfo[] {
    return this.skillsList;
  }

  get pendingCount(): number {
    return this.pendingChanges.size;
  }

  changes(): Map<string, DisableMode> {
    return new Map(this.pendingChanges);
  }

  effectiveMode(skillName: string): DisableMode | undefined {
    return this.pendingChanges.get(skillName) ?? this.skillsByName.get(skillName)?.mode;
  }

  cycle(skillName: string): void {
    const skill = this.skillsByName.get(skillName);
    if (!skill) {
      return;
    }

    const nextMode = nextVisibilityState(this.effectiveMode(skillName) ?? skill.mode);
    if (nextMode === skill.mode) {
      this.pendingChanges.delete(skillName);
      return;
    }

    this.pendingChanges.set(skillName, nextMode);
  }

  adjustedTotalTokens(originalTotalTokens: number): number {
    return originalTotalTokens + this.tokenDelta;
  }

  discardPending(): void {
    this.pendingChanges.clear();
  }

  commitPending(): void {
    for (const [name, mode] of this.pendingChanges) {
      const skill = this.skillsByName.get(name);
      if (skill) {
        skill.mode = mode;
      }
    }
    this.pendingChanges.clear();
  }

  effectiveSkills(): SkillInfo[] {
    return this.skillsList.map((skill) => ({
      ...skill,
      mode: this.effectiveMode(skill.name) ?? skill.mode,
    }));
  }

  canManageSection(label: string): boolean {
    return isSkillsBudgetSectionLabel(label) && this.skillsList.length > 0;
  }

  skillRows(query = ''): SkillManagementRow[] {
    const rows = this.skillsList.map((skill) => ({
      skill,
      label: skill.name,
      mode: this.effectiveMode(skill.name) ?? skill.mode,
      hasChanged: this.pendingChanges.has(skill.name),
      hasDuplicates: skill.hasDuplicates,
      tokens: skill.tokens,
    }));

    return fuzzyFilter(rows, query);
  }

  get tokenDelta(): number {
    const beforeTokens = estimateSkillsPromptSectionTokens(this.skillsList);
    const afterTokens = estimateSkillsPromptSectionTokens(this.effectiveSkills());
    return afterTokens - beforeTokens;
  }
}
