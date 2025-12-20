// OpenAI Provider using Vercel AI SDK

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
  AgenticResult,
  AgenticOptions,
  ConversationMessage,
  ToolCallRecord,
} from '../types.ts'
import type { LachesisConfig } from '../../../config/types.ts'
import { debugLog } from '../../../debug/logger.ts'

// ============================================================================
// OpenAIProvider
// ============================================================================

export class OpenAIProvider implements AIProvider {
  readonly type = 'openai' as const
  readonly displayName = 'OpenAI (Vercel AI SDK)'

  private getClient() {
    return createOpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    })
  }

  // --------------------------------------------------------------------------
  // Availability Check
  // --------------------------------------------------------------------------

  async isAvailable(): Promise<boolean> {
    return !!process.env.OPENAI_API_KEY
  }

  // --------------------------------------------------------------------------
  // Connection Test
  // --------------------------------------------------------------------------

  async testConnection(config: LachesisConfig): Promise<ConnectionResult> {
    try {
      const openai = this.getClient()
      const model = openai(config.defaultModel)

      await aiGenerateText({
        model,
        prompt: 'Hi',
      })

      return { connected: true }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      debugLog.error('OpenAI connection test failed', { message })
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
      const openai = this.getClient()
      const model = openai(config.defaultModel)

      debugLog.info('OpenAI: Streaming text', {
        model: config.defaultModel,
        messageCount: messages.length,
      })

      // Handle empty messages case (first question in a conversation)
      // The AI SDK requires at least one message, so we provide an initial prompt
      const effectiveMessages: CoreMessage[] = messages.length > 0
        ? messages.map((m) => ({
            role: m.role,
            content: m.content,
          })) as CoreMessage[]
        : [{ role: 'user' as const, content: 'Please respond according to your instructions and context.' }]

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

      debugLog.info('OpenAI: Streaming complete', {
        totalLength: fullText.length,
      })

      return { success: true, content: fullText.trim() }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      const stack = err instanceof Error ? err.stack : undefined
      debugLog.error('OpenAI: Stream failed', { message, stack })
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
      const openai = this.getClient()
      const model = openai(config.defaultModel)

      debugLog.info('OpenAI: Generating text', {
        model: config.defaultModel,
      })

      const { text } = await aiGenerateText({
        model,
        system: systemPrompt,
        prompt: userPrompt,
      })

      debugLog.info('OpenAI: Generation complete', {
        totalLength: text.length,
      })

      return { success: true, content: text.trim() }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      const stack = err instanceof Error ? err.stack : undefined
      debugLog.error('OpenAI: Generation failed', { message, stack })
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
    config: LachesisConfig,
  ): Promise<StructuredResult<T>> {
    try {
      const openai = this.getClient()
      const model = openai(config.defaultModel)

      debugLog.info('OpenAI: Generating structured output', {
        model: config.defaultModel,
      })

      const { object } = await generateObject({
        model,
        schema,
        prompt,
      })

      debugLog.info('OpenAI: Structured output complete')

      return { success: true, data: object }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      const stack = err instanceof Error ? err.stack : undefined
      debugLog.error('OpenAI: Structured output failed', { message, stack })
      return {
        success: false,
        error: `Failed to generate: ${message}`,
        debugDetails: stack ? `${message}\n${stack}` : message,
      }
    }
  }

  // --------------------------------------------------------------------------
  // Agentic Conversation (simplified without tool calling)
  // --------------------------------------------------------------------------

  async runAgenticConversation(
    config: LachesisConfig,
    options: AgenticOptions,
  ): Promise<AgenticResult> {
    // OpenAI provider does not support agentic conversation with file tools
    // This is a simplified implementation that just does text generation
    // For full agentic capabilities, use Anthropic SDK or Claude Code provider

    debugLog.info('OpenAI: Starting conversation (simplified mode)', {
      model: config.defaultModel,
      messageCount: options.messages.length,
    })

    try {
      const openai = this.getClient()
      const model = openai(config.defaultModel)

      // Handle empty messages case
      const effectiveMessages: CoreMessage[] = options.messages.length > 0
        ? options.messages.map((m) => ({
            role: m.role,
            content: m.content,
          })) as CoreMessage[]
        : [{ role: 'user' as const, content: 'Please respond according to your instructions and context.' }]

      const { text } = await aiGenerateText({
        model,
        system: options.systemPrompt,
        messages: effectiveMessages,
      })

      // Call the text update callback if provided
      if (options.onTextUpdate && text) {
        options.onTextUpdate(text)
      }

      debugLog.info('OpenAI: Conversation complete', {
        responseLength: text.length,
      })

      return {
        success: true,
        response: text,
        toolCalls: undefined, // No tool support in simplified mode
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      const stack = err instanceof Error ? err.stack : undefined

      debugLog.error('OpenAI: Conversation failed', {
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
