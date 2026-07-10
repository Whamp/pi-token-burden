import type { DisableMode, ToolEnvelope } from './enums.js';

/** One model-facing skill catalog entry parsed from the system prompt. */
export interface SkillEntry {
  name: string;
  description: string;
  location: string;
  chars: number;
  tokens: number;
}

/** Minimal row shape accepted by fuzzy filtering. */
export interface FilterItem {
  label: string;
  tokens: number;
}

/** One labeled width allocation in the token-budget bar. */
export interface BarSegment {
  label: string;
  width: number;
}

/** Serialized token cost for one active or inactive tool definition. */
export interface ToolEntry {
  name: string;
  chars: number;
  tokens: number;
  content: string;
}

/** Active, inactive, and provider-specific tool-definition costs. */
interface ToolSectionData {
  active: ToolEntry[];
  inactive: ToolEntry[];
  variants?: ToolEntry[];
  countedEnvelope?: ToolEnvelope;
}

/** One measured Budget Section and its optional drill-down data. */
export interface PromptSection {
  label: string;
  chars: number;
  tokens: number;
  /** Raw text of this section from the system prompt. */
  content?: string;
  tools?: ToolSectionData;
  children?: {
    label: string;
    chars: number;
    tokens: number;
    content?: string;
  }[];
}

/** Complete Token Budget Pipeline result for one assembled prompt. */
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
  /** Raw text of this section from the system prompt. */
  content?: string;
  tools?: ToolSectionData;
  /** Children shown when drilling down. */
  children?: TableItem[];
}

// ---------------------------------------------------------------------------
// Skill toggle types
// ---------------------------------------------------------------------------

/** Discovered skill metadata plus its current visibility and token cost. */
export interface SkillInfo {
  name: string;
  description: string;
  filePath: string;
  allPaths: string[];
  mode: DisableMode;
  tokens: number;
  hasDuplicates: boolean;
}

/** Render-ready skill row including pending-session state. */
export interface SkillManagementRow {
  skill: SkillInfo;
  label: string;
  mode: DisableMode;
  hasChanged: boolean;
  hasDuplicates: boolean;
  tokens: number;
}

/** Pi settings fields used by skill discovery and visibility persistence. */
export interface Settings {
  skills?: string[];
  packages?: unknown[];
  [key: string]: unknown;
}

/** Result emitted when the user exits a Skill Management Session. */
export interface SkillToggleResult {
  applied: boolean;
  changes: Map<string, DisableMode>;
}

/** Observable save outcome returned to the command handler. */
export type SkillSaveOutcome =
  | { ok: true; saved: false }
  | { ok: true; saved: true; summary: string }
  | { ok: false; saved: false; errorMessage: string };
