import type { DisableMode } from "./enums.js";

export interface SkillEntry {
  name: string;
  description: string;
  location: string;
  chars: number;
  tokens: number;
}

export interface AgentsFileEntry {
  path: string;
  chars: number;
  tokens: number;
}

export interface FilterItem {
  label: string;
  tokens: number;
}

export interface BarSegment {
  label: string;
  width: number;
}

export interface PromptSection {
  label: string;
  chars: number;
  tokens: number;
  children?: { label: string; chars: number; tokens: number }[];
}

export interface ParsedPrompt {
  sections: PromptSection[];
  totalChars: number;
  totalTokens: number;
  skills: SkillEntry[];
}

/** Item displayed in the interactive table (section or child). */
export interface TableItem {
  label: string;
  tokens: number;
  chars: number;
  /** Percentage of total system prompt tokens. */
  pct: number;
  /** Whether this item can be drilled into (has children). */
  drillable: boolean;
  /** Children shown when drilling down. */
  children?: TableItem[];
}

// ---------------------------------------------------------------------------
// Skill toggle types
// ---------------------------------------------------------------------------

// DisableMode enum is in enums.ts per factory rules
export type { DisableMode } from "./enums.js";

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

export interface SkillToggleResult {
  applied: boolean;
  changes: Map<string, DisableMode>;
}
