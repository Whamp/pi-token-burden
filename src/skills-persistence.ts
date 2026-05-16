import type { DisableMode } from "./enums.js";
import { SkillVisibilityStore } from "./skill-visibility-store.js";
import type { SkillInfo } from "./types.js";

export {
  loadSettings,
  removeFrontmatterField,
  saveSettings,
  setFrontmatterField,
} from "./skill-visibility-store.js";

/** Compatibility wrapper for Skill Visibility Store persistence. */
export function applyChanges(
  changes: Map<string, DisableMode>,
  skillsByName: Map<string, SkillInfo>,
  settingsPath: string,
  agentDir?: string
): void {
  new SkillVisibilityStore(settingsPath, agentDir).applyChanges(
    changes,
    skillsByName
  );
}
