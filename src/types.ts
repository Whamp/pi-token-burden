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
