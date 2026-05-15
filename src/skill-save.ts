import { DisableMode } from "./enums.js";
import type { SkillSaveOutcome, SkillToggleResult } from "./types.js";

type PersistSkillChanges = (changes: Map<string, DisableMode>) => void;

function summarizeSkillChanges(changes: Map<string, DisableMode>): string {
  const counts = {
    enabled: 0,
    hidden: 0,
    disabled: 0,
  };

  for (const mode of changes.values()) {
    if (mode === DisableMode.Enabled) {
      counts.enabled += 1;
    } else if (mode === DisableMode.Hidden) {
      counts.hidden += 1;
    } else {
      counts.disabled += 1;
    }
  }

  const parts: string[] = [];
  if (counts.enabled > 0) {
    parts.push(`${counts.enabled} enabled`);
  }
  if (counts.hidden > 0) {
    parts.push(`${counts.hidden} hidden`);
  }
  if (counts.disabled > 0) {
    parts.push(`${counts.disabled} disabled`);
  }

  return parts.join(", ");
}

export function saveSkillToggleResult(
  result: SkillToggleResult,
  persist: PersistSkillChanges
): SkillSaveOutcome {
  if (!result.applied || result.changes.size === 0) {
    return { ok: true, saved: false };
  }

  try {
    persist(result.changes);
  } catch (error) {
    return {
      ok: false,
      saved: false,
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  }

  return {
    ok: true,
    saved: true,
    summary: summarizeSkillChanges(result.changes),
  };
}
