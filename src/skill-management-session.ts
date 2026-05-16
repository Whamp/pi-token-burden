import { DisableMode } from "./enums.js";
import { estimateSkillsPromptSectionTokens } from "./skills.js";
import type { SkillInfo } from "./types.js";

function nextVisibilityState(mode: DisableMode): DisableMode {
  if (mode === DisableMode.Enabled) {
    return DisableMode.Hidden;
  }
  if (mode === DisableMode.Hidden) {
    return DisableMode.Disabled;
  }
  return DisableMode.Enabled;
}

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
    return (
      this.pendingChanges.get(skillName) ??
      this.skillsByName.get(skillName)?.mode
    );
  }

  cycle(skillName: string): void {
    const skill = this.skillsByName.get(skillName);
    if (!skill) {
      return;
    }

    const nextMode = nextVisibilityState(
      this.effectiveMode(skillName) ?? skill.mode
    );
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

  get tokenDelta(): number {
    const beforeTokens = estimateSkillsPromptSectionTokens(this.skillsList);
    const afterTokens = estimateSkillsPromptSectionTokens(
      this.effectiveSkills()
    );
    return afterTokens - beforeTokens;
  }
}
