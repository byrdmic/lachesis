// Configuration types for Lachesis

export type AIProvider = 'anthropic' | 'openai' | 'vertex' | 'other'

export type LachesisConfig = {
  vaultPath: string // Base Obsidian projects path
  // AI configuration
  defaultProvider: AIProvider
  defaultModel: string
  apiKeyEnvVar: string
}

export const DEFAULT_CONFIG: LachesisConfig = {
  vaultPath: '', // Will be set based on OS detection
  defaultProvider: 'openai',
  defaultModel: 'gpt-5.2',
  apiKeyEnvVar: 'OPENAI_API_KEY',
}

export const OPENAI_MODELS = [
  'gpt-5.2-pro',
  'gpt-5.2-chat-latest',
  'gpt-5.2',
  'gpt-5.1-codex-mini',
  'gpt-5.1-codex',
  'gpt-5.1',
  'gpt-5-mini',
  'gpt-5-nano',
] as const

export type OpenAIModelId = (typeof OPENAI_MODELS)[number]
