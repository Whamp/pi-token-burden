/** User-visible persistence states for an installed skill. */
export enum DisableMode {
  Enabled = 'enabled',
  Hidden = 'hidden',
  Disabled = 'disabled',
}

/** Provider-specific shapes used to estimate tool-definition tokens. */
export enum ToolEnvelope {
  Compact = 'compact',
  OpenAiResponses = 'openai-responses',
  OpenAiChat = 'openai-chat',
  Anthropic = 'anthropic',
  Bedrock = 'bedrock',
  Google = 'google',
  Mistral = 'mistral',
}
