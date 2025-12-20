// Anthropic SDK Provider
// Uses @anthropic-ai/sdk for standard operations and @anthropic-ai/claude-agent-sdk for agentic

import Anthropic from '@anthropic-ai/sdk'
import { query, type Query, type SDKResultMessage } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'
import type {
  AIProvider,
  ConnectionResult,
  TextResult,
  StructuredResult,
  AgenticResult,
  AgenticOptions,
  ConversationMessage,
  ToolCallRecord,
} from '../types.ts'
import type { LachesisConfig } from '../../../config/types.ts'
import { debugLog } from '../../../debug/logger.ts'
import { zodToJsonSchema } from './zod-to-json-schema.ts'

// ============================================================================
// AnthropicSDKProvider
// ============================================================================

export class AnthropicSDKProvider implements AIProvider {
  readonly type = 'anthropic-sdk' as const
  readonly displayName = 'Anthropic SDK'

  private client: Anthropic | null = null

  private getClient(): Anthropic {
    if (!this.client) {
      this.client = new Anthropic()
    }
    return this.client
  }

  // --------------------------------------------------------------------------
  // Availability Check
  // --------------------------------------------------------------------------

  async isAvailable(): Promise<boolean> {
    // SDK is available if ANTHROPIC_API_KEY is set
    return !!process.env.ANTHROPIC_API_KEY
  }

  // --------------------------------------------------------------------------
  // Connection Test
  // --------------------------------------------------------------------------

  async testConnection(config: LachesisConfig): Promise<ConnectionResult> {
    try {
      const client = this.getClient()

      // Make a minimal API call to verify credentials
      await client.messages.create({
        model: config.defaultModel,
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Hi' }],
      })

      return { connected: true }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      debugLog.error('Anthropic connection test failed', { message })
      return { connected: false, error: message }
    }
  }

  // --------------------------------------------------------------------------
  // Streaming Text Generation
  // --------------------------------------------------------------------------

  async streamText(
    systemPrompt: string,
    messages: ConversationMessage[],
    config: LachesisConfig,
    onUpdate?: (partial: string) => void,
  ): Promise<TextResult> {
    try {
      const client = this.getClient()

      // Convert messages to Anthropic format
      const anthropicMessages = messages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }))

      debugLog.info('Anthropic: Streaming text', {
        model: config.defaultModel,
        messageCount: anthropicMessages.length,
      })

      const stream = client.messages.stream({
        model: config.defaultModel,
        system: systemPrompt,
        messages: anthropicMessages,
        max_tokens: 5000,
      })

      let fullText = ''

      stream.on('text', (delta) => {
        fullText += delta
        onUpdate?.(fullText)
      })

      await stream.finalMessage()

      debugLog.info('Anthropic: Streaming complete', {
        totalLength: fullText.length,
      })

      return { success: true, content: fullText.trim() }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      const stack = err instanceof Error ? err.stack : undefined
      debugLog.error('Anthropic: Stream failed', { message, stack })
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
    config: LachesisConfig,
  ): Promise<TextResult> {
    try {
      const client = this.getClient()

      debugLog.info('Anthropic: Generating text', {
        model: config.defaultModel,
      })

      const response = await client.messages.create({
        model: config.defaultModel,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
        max_tokens: 5000,
      })

      // Extract text content
      const textContent = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map((block) => block.text)
        .join('')

      debugLog.info('Anthropic: Generation complete', {
        totalLength: textContent.length,
      })

      return { success: true, content: textContent.trim() }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      const stack = err instanceof Error ? err.stack : undefined
      debugLog.error('Anthropic: Generation failed', { message, stack })
      return {
        success: false,
        error: `Failed to generate: ${message}`,
        debugDetails: stack ? `${message}\n${stack}` : message,
      }
    }
  }

  // --------------------------------------------------------------------------
  // Structured Output (via tool_use)
  // --------------------------------------------------------------------------

  async generateStructuredOutput<T>(
    prompt: string,
    schema: z.ZodSchema<T>,
    config: LachesisConfig,
  ): Promise<StructuredResult<T>> {
    try {
      const client = this.getClient()

      // Convert Zod schema to JSON Schema for tool definition
      const jsonSchema = zodToJsonSchema(schema)

      debugLog.info('Anthropic: Generating structured output', {
        model: config.defaultModel,
      })

      const response = await client.messages.create({
        model: config.defaultModel,
        max_tokens: 4096,
        tools: [
          {
            name: 'output',
            description: 'Structured output matching the required schema',
            input_schema: jsonSchema as Anthropic.Tool['input_schema'],
          },
        ],
        tool_choice: { type: 'tool', name: 'output' },
        messages: [{ role: 'user', content: prompt }],
      })

      // Find the tool use block
      const toolUse = response.content.find(
        (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
      )

      if (!toolUse) {
        return {
          success: false,
          error: 'No structured output returned',
        }
      }

      // Parse and validate with Zod
      const parsed = schema.safeParse(toolUse.input)

      if (!parsed.success) {
        debugLog.error('Anthropic: Structured output validation failed', {
          errors: parsed.error.errors,
        })
        return {
          success: false,
          error: `Validation failed: ${parsed.error.message}`,
        }
      }

      debugLog.info('Anthropic: Structured output complete')

      return { success: true, data: parsed.data }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      const stack = err instanceof Error ? err.stack : undefined
      debugLog.error('Anthropic: Structured output failed', { message, stack })
      return {
        success: false,
        error: `Failed to generate: ${message}`,
        debugDetails: stack ? `${message}\n${stack}` : message,
      }
    }
  }

  // --------------------------------------------------------------------------
  // Agentic Conversation (via Agent SDK)
  // --------------------------------------------------------------------------

  async runAgenticConversation(
    config: LachesisConfig,
    options: AgenticOptions,
  ): Promise<AgenticResult> {
    try {
      // Build the prompt from conversation messages
      const conversationText = options.messages
        .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
        .join('\n\n')

      debugLog.info('Anthropic Agent: Starting conversation', {
        model: config.defaultModel,
        messageCount: options.messages.length,
        projectPath: options.projectPath,
        maxTurns: options.maxTurns ?? 10,
      })

      // Track tool calls
      const toolCalls: ToolCallRecord[] = []
      let fullText = ''

      // Create the query
      const stream: Query = query({
        prompt: conversationText,
        options: {
          model: config.defaultModel,
          systemPrompt: options.systemPrompt,
          cwd: options.projectPath ?? process.cwd(),
          additionalDirectories: options.projectPath ? [options.projectPath] : undefined,
          maxTurns: options.maxTurns ?? 10,

          // Enable built-in file tools
          tools: ['Read', 'Write', 'Edit', 'Glob', 'Grep'],

          // Auto-allow file operations
          permissionMode: 'acceptEdits',

          // Include streaming updates
          includePartialMessages: !!options.onTextUpdate,
        },
      })

      // Process the stream
      let resultMessage: SDKResultMessage | undefined

      for await (const msg of stream) {
        if (msg.type === 'assistant') {
          // Extract text from assistant message
          const textBlocks = msg.message.content.filter(
            (block): block is Anthropic.Beta.Messages.BetaTextBlock => block.type === 'text',
          )
          const newText = textBlocks.map((b) => b.text).join('')

          if (newText !== fullText) {
            fullText = newText
            options.onTextUpdate?.(fullText)
          }

          // Track tool uses
          const toolUses = msg.message.content.filter(
            (block): block is Anthropic.Beta.Messages.BetaToolUseBlock => block.type === 'tool_use',
          )

          for (const toolUse of toolUses) {
            const args = toolUse.input as Record<string, unknown>
            options.onToolCall?.(toolUse.name, args)

            toolCalls.push({
              name: toolUse.name,
              args,
              result: null, // Will be updated later if we receive tool results
            })

            debugLog.info('Anthropic Agent: Tool call', {
              tool: toolUse.name,
              args,
            })
          }
        }

        if (msg.type === 'result') {
          resultMessage = msg
        }

        if (msg.type === 'stream_event' && options.onTextUpdate) {
          // Handle streaming partial updates
          if (msg.event.type === 'content_block_delta') {
            const delta = msg.event.delta
            if ('text' in delta) {
              fullText += delta.text
              options.onTextUpdate(fullText)
            }
          }
        }
      }

      // Check result
      if (resultMessage) {
        if (resultMessage.subtype === 'success') {
          debugLog.info('Anthropic Agent: Conversation complete', {
            responseLength: resultMessage.result.length,
            toolCallCount: toolCalls.length,
            numTurns: resultMessage.num_turns,
            costUsd: resultMessage.total_cost_usd,
          })

          return {
            success: true,
            response: resultMessage.result,
            toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
          }
        } else {
          // Error result
          const errors = 'errors' in resultMessage ? resultMessage.errors : []
          return {
            success: false,
            error: errors.join(', ') || 'Agent execution failed',
            toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
          }
        }
      }

      // No result message - use accumulated text
      return {
        success: true,
        response: fullText,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      const stack = err instanceof Error ? err.stack : undefined

      debugLog.error('Anthropic Agent: Failed', {
        message,
        stack,
        model: config.defaultModel,
      })

      return {
        success: false,
        error: message,
        debugDetails: stack ? `${message}\n${stack}` : message,
      }
    }
  }
}
