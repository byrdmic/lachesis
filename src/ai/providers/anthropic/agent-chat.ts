// Agent SDK wrapper for chat with tool access
// Uses @anthropic-ai/claude-agent-sdk for Claude Agent capabilities

import { query } from '@anthropic-ai/claude-agent-sdk'
import type {
  SDKPartialAssistantMessage,
  SDKAssistantMessage,
  SDKToolProgressMessage,
  SDKResultMessage,
} from '@anthropic-ai/claude-agent-sdk'
import type {
  TextResult,
  ConversationMessage,
  AgentChatOptions,
  AgentChatCallbacks,
} from '../types'
import * as path from 'path'

// Path to the Claude Agent SDK cli.js - injected at build time
// This is needed because the SDK uses import.meta.url internally which doesn't work in CJS bundles
const CLAUDE_CLI_PATH = process.env.CLAUDE_CLI_PATH

// ============================================================================
// Types for Stream Events
// ============================================================================

// Event types from the Anthropic SDK stream (simplified for our needs)
type ContentBlockStartEvent = {
  type: 'content_block_start'
  index: number
  content_block: {
    type: 'text' | 'tool_use'
    id?: string
    name?: string
    text?: string
  }
}

type ContentBlockDeltaEvent = {
  type: 'content_block_delta'
  index: number
  delta: {
    type: 'text_delta' | 'input_json_delta'
    text?: string
    partial_json?: string
  }
}

type ContentBlockStopEvent = {
  type: 'content_block_stop'
  index: number
}

type StreamEvent = ContentBlockStartEvent | ContentBlockDeltaEvent | ContentBlockStopEvent | { type: string }

// ============================================================================
// Constants
// ============================================================================

const ALLOWED_TOOLS = ['Glob', 'Grep', 'Read', 'Edit', 'Write']
const DISALLOWED_TOOLS = ['Bash', 'Task', 'TodoWrite', 'WebFetch', 'WebSearch']

// ============================================================================
// Agent Chat Implementation
// ============================================================================

/**
 * Stream a chat conversation using the Claude Agent SDK.
 * This enables tool access for context retrieval while blocking dangerous operations.
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
    // Build the prompt from conversation history
    // Agent SDK expects a single prompt string, not message array
    const prompt = buildPromptFromMessages(messages)

    // Track active tool uses for status updates
    const activeToolUses = new Map<string, string>() // toolUseId -> toolName

    // Create the query with appropriate options
    const queryResult = query({
      prompt,
      options: {
        cwd: options.cwd,
        model,
        systemPrompt,
        pathToClaudeCodeExecutable: CLAUDE_CLI_PATH, // Required: bypass import.meta.url issue in bundled code
        allowedTools: options.allowedTools ?? ALLOWED_TOOLS,
        disallowedTools: DISALLOWED_TOOLS,
        includePartialMessages: true, // Enable streaming
        permissionMode: 'bypassPermissions',
        allowDangerouslySkipPermissions: true,
        persistSession: false, // Don't persist to ~/.claude/projects
        env: {
          ...process.env,
          ANTHROPIC_API_KEY: apiKey,
        },
      },
    })

    let fullText = ''
    let resultMessage: SDKResultMessage | null = null

    // Iterate over the async generator
    for await (const message of queryResult) {
      // Handle different message types
      switch (message.type) {
        case 'stream_event':
          // Streaming text delta
          handleStreamEvent(message as SDKPartialAssistantMessage, (delta) => {
            fullText += delta
            callbacks.onTextUpdate?.(fullText)
          }, activeToolUses, callbacks)
          break

        case 'assistant':
          // Full assistant message (final)
          fullText = extractTextFromAssistantMessage(message as SDKAssistantMessage)
          callbacks.onTextUpdate?.(fullText)
          break

        case 'tool_progress':
          // Tool is being executed
          handleToolProgress(message as SDKToolProgressMessage, activeToolUses, callbacks)
          break

        case 'result':
          // Query completed
          resultMessage = message as SDKResultMessage
          break
      }
    }

    // Check result
    if (resultMessage) {
      if (resultMessage.subtype === 'success') {
        // Use the result text if we didn't get text from streaming
        if (!fullText && resultMessage.result) {
          fullText = resultMessage.result
        }
        return { success: true, content: fullText.trim() }
      } else {
        // Error result
        const errorMsg = resultMessage.errors?.join('; ') || 'Query failed'
        return { success: false, error: errorMsg }
      }
    }

    return { success: true, content: fullText.trim() }
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

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Build a single prompt string from conversation messages.
 * Agent SDK expects a string prompt, not a message array.
 */
function buildPromptFromMessages(messages: ConversationMessage[]): string {
  if (messages.length === 0) {
    return 'Please respond according to your instructions and context.'
  }

  // For multi-turn conversations, format as a transcript
  // The Agent SDK will handle this appropriately
  const parts: string[] = []

  for (const msg of messages) {
    const prefix = msg.role === 'user' ? 'User' : 'Assistant'
    parts.push(`${prefix}: ${msg.content}`)
  }

  return parts.join('\n\n')
}

/**
 * Handle streaming events to extract text deltas.
 */
function handleStreamEvent(
  message: SDKPartialAssistantMessage,
  onTextDelta: (delta: string) => void,
  activeToolUses: Map<string, string>,
  callbacks: AgentChatCallbacks,
): void {
  const event = message.event as StreamEvent

  // Handle content block start (for tool use tracking)
  if (event.type === 'content_block_start') {
    const blockStart = event as ContentBlockStartEvent
    if (blockStart.content_block.type === 'tool_use' && blockStart.content_block.id && blockStart.content_block.name) {
      activeToolUses.set(blockStart.content_block.id, blockStart.content_block.name)
      callbacks.onToolActivity?.({
        toolName: blockStart.content_block.name,
        status: 'running',
      })
    }
  }

  // Handle content block delta
  if (event.type === 'content_block_delta') {
    const delta = event as ContentBlockDeltaEvent
    if (delta.delta.type === 'text_delta' && delta.delta.text) {
      onTextDelta(delta.delta.text)
    }
  }
}

/**
 * Handle tool progress messages.
 */
function handleToolProgress(
  message: SDKToolProgressMessage,
  activeToolUses: Map<string, string>,
  callbacks: AgentChatCallbacks,
): void {
  const toolName = message.tool_name || activeToolUses.get(message.tool_use_id) || 'Unknown'

  callbacks.onToolActivity?.({
    toolName,
    status: 'running',
  })
}

/**
 * Extract text content from a full assistant message.
 */
function extractTextFromAssistantMessage(message: SDKAssistantMessage): string {
  const content = message.message.content
  if (!Array.isArray(content)) {
    return typeof content === 'string' ? content : ''
  }

  const textParts: string[] = []
  for (const block of content) {
    if (block.type === 'text') {
      textParts.push((block as { type: 'text'; text: string }).text)
    }
  }

  return textParts.join('')
}
