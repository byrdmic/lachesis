// OpenAI Provider using Vercel AI SDK
// Adapted for Obsidian plugin - API key passed via constructor

import { createOpenAI } from '@ai-sdk/openai'
import {
  streamText as aiStreamText,
  generateText as aiGenerateText,
  generateObject,
  stepCountIs,
  type CoreMessage,
} from 'ai'
import { z } from 'zod'
import type {
  AIProvider,
  ConnectionResult,
  TextResult,
  StructuredResult,
  ConversationMessage,
  AgentChatOptions,
  AgentChatCallbacks,
  EnhancedToolActivity,
  ToolName,
} from '../types'
import { createTools } from './tools'
import type { ToolExecutorContext } from '../anthropic/tools/types'
import {
  generateToolDescription,
  generateActivityId,
  toPersistedActivity,
} from '../anthropic/tools/descriptions'

// ============================================================================
// OpenAIProvider
// ============================================================================

export class OpenAIProvider implements AIProvider {
  readonly type = 'openai' as const
  readonly displayName = 'OpenAI'

  constructor(
    private apiKey: string,
    private model: string,
  ) {}

  private getClient() {
    return createOpenAI({
      apiKey: this.apiKey,
    })
  }

  // --------------------------------------------------------------------------
  // Availability Check
  // --------------------------------------------------------------------------

  isAvailable(): boolean {
    return !!this.apiKey
  }

  // --------------------------------------------------------------------------
  // Connection Test
  // --------------------------------------------------------------------------

  async testConnection(): Promise<ConnectionResult> {
    try {
      const openai = this.getClient()
      const model = openai(this.model)

      await aiGenerateText({
        model,
        prompt: 'Hi',
      })

      return { connected: true }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { connected: false, error: message }
    }
  }

  // --------------------------------------------------------------------------
  // Streaming Text Generation
  // --------------------------------------------------------------------------

  async streamText(
    systemPrompt: string,
    messages: ConversationMessage[],
    onUpdate?: (partial: string) => void,
  ): Promise<TextResult> {
    try {
      const openai = this.getClient()
      const model = openai(this.model)

      // Handle empty messages case
      const effectiveMessages: CoreMessage[] =
        messages.length > 0
          ? (messages.map((m) => ({
              role: m.role,
              content: m.content,
            })) as CoreMessage[])
          : [
              {
                role: 'user' as const,
                content: 'Please respond according to your instructions and context.',
              },
            ]

      const result = aiStreamText({
        model,
        system: systemPrompt,
        messages: effectiveMessages,
      })

      let fullText = ''
      for await (const delta of result.textStream) {
        fullText += delta
        onUpdate?.(fullText)
      }

      return { success: true, content: fullText.trim() }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      const stack = err instanceof Error ? err.stack : undefined
      return {
        success: false,
        error: `Failed to generate: ${message}`,
        debugDetails: stack ? `${message}\n${stack}` : message,
      }
    }
  }

  // --------------------------------------------------------------------------
  // Non-Streaming Text Generation
  // --------------------------------------------------------------------------

  async generateText(
    systemPrompt: string,
    userPrompt: string,
  ): Promise<TextResult> {
    try {
      const openai = this.getClient()
      const model = openai(this.model)

      const { text } = await aiGenerateText({
        model,
        system: systemPrompt,
        prompt: userPrompt,
      })

      return { success: true, content: text.trim() }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      const stack = err instanceof Error ? err.stack : undefined
      return {
        success: false,
        error: `Failed to generate: ${message}`,
        debugDetails: stack ? `${message}\n${stack}` : message,
      }
    }
  }

  // --------------------------------------------------------------------------
  // Structured Output
  // --------------------------------------------------------------------------

  async generateStructuredOutput<T>(
    prompt: string,
    schema: z.ZodSchema<T>,
  ): Promise<StructuredResult<T>> {
    try {
      const openai = this.getClient()
      const model = openai(this.model)

      const { object } = await generateObject({
        model,
        schema,
        prompt,
      })

      return { success: true, data: object }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      const stack = err instanceof Error ? err.stack : undefined
      return {
        success: false,
        error: `Failed to generate: ${message}`,
        debugDetails: stack ? `${message}\n${stack}` : message,
      }
    }
  }

  // --------------------------------------------------------------------------
  // Agent Chat (with tool support)
  // --------------------------------------------------------------------------

  async streamAgentChat(
    systemPrompt: string,
    messages: ConversationMessage[],
    options: AgentChatOptions,
    callbacks: AgentChatCallbacks,
  ): Promise<TextResult> {
    try {
      const openai = this.getClient()
      const model = openai(this.model)

      // Create tool executor context
      const context: ToolExecutorContext = { projectPath: options.cwd }
      const tools = createTools(context)

      // Track tool activities for persistence
      const executedTools: EnhancedToolActivity[] = []

      // Handle empty messages case
      const effectiveMessages: CoreMessage[] =
        messages.length > 0
          ? (messages.map((m) => ({
              role: m.role,
              content: m.content,
            })) as CoreMessage[])
          : [
              {
                role: 'user' as const,
                content: 'Please respond according to your instructions and context.',
              },
            ]

      const result = aiStreamText({
        model,
        system: systemPrompt,
        messages: effectiveMessages,
        tools,
        stopWhen: stepCountIs(20),
        onStepFinish: ({ toolCalls, toolResults }) => {
          // Track tool activities when a step finishes
          if (toolCalls && toolResults) {
            for (let i = 0; i < toolCalls.length; i++) {
              const call = toolCalls[i]
              const toolResult = toolResults[i]
              const toolName = call.toolName as ToolName
              const input = (call as { input?: Record<string, unknown> }).input ?? {}

              const activity: EnhancedToolActivity = {
                id: generateActivityId(),
                toolName,
                status: toolResult && typeof toolResult === 'object' && 'error' in toolResult ? 'failed' : 'completed',
                description: generateToolDescription(toolName, input),
                startedAt: Date.now(),
                completedAt: Date.now(),
                durationMs: 0, // We don't have precise timing in this callback
                input,
                output: typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult),
                error: toolResult && typeof toolResult === 'object' && 'error' in toolResult ? String((toolResult as { error: unknown }).error) : undefined,
              }

              executedTools.push(activity)

              // Notify callbacks
              callbacks.onToolActivity?.({
                toolName: activity.toolName,
                status: activity.status,
                input: activity.input,
                output: activity.output,
              })
              callbacks.onEnhancedToolActivity?.(activity)
            }
          }
        },
      })

      let fullText = ''
      for await (const delta of result.textStream) {
        fullText += delta
        callbacks.onTextUpdate?.(fullText)
      }

      // Check if any file modifications occurred before potential errors
      const hasPartialChanges = executedTools.some(
        (a) =>
          (a.toolName === 'Write' || a.toolName === 'Edit') && a.status === 'completed',
      )

      // Convert to persisted activities
      const persistedActivities = executedTools
        .filter((a) => a.status !== 'running')
        .map(toPersistedActivity)

      return {
        success: true,
        content: fullText.trim(),
        toolActivities: persistedActivities.length > 0 ? persistedActivities : undefined,
        hasPartialChanges,
      }
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
}
