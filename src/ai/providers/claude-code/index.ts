// Claude Code Subprocess Provider
// Uses the claude CLI in headless mode with MAX subscription

import { spawn, type Subprocess } from 'bun'
import { z } from 'zod'
import type {
  AIProvider,
  ConnectionResult,
  TextResult,
  StructuredResult,
  AgenticResult,
  AgenticOptions,
  ConversationMessage,
} from '../types.ts'
import type { LachesisConfig } from '../../../config/types.ts'
import { debugLog } from '../../../debug/logger.ts'
import { checkClaudeAvailability } from './availability.ts'
import { createStreamProcessor, parseStreamJsonLine, type ResultMessage } from './stream-parser.ts'

// ============================================================================
// ClaudeCodeProvider
// ============================================================================

export class ClaudeCodeProvider implements AIProvider {
  readonly type = 'claude-code' as const
  readonly displayName = 'Claude Code (MAX)'

  // --------------------------------------------------------------------------
  // Availability Check
  // --------------------------------------------------------------------------

  async isAvailable(): Promise<boolean> {
    return checkClaudeAvailability()
  }

  // --------------------------------------------------------------------------
  // Connection Test
  // --------------------------------------------------------------------------

  async testConnection(_config: LachesisConfig): Promise<ConnectionResult> {
    const available = await this.isAvailable()
    if (!available) {
      return { connected: false, error: 'Claude CLI not found in PATH' }
    }

    // Test with a minimal prompt
    try {
      const result = await this.runClaudeCommand(['--version'])
      if (result.exitCode === 0) {
        return { connected: true }
      }
      return { connected: false, error: 'Claude CLI check failed' }
    } catch (err) {
      return {
        connected: false,
        error: err instanceof Error ? err.message : 'Connection test failed',
      }
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
    // Build prompt from messages, or use a placeholder for first message generation
    let prompt = this.buildPromptFromMessages(messages)
    debugLog.info('Claude Code: Prompt', { prompt })

    // If no messages yet (first question generation), the system prompt contains all context
    // We need to ask Claude to generate the opening question/greeting
    const isFirstMessage = messages.length === 0

    if (isFirstMessage) {
      // For first message, tell Claude to respond based on the system prompt context
      prompt = 'Please respond according to your instructions and context.'
    }

    // Final validation
    if (!prompt || prompt.trim() === '') {
      debugLog.error('Claude Code: Empty prompt provided', { messages, isFirstMessage })
      return {
        success: false,
        error: 'Cannot call Claude Code with an empty prompt',
      }
    }

    try {
      const args: string[] = []

      // Add prompt - must come first
      args.push('-p', prompt)

      // Add output format (--verbose required when using --print with stream-json)
      // --include-partial-messages enables real-time streaming of content as it's generated
      args.push('--output-format', 'stream-json', '--verbose', '--include-partial-messages')

      // Add model
      args.push('--model', config.defaultModel)

      // Add system prompt - use --system-prompt for first message to set full context,
      // --append-system-prompt for subsequent messages to add to Claude Code's defaults
      if (systemPrompt && systemPrompt.trim()) {
        if (isFirstMessage) {
          // First message: set full system prompt context
          args.push('--system-prompt', systemPrompt)
        } else {
          // Subsequent: append to defaults
          args.push('--append-system-prompt', systemPrompt)
        }
      }

      debugLog.info('Claude Code: Streaming text', {
        model: config.defaultModel,
        messageCount: messages.length,
        isFirstMessage,
        promptLength: prompt.length,
        promptPreview: prompt.slice(0, 100),
        systemPromptLength: systemPrompt?.length ?? 0,
      })

      const processor = createStreamProcessor(onUpdate)
      await this.runClaudeCommandStreaming(args, (line) => {
        processor.processLine(line)
      })

      const fullText = processor.getText()
      const result = processor.getResult()

      if (processor.hasError()) {
        return {
          success: false,
          error: processor.getError() || 'Unknown error',
        }
      }

      debugLog.info('Claude Code: Streaming complete', {
        totalLength: fullText.length,
      })

      return { success: true, content: fullText.trim() }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      debugLog.error('Claude Code: Stream failed', { message })
      return {
        success: false,
        error: message,
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
    // Validate prompt is not empty
    if (!userPrompt || userPrompt.trim() === '') {
      debugLog.error('Claude Code: Empty prompt provided')
      return {
        success: false,
        error: 'Cannot call Claude Code with an empty prompt',
      }
    }

    try {
      const args: string[] = []

      // Add prompt - must come first
      args.push('-p', userPrompt)

      // Add output format
      args.push('--output-format', 'json')

      // Add model
      args.push('--model', config.defaultModel)

      // Add system prompt if provided
      if (systemPrompt && systemPrompt.trim()) {
        args.push('--append-system-prompt', systemPrompt)
      }

      debugLog.info('Claude Code: Generating text', {
        model: config.defaultModel,
        promptLength: userPrompt.length,
        args: args.join(' '),
      })

      const result = await this.runClaudeCommand(args)

      if (result.exitCode !== 0) {
        return {
          success: false,
          error: result.stderr || `Claude exited with code ${result.exitCode}`,
        }
      }

      // Parse JSON output
      try {
        const parsed = JSON.parse(result.stdout)
        const content = parsed.result || parsed.content || result.stdout
        return { success: true, content: String(content).trim() }
      } catch {
        // If not JSON, use raw output
        return { success: true, content: result.stdout.trim() }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      debugLog.error('Claude Code: Generation failed', { message })
      return {
        success: false,
        error: message,
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
    // Validate prompt is not empty
    if (!prompt || prompt.trim() === '') {
      debugLog.error('Claude Code: Empty prompt provided for structured output')
      return {
        success: false,
        error: 'Cannot call Claude Code with an empty prompt',
      }
    }

    // For structured output, we ask Claude to return JSON matching the schema
    // and then validate with Zod
    const schemaDescription = this.describeSchema(schema)

    const structuredPrompt = `${prompt}

IMPORTANT: Respond with valid JSON matching this schema:
${schemaDescription}

Return ONLY the JSON object, no other text.`

    try {
      const args: string[] = []

      // Add prompt - must come first
      args.push('-p', structuredPrompt)

      // Add output format
      args.push('--output-format', 'json')

      // Add model
      args.push('--model', config.defaultModel)

      debugLog.info('Claude Code: Generating structured output', {
        model: config.defaultModel,
        promptLength: structuredPrompt.length,
      })

      const result = await this.runClaudeCommand(args)

      if (result.exitCode !== 0) {
        return {
          success: false,
          error: result.stderr || `Claude exited with code ${result.exitCode}`,
        }
      }

      // Parse the output
      let jsonStr = result.stdout.trim()

      // Try to extract JSON from the result field if present
      try {
        const parsed = JSON.parse(jsonStr)
        if (parsed.result) {
          jsonStr = parsed.result
        }
      } catch {
        // Not wrapped, use as-is
      }

      // Extract JSON if wrapped in markdown code blocks
      const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
      if (jsonMatch?.[1]) {
        jsonStr = jsonMatch[1]
      }

      // Parse and validate with Zod
      const data = JSON.parse(jsonStr)
      const validated = schema.safeParse(data)

      if (!validated.success) {
        debugLog.error('Claude Code: Validation failed', {
          errors: validated.error.errors,
        })
        return {
          success: false,
          error: `Validation failed: ${validated.error.message}`,
        }
      }

      debugLog.info('Claude Code: Structured output complete')

      return { success: true, data: validated.data }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      debugLog.error('Claude Code: Structured output failed', { message })
      return {
        success: false,
        error: message,
      }
    }
  }

  // --------------------------------------------------------------------------
  // Agentic Conversation
  // --------------------------------------------------------------------------

  async runAgenticConversation(
    config: LachesisConfig,
    options: AgenticOptions,
  ): Promise<AgenticResult> {
    let prompt = this.buildPromptFromMessages(options.messages)

    // Handle first message case (no messages yet)
    const isFirstMessage = options.messages.length === 0

    if (isFirstMessage) {
      // For first message, tell Claude to respond based on the system prompt context
      prompt = 'Please respond according to your instructions and context.'
    }

    // Validate prompt is not empty
    if (!prompt || prompt.trim() === '') {
      debugLog.error('Claude Code: Empty prompt provided for agentic conversation', { messages: options.messages })
      return {
        success: false,
        error: 'Cannot call Claude Code with an empty prompt',
      }
    }

    try {
      const args: string[] = []

      // Add prompt - must come first
      args.push('-p', prompt)

      // Add output format (--verbose required when using --print with stream-json)
      // --include-partial-messages enables real-time streaming of content as it's generated
      args.push('--output-format', 'stream-json', '--verbose', '--include-partial-messages')

      // Add model
      args.push('--model', config.defaultModel)

      // Add allowed tools for file operations
      args.push('--allowedTools', 'Read,Write,Edit,Glob,Grep')

      // Add system prompt - use --system-prompt for first message to set full context,
      // --append-system-prompt for subsequent messages to add to Claude Code's defaults
      if (options.systemPrompt && options.systemPrompt.trim()) {
        if (isFirstMessage) {
          // First message: set full system prompt context (replaces Claude Code defaults)
          args.push('--system-prompt', options.systemPrompt)
        } else {
          // Subsequent: append to defaults
          args.push('--append-system-prompt', options.systemPrompt)
        }
      }

      // Add project directory if provided
      if (options.projectPath) {
        args.push('--add-dir', options.projectPath)
      }

      // Add max turns if provided
      if (options.maxTurns) {
        args.push('--max-turns', String(options.maxTurns))
      }

      debugLog.info('Claude Code: Starting agentic conversation', {
        model: config.defaultModel,
        messageCount: options.messages.length,
        isFirstMessage,
        projectPath: options.projectPath,
        promptLength: prompt.length,
        systemPromptLength: options.systemPrompt?.length ?? 0,
      })

      const processor = createStreamProcessor(
        options.onTextUpdate,
        options.onToolCall,
        options.onToolResult,
      )

      await this.runClaudeCommandStreaming(args, (line) => {
        processor.processLine(line)
      })

      const fullText = processor.getText()
      const toolCalls = processor.getToolCalls()
      const result = processor.getResult()

      if (processor.hasError()) {
        return {
          success: false,
          error: processor.getError() || 'Unknown error',
          toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        }
      }

      debugLog.info('Claude Code: Agentic conversation complete', {
        responseLength: fullText.length,
        toolCallCount: toolCalls.length,
      })

      return {
        success: true,
        response: result?.result || fullText,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      debugLog.error('Claude Code: Agentic conversation failed', { message })
      return {
        success: false,
        error: message,
      }
    }
  }

  // --------------------------------------------------------------------------
  // Private Helpers
  // --------------------------------------------------------------------------

  private buildPromptFromMessages(messages: ConversationMessage[]): string {
    if (messages.length === 0) {
      return ''
    }

    const firstMessage = messages[0]
    // If there's only one message and it's from the user, return it directly
    if (messages.length === 1 && firstMessage && firstMessage.role === 'user') {
      return firstMessage.content
    }

    // Build a conversation format
    return messages
      .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
      .join('\n\n')
  }

  private async runClaudeCommand(args: string[]): Promise<{
    exitCode: number
    stdout: string
    stderr: string
  }> {
    const proc = spawn(['claude', ...args], {
      stdout: 'pipe',
      stderr: 'pipe',
    })

    const stdout = await new Response(proc.stdout).text()
    const stderr = await new Response(proc.stderr).text()
    const exitCode = await proc.exited

    return { exitCode, stdout, stderr }
  }

  private async runClaudeCommandStreaming(
    args: string[],
    onLine: (line: string) => void,
  ): Promise<void> {
    const proc = spawn(['claude', ...args], {
      stdout: 'pipe',
      stderr: 'pipe',
    })

    const reader = proc.stdout.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (line.trim()) {
            onLine(line)
          }
        }
      }

      // Process remaining buffer
      if (buffer.trim()) {
        onLine(buffer)
      }
    } finally {
      reader.releaseLock()
    }

    const exitCode = await proc.exited
    if (exitCode !== 0) {
      const stderr = await new Response(proc.stderr).text()
      throw new Error(stderr || `Claude exited with code ${exitCode}`)
    }
  }

  private describeSchema(schema: z.ZodSchema): string {
    // Generate a simple JSON schema description
    try {
      const def = (schema as unknown as { _def: { typeName: string } })._def

      if (def.typeName === 'ZodObject') {
        const shape = (schema as z.ZodObject<z.ZodRawShape>).shape
        const fields: string[] = []

        for (const [key, value] of Object.entries(shape)) {
          const fieldDef = (value as unknown as { _def: { typeName: string; description?: string } })._def
          const type = this.getZodTypeName(fieldDef.typeName)
          const optional = (value as z.ZodTypeAny).isOptional()
          const desc = fieldDef.description ? ` // ${fieldDef.description}` : ''
          fields.push(`  "${key}"${optional ? '?' : ''}: ${type}${desc}`)
        }

        return `{\n${fields.join(',\n')}\n}`
      }

      return 'object'
    } catch {
      return 'object'
    }
  }

  private getZodTypeName(typeName: string): string {
    switch (typeName) {
      case 'ZodString':
        return 'string'
      case 'ZodNumber':
        return 'number'
      case 'ZodBoolean':
        return 'boolean'
      case 'ZodArray':
        return 'array'
      case 'ZodObject':
        return 'object'
      case 'ZodOptional':
        return 'optional'
      default:
        return 'any'
    }
  }
}
