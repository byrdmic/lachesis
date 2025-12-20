// Anthropic client wrapper for Lachesis
// Uses Claude Agent SDK for agentic conversations and Anthropic SDK for structured output

import Anthropic from '@anthropic-ai/sdk'
import { query, type Query, type SDKMessage, type SDKResultMessage } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'
import type { LachesisConfig } from '../config/types.ts'
import type { ConversationMessage } from './client.ts'
import { debugLog } from '../debug/logger.ts'
import type { AgentResult, ToolCallRecord } from './anthropic-types.ts'

// ============================================================================
// Anthropic SDK Client (for structured output)
// ============================================================================

let anthropicClient: Anthropic | null = null

function getAnthropicClient(): Anthropic {
  if (!anthropicClient) {
    anthropicClient = new Anthropic()
  }
  return anthropicClient
}

/**
 * Test connection to Anthropic API
 */
export async function testAnthropicConnection(
  config: LachesisConfig,
): Promise<{ connected: boolean; error?: string }> {
  try {
    const client = getAnthropicClient()

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

// ============================================================================
// Streaming Text Generation (for question generation)
// ============================================================================

export type StreamingResult = {
  success: boolean
  content?: string
  error?: string
  debugDetails?: string
}

/**
 * Stream text generation using Anthropic SDK
 * Used for generating interview questions with streaming updates
 */
export async function streamText(
  systemPrompt: string,
  messages: ConversationMessage[],
  config: LachesisConfig,
  onUpdate?: (partial: string) => void,
): Promise<StreamingResult> {
  try {
    const client = getAnthropicClient()

    // Convert messages to Anthropic format
    // Handle empty messages case (first question in a conversation)
    const anthropicMessages = messages.length > 0
      ? messages.map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        }))
      : [{ role: 'user' as const, content: 'Please respond according to your instructions and context.' }]

    debugLog.info('Streaming text: sending request', {
      provider: 'anthropic',
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

    debugLog.info('Streaming text: completed', {
      provider: 'anthropic',
      model: config.defaultModel,
      totalLength: fullText.length,
    })

    return { success: true, content: fullText.trim() }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const stack = err instanceof Error ? err.stack : undefined
    debugLog.error('Failed to stream text', { message, stack })
    return {
      success: false,
      error: `Failed to generate: ${message}`,
      debugDetails: stack ? `${message}\n${stack}` : message,
    }
  }
}

/**
 * Generate text (non-streaming) using Anthropic SDK
 */
export async function generateText(
  systemPrompt: string,
  userPrompt: string,
  config: LachesisConfig,
): Promise<StreamingResult> {
  try {
    const client = getAnthropicClient()

    debugLog.info('Generating text: sending request', {
      provider: 'anthropic',
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

    debugLog.info('Generating text: completed', {
      provider: 'anthropic',
      model: config.defaultModel,
      totalLength: textContent.length,
    })

    return { success: true, content: textContent.trim() }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const stack = err instanceof Error ? err.stack : undefined
    debugLog.error('Failed to generate text', { message, stack })
    return {
      success: false,
      error: `Failed to generate: ${message}`,
      debugDetails: stack ? `${message}\n${stack}` : message,
    }
  }
}

// ============================================================================
// Structured Output (for data extraction)
// ============================================================================

/**
 * Generate structured output using Anthropic's tool_use pattern
 * This replaces the Vercel AI SDK's generateObject() function
 */
export async function generateStructuredOutput<T>(
  prompt: string,
  schema: z.ZodSchema<T>,
  config: LachesisConfig,
): Promise<{ success: boolean; data?: T; error?: string; debugDetails?: string }> {
  try {
    const client = getAnthropicClient()

    // Convert Zod schema to JSON Schema for tool definition
    const jsonSchema = zodToJsonSchema(schema)

    debugLog.info('Generating structured output: sending request', {
      provider: 'anthropic',
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
      debugLog.error('Structured output validation failed', {
        errors: parsed.error.errors,
      })
      return {
        success: false,
        error: `Validation failed: ${parsed.error.message}`,
      }
    }

    debugLog.info('Generating structured output: completed', {
      provider: 'anthropic',
      model: config.defaultModel,
    })

    return { success: true, data: parsed.data }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const stack = err instanceof Error ? err.stack : undefined
    debugLog.error('Failed to generate structured output', { message, stack })
    return {
      success: false,
      error: `Failed to generate: ${message}`,
      debugDetails: stack ? `${message}\n${stack}` : message,
    }
  }
}

/**
 * Convert Zod schema to JSON Schema (simplified version)
 */
function zodToJsonSchema(schema: z.ZodSchema): Record<string, unknown> {
  // Use Zod's built-in JSON schema generation if available
  // For now, we'll use a simplified approach that works with most common types
  const jsonSchema = (schema as unknown as { _def: { typeName: string } })._def

  // Handle ZodObject
  if (jsonSchema.typeName === 'ZodObject') {
    const shape = (schema as z.ZodObject<z.ZodRawShape>).shape
    const properties: Record<string, unknown> = {}
    const required: string[] = []

    for (const [key, value] of Object.entries(shape)) {
      const fieldSchema = value as z.ZodTypeAny
      properties[key] = zodFieldToJsonSchema(fieldSchema)

      // Check if field is required (not optional)
      if (!fieldSchema.isOptional()) {
        required.push(key)
      }
    }

    return {
      type: 'object',
      properties,
      required: required.length > 0 ? required : undefined,
    }
  }

  // Handle ZodArray
  if (jsonSchema.typeName === 'ZodArray') {
    const innerType = (schema as z.ZodArray<z.ZodTypeAny>).element
    return {
      type: 'array',
      items: zodFieldToJsonSchema(innerType),
    }
  }

  // Fallback for simple types
  return zodFieldToJsonSchema(schema)
}

function zodFieldToJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  const def = (schema as unknown as { _def: { typeName: string; description?: string; innerType?: z.ZodTypeAny } })._def

  // Handle optional wrapper
  if (def.typeName === 'ZodOptional') {
    return zodFieldToJsonSchema(def.innerType!)
  }

  // Handle described wrapper
  if (def.typeName === 'ZodDescribed' || def.description) {
    const inner = zodFieldToJsonSchema(def.innerType || schema)
    return { ...inner, description: def.description }
  }

  switch (def.typeName) {
    case 'ZodString':
      return { type: 'string', description: def.description }
    case 'ZodNumber':
      return { type: 'number', description: def.description }
    case 'ZodBoolean':
      return { type: 'boolean', description: def.description }
    case 'ZodArray': {
      const arrSchema = schema as z.ZodArray<z.ZodTypeAny>
      return {
        type: 'array',
        items: zodFieldToJsonSchema(arrSchema.element),
        description: def.description,
      }
    }
    case 'ZodObject': {
      const objSchema = schema as z.ZodObject<z.ZodRawShape>
      const properties: Record<string, unknown> = {}
      const required: string[] = []

      for (const [key, value] of Object.entries(objSchema.shape)) {
        const fieldSchema = value as z.ZodTypeAny
        properties[key] = zodFieldToJsonSchema(fieldSchema)
        if (!fieldSchema.isOptional()) {
          required.push(key)
        }
      }

      return {
        type: 'object',
        properties,
        required: required.length > 0 ? required : undefined,
        description: def.description,
      }
    }
    case 'ZodEnum': {
      const enumSchema = schema as z.ZodEnum<[string, ...string[]]>
      return {
        type: 'string',
        enum: enumSchema.options,
        description: def.description,
      }
    }
    default:
      return { type: 'string', description: def.description }
  }
}

// ============================================================================
// Agent SDK (for agentic conversations with file tools)
// ============================================================================

export type AgenticOptions = {
  systemPrompt: string
  messages: ConversationMessage[]
  projectPath?: string
  maxTurns?: number
  onToolCall?: (toolName: string, args: Record<string, unknown>) => void
  onToolResult?: (toolName: string, result: unknown) => void
  onTextUpdate?: (partial: string) => void
}

/**
 * Run an agentic conversation using Claude Agent SDK
 * The agent can use built-in file tools: Read, Write, Edit, Glob, Grep
 */
export async function runAgenticConversation(
  config: LachesisConfig,
  options: AgenticOptions,
): Promise<AgentResult> {
  try {
    // Build the prompt from conversation messages
    const conversationText = options.messages
      .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
      .join('\n\n')

    const fullPrompt = conversationText

    debugLog.info('Agentic: Starting conversation', {
      provider: 'anthropic',
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
      prompt: fullPrompt,
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

          debugLog.info('Agentic: Tool call', {
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
        debugLog.info('Agentic: Conversation complete', {
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

    debugLog.error('Agentic: Failed', {
      message,
      stack,
      provider: 'anthropic',
      model: config.defaultModel,
    })

    return {
      success: false,
      error: message,
      debugDetails: stack ? `${message}\n${stack}` : message,
    }
  }
}

/**
 * Stream an agentic conversation using Claude Agent SDK
 * Same as runAgenticConversation but with streaming enabled
 */
export async function streamAgenticConversation(
  config: LachesisConfig,
  options: AgenticOptions,
): Promise<AgentResult> {
  // The run function already supports streaming via onTextUpdate
  return runAgenticConversation(config, {
    ...options,
    onTextUpdate: options.onTextUpdate,
  })
}
