// Provider factory for multi-provider AI architecture

import type { AIProvider, ProviderType } from './types'
import { AnthropicProvider } from './anthropic'
import { OpenAIProvider } from './openai'
import type { LachesisSettings } from '../../settings'

// ============================================================================
// Provider Factory
// ============================================================================

/**
 * Create a provider instance based on settings
 */
export function getProvider(settings: LachesisSettings): AIProvider {
  return getProviderByType(settings.provider, settings)
}

/**
 * Create a specific provider by type
 */
export function getProviderByType(type: ProviderType, settings: LachesisSettings): AIProvider {
  switch (type) {
    case 'anthropic':
      return new AnthropicProvider(settings.anthropicApiKey, settings.anthropicModel)
    case 'openai':
      return new OpenAIProvider(settings.openaiApiKey, settings.openaiModel)
    default:
      throw new Error(`Unknown provider type: ${type}`)
  }
}

/**
 * Check if a provider is available (has required config)
 */
export function isProviderAvailable(type: ProviderType, settings: LachesisSettings): boolean {
  switch (type) {
    case 'anthropic':
      return !!settings.anthropicApiKey
    case 'openai':
      return !!settings.openaiApiKey
    default:
      return false
  }
}

/**
 * Get list of all available providers for settings UI
 */
export function getAvailableProviders(): Array<{ type: ProviderType; displayName: string }> {
  return [
    { type: 'anthropic', displayName: 'Anthropic (Claude)' },
    { type: 'openai', displayName: 'OpenAI' },
  ]
}

/**
 * Get default model for a provider
 */
export function getDefaultModel(type: ProviderType): string {
  switch (type) {
    case 'anthropic':
      return 'claude-sonnet-4-20250514'
    case 'openai':
      return 'gpt-5.2'
    default:
      return ''
  }
}

/**
 * Get available models for a provider
 */
export function getModelsForProvider(type: ProviderType): Array<{ value: string; label: string }> {
  switch (type) {
    case 'anthropic':
      return [
        { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4 (Recommended)' },
        { value: 'claude-opus-4-20250514', label: 'Claude Opus 4 (Most capable)' },
        { value: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku (Fast)' },
      ]
    case 'openai':
      return [
        { value: 'gpt-5.2', label: 'GPT-5.2 (Recommended)' },
        { value: 'gpt-5.2-thinking', label: 'GPT-5.2 Thinking (Deep reasoning)' },
        { value: 'gpt-5.1-codex-max', label: 'GPT-5.1 Codex Max (Coding)' },
        { value: 'gpt-5.1', label: 'GPT-5.1 (Balanced)' },
      ]
    default:
      return []
  }
}
