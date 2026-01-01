// Anthropic SDK Provider for Obsidian plugin
// Uses @anthropic-ai/sdk for Claude API access

import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import type {
  AIProvider,
  ConnectionResult,
  TextResult,
  StructuredResult,
  ConversationMessage,
} from '../types'
import { zodToJsonSchema } from './zod-to-json-schema'

// ============================================================================
// AnthropicProvider
// ============================================================================

export class AnthropicProvider implements AIProvider {
  readonly type = 'anthropic' as const
  readonly displayName = 'Anthropic (Claude)'

  private client: Anthropic | null = null

  constructor(
    private apiKey: string,
    private model: string,
  ) {}

  private getClient(): Anthropic {
    if (!this.client) {
      this.client = new Anthropic({
        apiKey: this.apiKey,
      })
    }
    return this.client
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
      const client = this.getClient()

      // Make a minimal API call to verify credentials
      await client.messages.create({
        model: this.model,
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Hi' }],
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
      const client = this.getClient()

      // Convert messages to Anthropic format
      // Handle empty messages case
      const anthropicMessages: Anthropic.MessageParam[] =
        messages.length > 0
          ? messages.map((m) => ({
              role: m.role as 'user' | 'assistant',
              content: m.content,
            }))
          : [{ role: 'user' as const, content: 'Please respond according to your instructions and context.' }]

      const stream = client.messages.stream({
        model: this.model,
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
      const client = this.getClient()

      const response = await client.messages.create({
        model: this.model,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
        max_tokens: 5000,
      })

      // Extract text content
      const textContent = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map((block) => block.text)
        .join('')

      return { success: true, content: textContent.trim() }
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
  // Structured Output (via tool_use)
  // --------------------------------------------------------------------------

  async generateStructuredOutput<T>(
    prompt: string,
    schema: z.ZodSchema<T>,
  ): Promise<StructuredResult<T>> {
    try {
      const client = this.getClient()

      // Convert Zod schema to JSON Schema for tool definition
      const jsonSchema = zodToJsonSchema(schema)

      const response = await client.messages.create({
        model: this.model,
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
        return {
          success: false,
          error: `Validation failed: ${parsed.error.message}`,
        }
      }

      return { success: true, data: parsed.data }
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
}
