// Configuration types for Lachesis

export type AIProvider = 'anthropic' | 'openai' | 'vertex' | 'other'

export type LachesisConfig = {
  vaultPath: string // Base Obsidian projects path
  defaultInterviewDepth: 'short' | 'medium' | 'deep'
  // AI configuration
  defaultProvider: AIProvider
  defaultModel: string
  apiKeyEnvVar: string
}

export const DEFAULT_CONFIG: LachesisConfig = {
  vaultPath: '', // Will be set based on OS detection
  defaultInterviewDepth: 'medium',
  defaultProvider: 'openai',
  defaultModel: 'openai/gpt-5',
  apiKeyEnvVar: 'OPENAI_API_KEY',
}

export const OPENAI_MODELS = [
  'openai/gpt-5.1-codex-mini',
  'openai/gpt-5.1-codex',
  'openai/gpt-5.1-chat-latest',
  'openai/gpt-5.1',
  'openai/gpt-5-pro',
  'openai/gpt-5',
  'openai/gpt-5-mini',
  'openai/gpt-5-nano',
  'openai/gpt-5-codex',
  'openai/gpt-5-chat-latest',
  'openai/gpt-4.1',
  'openai/gpt-4.1-mini',
  'openai/gpt-4.1-nano',
  'openai/gpt-4o',
  'openai/gpt-4o-mini',
] as const

export type OpenAIModelId = (typeof OPENAI_MODELS)[number]
