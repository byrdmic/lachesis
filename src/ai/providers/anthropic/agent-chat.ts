// Agent chat implementation using custom agent loop
// Replaces @anthropic-ai/claude-agent-sdk which is incompatible with Electron's renderer environment

import Anthropic from '@anthropic-ai/sdk'
import { runAgentLoop } from './agent-loop'
import type {
  TextResult,
  ConversationMessage,
  AgentChatOptions,
  AgentChatCallbacks,
} from '../types'

// ============================================================================
// Agent Chat Implementation
// ============================================================================

/**
 * Stream a chat conversation using a custom agent loop with tool access.
 * This enables AI to use tools like Read, Glob, Grep, Edit, Write for context retrieval.
 */
export async function streamAgentChat(
  apiKey: string,
  model: string,
  systemPrompt: string,
  messages: ConversationMessage[],
  options: AgentChatOptions,
  callbacks: AgentChatCallbacks,
): Promise<TextResult> {
  try {
    // Create Anthropic client
    const client = new Anthropic({
      apiKey,
      dangerouslyAllowBrowser: true,
    })

    // Run the agent loop
    return await runAgentLoop({
      client,
      model,
      systemPrompt,
      messages,
      projectPath: options.cwd,
      callbacks,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const stack = err instanceof Error ? err.stack : undefined
    return {
      success: false,
      error: `Agent chat failed: ${message}`,
      debugDetails: stack ? `${message}\n${stack}` : message,
    }
  }
}
