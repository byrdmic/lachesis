// OpenAI Provider using Vercel AI SDK
// Adapted for Obsidian plugin - API key passed via constructor

import { createOpenAI } from '@ai-sdk/openai'
import {
  streamText as aiStreamText,
  generateText as aiGenerateText,
  generateObject,
  type CoreMessage,
} from 'ai'
import { z } from 'zod'
import type {
  AIProvider,
  ConnectionResult,
  TextResult,
  StructuredResult,
  ConversationMessage,
} from '../types'

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
}
