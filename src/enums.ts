/** User-visible persistence states for an installed skill. */
export enum DisableMode {
  ENABLED = 'enabled',
  HIDDEN = 'hidden',
  DISABLED = 'disabled',
}

/** Provider-specific shapes used to estimate tool-definition tokens. */
export enum ToolEnvelope {
  COMPACT = 'compact',
  OPEN_AI_RESPONSES = 'openai-responses',
  OPEN_AI_CHAT = 'openai-chat',
  ANTHROPIC = 'anthropic',
  BEDROCK = 'bedrock',
  GOOGLE = 'google',
  MISTRAL = 'mistral',
}
