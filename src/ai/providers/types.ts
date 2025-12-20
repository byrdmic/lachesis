// Provider interface and shared types for multi-provider AI architecture

import type { z } from 'zod'
import type { LachesisConfig } from '../../config/types.ts'

// ============================================================================
// Provider Types
// ============================================================================

export type ProviderType = 'anthropic-sdk' | 'claude-code' | 'openai'

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
  timestamp: string
}

export type ToolCallRecord = {
  name: string
  args: Record<string, unknown>
  result: unknown
}

export type AgenticResult = {
  success: boolean
  response?: string
  toolCalls?: ToolCallRecord[]
  error?: string
  debugDetails?: string
}

export type AgenticOptions = {
  systemPrompt: string
  messages: ConversationMessage[]
  projectPath?: string
  maxTurns?: number
  onToolCall?: (toolName: string, args: Record<string, unknown>) => void
  onToolResult?: (toolName: string, result: unknown) => void
  onTextUpdate?: (partial: string) => void
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
   * Test the provider connection (API key, CLI login, etc.)
   */
  testConnection(config: LachesisConfig): Promise<ConnectionResult>

  /**
   * Stream text generation with incremental updates
   */
  streamText(
    systemPrompt: string,
    messages: ConversationMessage[],
    config: LachesisConfig,
    onUpdate?: (partial: string) => void,
  ): Promise<TextResult>

  /**
   * Generate text (non-streaming)
   */
  generateText(
    systemPrompt: string,
    userPrompt: string,
    config: LachesisConfig,
  ): Promise<TextResult>

  /**
   * Generate structured output matching a Zod schema
   */
  generateStructuredOutput<T>(
    prompt: string,
    schema: z.ZodSchema<T>,
    config: LachesisConfig,
  ): Promise<StructuredResult<T>>

  /**
   * Run an agentic conversation with file tool access (Read, Write, Edit, Glob, Grep)
   */
  runAgenticConversation(
    config: LachesisConfig,
    options: AgenticOptions,
  ): Promise<AgenticResult>

  /**
   * Check if this provider is available (for auto-fallback logic)
   * e.g., claude-code checks if CLI is installed and user is logged in
   */
  isAvailable(): Promise<boolean>
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
  if (message.includes('401') || message.includes('API key') || message.includes('Unauthorized')) {
    return { code: 'auth_failed', message, provider }
  }
  if (message.includes('429') || message.includes('rate limit')) {
    return { code: 'rate_limited', message, provider }
  }
  if (message.includes('ENOTFOUND') || message.includes('network') || message.includes('fetch')) {
    return { code: 'network_error', message, provider }
  }
  if (message.includes('not found') || message.includes('unavailable') || message.includes('ENOENT')) {
    return { code: 'unavailable', message, provider }
  }

  return { code: 'unknown', message, provider }
}
