// Configuration types for Lachesis

// ============================================================================
// Provider Types
// ============================================================================

export type AIProvider = 'anthropic-sdk' | 'claude-code' | 'openai'

// ============================================================================
// Model Lists
// ============================================================================

export const ANTHROPIC_MODELS = [
  'claude-opus-4-5-20251101',
  'claude-sonnet-4-5-20250929',
  'claude-sonnet-4-20250514',
  'claude-haiku-3-5-20241022',
] as const

export const CLAUDE_CODE_MODELS = [
  'sonnet',
  'opus',
  'haiku',
] as const

export const OPENAI_MODELS = [
  'gpt-4o',
  'gpt-4o-mini',
  'gpt-4-turbo',
  'o1',
  'o1-mini',
] as const

export type AnthropicModelId = (typeof ANTHROPIC_MODELS)[number]
export type ClaudeCodeModelId = (typeof CLAUDE_CODE_MODELS)[number]
export type OpenAIModelId = (typeof OPENAI_MODELS)[number]

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get available models for a given provider
 */
export function getModelsForProvider(provider: AIProvider): readonly string[] {
  switch (provider) {
    case 'anthropic-sdk':
      return ANTHROPIC_MODELS
    case 'claude-code':
      return CLAUDE_CODE_MODELS
    case 'openai':
      return OPENAI_MODELS
    default:
      return ANTHROPIC_MODELS
  }
}

/**
 * Get the default API key environment variable for a provider
 */
export function getDefaultApiKeyEnvVar(provider: AIProvider): string {
  switch (provider) {
    case 'anthropic-sdk':
      return 'ANTHROPIC_API_KEY'
    case 'claude-code':
      return '' // Claude Code uses MAX subscription, no API key needed
    case 'openai':
      return 'OPENAI_API_KEY'
    default:
      return 'ANTHROPIC_API_KEY'
  }
}

/**
 * Get the default model for a provider
 */
export function getDefaultModel(provider: AIProvider): string {
  switch (provider) {
    case 'anthropic-sdk':
      return 'claude-sonnet-4-5-20250929'
    case 'claude-code':
      return 'sonnet'
    case 'openai':
      return 'gpt-4o'
    default:
      return 'claude-sonnet-4-5-20250929'
  }
}

/**
 * Get human-readable provider name
 */
export function getProviderDisplayName(provider: AIProvider): string {
  switch (provider) {
    case 'anthropic-sdk':
      return 'Anthropic SDK'
    case 'claude-code':
      return 'Claude Code (MAX)'
    case 'openai':
      return 'OpenAI (Vercel AI SDK)'
    default:
      return provider
  }
}

// ============================================================================
// Config Types
// ============================================================================

export type LachesisConfig = {
  vaultPath: string // Base Obsidian projects path
  // AI configuration
  defaultProvider: AIProvider
  defaultModel: string
  apiKeyEnvVar: string
}

export const DEFAULT_CONFIG: LachesisConfig = {
  vaultPath: '', // Will be set based on OS detection
  defaultProvider: 'anthropic-sdk',
  defaultModel: 'claude-sonnet-4-5-20250929',
  apiKeyEnvVar: 'ANTHROPIC_API_KEY',
}
