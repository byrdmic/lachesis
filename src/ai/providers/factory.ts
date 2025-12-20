// Provider factory with auto-fallback logic

import type { AIProvider, ProviderType } from './types.ts'
import type { LachesisConfig } from '../../config/types.ts'
import { debugLog } from '../../debug/logger.ts'

// ============================================================================
// Provider Cache
// ============================================================================

// Lazy-loaded provider instances
const cachedProviders: Map<ProviderType, AIProvider> = new Map()

// Track which providers have been checked for availability
const availabilityChecked: Map<ProviderType, boolean> = new Map()

// ============================================================================
// Provider Creation
// ============================================================================

/**
 * Dynamically import and create a provider instance
 */
async function createProvider(type: ProviderType): Promise<AIProvider> {
  switch (type) {
    case 'anthropic-sdk': {
      const { AnthropicSDKProvider } = await import('./anthropic/index.ts')
      return new AnthropicSDKProvider()
    }
    case 'claude-code': {
      const { ClaudeCodeProvider } = await import('./claude-code/index.ts')
      return new ClaudeCodeProvider()
    }
    case 'openai': {
      const { OpenAIProvider } = await import('./openai/index.ts')
      return new OpenAIProvider()
    }
    default:
      throw new Error(`Unknown provider type: ${type}`)
  }
}

// ============================================================================
// Provider Factory
// ============================================================================

/**
 * Get the appropriate provider based on config with auto-fallback.
 *
 * Fallback behavior:
 * - If 'claude-code' is selected but unavailable, falls back to 'anthropic-sdk'
 * - Logs fallback decisions for debugging
 */
export async function getProvider(config: LachesisConfig): Promise<AIProvider> {
  const requestedType = config.defaultProvider as ProviderType

  // Check cache first
  if (cachedProviders.has(requestedType)) {
    const cached = cachedProviders.get(requestedType)!

    // For claude-code, re-check availability if not recently checked
    if (requestedType === 'claude-code' && !availabilityChecked.get('claude-code')) {
      const available = await cached.isAvailable()
      availabilityChecked.set('claude-code', true)

      if (!available) {
        debugLog.info('Claude Code not available, falling back to anthropic-sdk')
        return getProvider({ ...config, defaultProvider: 'anthropic-sdk' })
      }
    }

    return cached
  }

  // Create new provider
  const provider = await createProvider(requestedType)

  // Check availability for claude-code
  if (requestedType === 'claude-code') {
    const available = await provider.isAvailable()
    availabilityChecked.set('claude-code', true)

    if (!available) {
      debugLog.info('Claude Code CLI not available or not logged in, falling back to anthropic-sdk')
      // Don't cache unavailable provider
      return getProvider({ ...config, defaultProvider: 'anthropic-sdk' })
    }
  }

  // Cache and return
  cachedProviders.set(requestedType, provider)
  debugLog.info(`Provider initialized: ${provider.displayName}`, {
    type: requestedType,
  })

  return provider
}

/**
 * Get a provider by type without fallback (for testing/explicit selection)
 */
export async function getProviderByType(type: ProviderType): Promise<AIProvider> {
  if (cachedProviders.has(type)) {
    return cachedProviders.get(type)!
  }

  const provider = await createProvider(type)
  cachedProviders.set(type, provider)
  return provider
}

/**
 * Check if a specific provider is available
 */
export async function isProviderAvailable(type: ProviderType): Promise<boolean> {
  try {
    const provider = await getProviderByType(type)
    return provider.isAvailable()
  } catch {
    return false
  }
}

/**
 * Clear provider cache (useful for testing or when config changes)
 */
export function clearProviderCache(): void {
  cachedProviders.clear()
  availabilityChecked.clear()
  debugLog.info('Provider cache cleared')
}

/**
 * Get all available providers (for settings UI)
 */
export async function getAvailableProviders(): Promise<Array<{ type: ProviderType; displayName: string; available: boolean }>> {
  const providers: ProviderType[] = ['anthropic-sdk', 'claude-code', 'openai']
  const results = []

  for (const type of providers) {
    try {
      const provider = await getProviderByType(type)
      const available = await provider.isAvailable()
      results.push({
        type,
        displayName: provider.displayName,
        available,
      })
    } catch {
      // Provider couldn't be created (missing dependencies)
      results.push({
        type,
        displayName: type,
        available: false,
      })
    }
  }

  return results
}
