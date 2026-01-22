// Custom agent loop implementation
// Replaces @anthropic-ai/claude-agent-sdk which is incompatible with Electron

import Anthropic from '@anthropic-ai/sdk'
import { executeTool, TOOL_DEFINITIONS } from './tools'
import type { ToolExecutorContext } from './tools'
import type { TextResult, ConversationMessage, AgentChatCallbacks, EnhancedToolActivity, ToolName, AgentChatResult } from '../types'
import { generateToolDescription, generateActivityId } from './tools/descriptions'

// ============================================================================
// Constants
// ============================================================================

// Maximum iterations to prevent runaway loops
const MAX_ITERATIONS = 20

// Maximum tokens for model responses
const MAX_TOKENS = 8000

// ============================================================================
// Types
// ============================================================================

type AnthropicMessage = Anthropic.MessageParam

type ContentBlock = Anthropic.TextBlock | Anthropic.ToolUseBlock

type ToolResultContent = {
  type: 'tool_result'
  tool_use_id: string
  content: string
  is_error?: boolean
}

// ============================================================================
// Agent Loop Implementation
// ============================================================================

export type AgentLoopParams = {
  client: Anthropic
  model: string
  systemPrompt: string
  messages: ConversationMessage[]
  projectPath: string
  callbacks: AgentChatCallbacks
}

/**
 * Run the agent loop with tool execution.
 *
 * This is a synchronous (non-streaming) loop that:
 * 1. Sends messages to Claude with tool definitions
 * 2. When Claude wants to use a tool, executes it and continues
 * 3. Collects all text responses and returns when done
 * 4. Tracks all tool activities for visibility and error recovery
 */
export async function runAgentLoop(params: AgentLoopParams): Promise<AgentChatResult> {
  const { client, model, systemPrompt, messages, projectPath, callbacks } = params

  // Build context for tool execution
  const context: ToolExecutorContext = {
    projectPath,
  }

  // Convert conversation messages to Anthropic format
  const anthropicMessages: AnthropicMessage[] = buildAnthropicMessages(messages)

  let iterations = 0
  let fullText = ''

  // Track all tool activities for this session
  const executedTools: EnhancedToolActivity[] = []

  while (iterations < MAX_ITERATIONS) {
    iterations++

    try {
      // Make the API call (non-streaming for tool loop)
      const response = await client.messages.create({
        model,
        system: systemPrompt,
        messages: anthropicMessages,
        tools: TOOL_DEFINITIONS,
        max_tokens: MAX_TOKENS,
      })

      // Extract text from response
      for (const block of response.content as ContentBlock[]) {
        if (block.type === 'text') {
          fullText += block.text
          callbacks.onTextUpdate?.(fullText)
        }
      }

      // Check if we're done (no tool use)
      if (response.stop_reason === 'end_turn') {
        return {
          success: true,
          content: fullText.trim(),
          toolActivities: executedTools,
          hasPartialChanges: hasFileModifications(executedTools),
        }
      }

      // Handle tool use
      if (response.stop_reason === 'tool_use') {
        const toolResults: ToolResultContent[] = []

        for (const block of response.content as ContentBlock[]) {
          if (block.type === 'tool_use') {
            const toolName = block.name as ToolName
            const toolInput = block.input as Record<string, unknown>
            const activityId = generateActivityId()
            const startedAt = Date.now()

            // Create enhanced activity for tracking (starting phase)
            const activity: EnhancedToolActivity = {
              id: activityId,
              toolName,
              status: 'running',
              phase: 'starting',
              description: generateToolDescription(toolName, toolInput),
              startedAt,
              input: toolInput,
            }

            executedTools.push(activity)

            // Notify callbacks that tool is starting
            callbacks.onToolActivity?.({
              toolName,
              status: 'running',
              input: toolInput,
            })
            callbacks.onEnhancedToolActivity?.(activity)

            // Update to executing phase before tool runs
            activity.phase = 'executing'
            callbacks.onEnhancedToolActivity?.(activity)

            // Execute the tool
            const result = await executeTool(toolName, toolInput, context)
            const completedAt = Date.now()

            // Update activity with result (clear phase since no longer running)
            activity.status = result.success ? 'completed' : 'failed'
            activity.phase = undefined
            activity.completedAt = completedAt
            activity.durationMs = completedAt - startedAt
            activity.output = result.success ? result.output : undefined
            activity.error = result.success ? undefined : result.error

            // Notify callbacks of result
            callbacks.onToolActivity?.({
              toolName,
              status: result.success ? 'completed' : 'failed',
              output: result.success ? result.output : result.error,
            })
            callbacks.onEnhancedToolActivity?.(activity)

            // Build tool result
            toolResults.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: result.success ? result.output : `Error: ${result.error}`,
              is_error: !result.success,
            })
          }
        }

        // Add assistant message with tool use to history
        anthropicMessages.push({
          role: 'assistant',
          content: response.content,
        })

        // Add tool results as user message
        anthropicMessages.push({
          role: 'user',
          content: toolResults,
        })

        // Continue the loop
        continue
      }

      // Unknown stop reason - treat as done
      return {
        success: true,
        content: fullText.trim(),
        toolActivities: executedTools,
        hasPartialChanges: hasFileModifications(executedTools),
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      const hasPartialChanges = hasFileModifications(executedTools)

      // Return detailed error with tool activities for visibility
      return {
        success: false,
        error: `Agent loop error: ${message}`,
        content: fullText.trim() || undefined,
        toolActivities: executedTools,
        hasPartialChanges,
      }
    }
  }

  // Exceeded max iterations
  return {
    success: true,
    content: fullText.trim() + '\n\n(Agent stopped: maximum iterations reached)',
    toolActivities: executedTools,
    hasPartialChanges: hasFileModifications(executedTools),
  }
}

/**
 * Check if any completed tool activities modified files.
 */
function hasFileModifications(activities: EnhancedToolActivity[]): boolean {
  return activities.some(
    (a) =>
      a.status === 'completed' &&
      (a.toolName === 'Edit' || a.toolName === 'Write'),
  )
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Convert conversation messages to Anthropic format.
 */
function buildAnthropicMessages(messages: ConversationMessage[]): AnthropicMessage[] {
  if (messages.length === 0) {
    return [
      {
        role: 'user',
        content: 'Please respond according to your instructions and context.',
      },
    ]
  }

  return messages.map((msg) => ({
    role: msg.role as 'user' | 'assistant',
    content: msg.content,
  }))
}
