// Provider interface and shared types for multi-provider AI architecture

import type { z } from 'zod'

// ============================================================================
// Provider Types
// ============================================================================

export type ProviderType = 'anthropic' | 'openai'

// ============================================================================
// Shared Result Types
// ============================================================================

export type ConnectionResult = {
  connected: boolean
  error?: string
}

export type TextResult = {
  success: boolean
  content?: string
  error?: string
  debugDetails?: string
}

export type StructuredResult<T> = {
  success: boolean
  data?: T
  error?: string
  debugDetails?: string
}

// ============================================================================
// Conversation Types
// ============================================================================

export type ConversationMessage = {
  role: 'assistant' | 'user'
  content: string
  timestamp?: string
}

// ============================================================================
// Provider Interface
// ============================================================================

/**
 * Common interface all AI providers must implement
 */
export interface AIProvider {
  /**
   * Provider identifier
   */
  readonly type: ProviderType

  /**
   * Human-readable provider name for UI
   */
  readonly displayName: string

  /**
   * Test the provider connection (API key, etc.)
   */
  testConnection(): Promise<ConnectionResult>

  /**
   * Stream text generation with incremental updates
   */
  streamText(
    systemPrompt: string,
    messages: ConversationMessage[],
    onUpdate?: (partial: string) => void,
  ): Promise<TextResult>

  /**
   * Generate text (non-streaming)
   */
  generateText(
    systemPrompt: string,
    userPrompt: string,
  ): Promise<TextResult>

  /**
   * Generate structured output matching a Zod schema
   */
  generateStructuredOutput<T>(
    prompt: string,
    schema: z.ZodSchema<T>,
  ): Promise<StructuredResult<T>>

  /**
   * Check if this provider is available (has API key, etc.)
   */
  isAvailable(): boolean

  /**
   * Stream chat using Claude Agent SDK with tool access (optional - only Anthropic implements this).
   * Enables AI to use tools like Read, Glob, Grep, Edit, Write for context retrieval.
   */
  streamAgentChat?(
    systemPrompt: string,
    messages: ConversationMessage[],
    options: AgentChatOptions,
    callbacks: AgentChatCallbacks,
  ): Promise<TextResult>
}

// ============================================================================
// Agent Chat Types (for Claude Agent SDK integration)
// ============================================================================

export type ToolActivity = {
  toolName: string
  status: 'running' | 'completed' | 'failed'
  input?: Record<string, unknown>
  output?: string
}

export type AgentChatCallbacks = {
  onTextUpdate?: (partial: string) => void
  onToolActivity?: (activity: ToolActivity) => void
}

export type AgentChatOptions = {
  cwd: string
  allowedTools?: string[]
}

// ============================================================================
// Error Types
// ============================================================================

export type ProviderErrorCode =
  | 'auth_failed'
  | 'rate_limited'
  | 'network_error'
  | 'invalid_response'
  | 'unavailable'
  | 'unknown'

export type ProviderError = {
  code: ProviderErrorCode
  message: string
  provider: ProviderType
  details?: string
}

/**
 * Map a raw error to a standardized provider error
 */
export function mapToProviderError(
  err: unknown,
  provider: ProviderType,
): ProviderError {
  const message = err instanceof Error ? err.message : String(err)

  // Detect common error patterns
  if (message.includes('401') || message.includes('API key') || message.includes('Unauthorized') || message.includes('authentication')) {
    return { code: 'auth_failed', message, provider }
  }
  if (message.includes('429') || message.includes('rate limit')) {
    return { code: 'rate_limited', message, provider }
  }
  if (message.includes('ENOTFOUND') || message.includes('network') || message.includes('fetch') || message.includes('Failed to fetch')) {
    return { code: 'network_error', message, provider }
  }
  if (message.includes('not found') || message.includes('unavailable')) {
    return { code: 'unavailable', message, provider }
  }

  return { code: 'unknown', message, provider }
}
