// Parse Claude Code's stream-json output format

// ============================================================================
// Stream JSON Message Types
// ============================================================================

export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: unknown }

export type AssistantMessage = {
  type: 'assistant'
  message: {
    content: ContentBlock[]
  }
}

export type ToolResultMessage = {
  type: 'tool_result'
  tool_use_id: string
  content: unknown
}

export type ResultMessage = {
  type: 'result'
  subtype: 'success' | 'error'
  result?: string
  cost_usd?: number
  duration_ms?: number
  num_turns?: number
  errors?: string[]
}

export type StreamEventMessage = {
  type: 'stream_event'
  event: {
    type: string
    delta?: { type: string; text?: string }
    [key: string]: unknown
  }
}

export type SystemMessage = {
  type: 'system'
  message: string
}

export type StreamJsonMessage =
  | AssistantMessage
  | ToolResultMessage
  | ResultMessage
  | StreamEventMessage
  | SystemMessage

// ============================================================================
// Parser
// ============================================================================

/**
 * Parse a single line of stream-json output
 */
export function parseStreamJsonLine(line: string): StreamJsonMessage | null {
  if (!line.trim()) {
    return null
  }

  try {
    const parsed = JSON.parse(line)

    // Validate that it has a type field
    if (!parsed || typeof parsed.type !== 'string') {
      return null
    }

    return parsed as StreamJsonMessage
  } catch {
    // Not valid JSON, skip
    return null
  }
}

/**
 * Extract text content from an assistant message
 */
export function extractTextFromAssistant(msg: AssistantMessage): string {
  const textBlocks = msg.message.content.filter(
    (block): block is { type: 'text'; text: string } => block.type === 'text',
  )
  return textBlocks.map((b) => b.text).join('')
}

/**
 * Extract tool uses from an assistant message
 */
export function extractToolUsesFromAssistant(msg: AssistantMessage): Array<{
  id: string
  name: string
  input: unknown
}> {
  return msg.message.content
    .filter(
      (block): block is { type: 'tool_use'; id: string; name: string; input: unknown } =>
        block.type === 'tool_use',
    )
    .map((block) => ({
      id: block.id,
      name: block.name,
      input: block.input,
    }))
}

// ============================================================================
// Stream Line Processor
// ============================================================================

export type StreamProcessor = {
  processLine(line: string): void
  getText(): string
  getToolCalls(): Array<{ name: string; args: Record<string, unknown>; result: unknown }>
  getResult(): ResultMessage | null
  hasError(): boolean
  getError(): string | null
}

/**
 * Create a stream processor to accumulate data from stream-json lines
 */
export function createStreamProcessor(
  onTextUpdate?: (text: string) => void,
  onToolCall?: (name: string, args: Record<string, unknown>) => void,
  onToolResult?: (name: string, result: unknown) => void,
): StreamProcessor {
  let fullText = ''
  const toolCalls: Array<{ id: string; name: string; args: Record<string, unknown>; result: unknown }> = []
  let result: ResultMessage | null = null
  let error: string | null = null

  return {
    processLine(line: string): void {
      const msg = parseStreamJsonLine(line)
      if (!msg) return

      switch (msg.type) {
        case 'assistant': {
          // Extract text
          const text = extractTextFromAssistant(msg)
          if (text && text !== fullText) {
            fullText = text
            onTextUpdate?.(fullText)
          }

          // Extract tool uses
          const toolUses = extractToolUsesFromAssistant(msg)
          for (const tool of toolUses) {
            const args = tool.input as Record<string, unknown>
            toolCalls.push({
              id: tool.id,
              name: tool.name,
              args,
              result: null,
            })
            onToolCall?.(tool.name, args)
          }
          break
        }

        case 'tool_result': {
          // Match tool result to tool call
          const toolCall = toolCalls.find((tc) => tc.id === msg.tool_use_id)
          if (toolCall) {
            toolCall.result = msg.content
            onToolResult?.(toolCall.name, msg.content)
          }
          break
        }

        case 'result':
          result = msg
          if (msg.subtype === 'error' && msg.errors?.length) {
            error = msg.errors.join(', ')
          }
          break

        case 'stream_event':
          // Handle streaming deltas
          if (msg.event.type === 'content_block_delta' && msg.event.delta?.text) {
            fullText += msg.event.delta.text
            onTextUpdate?.(fullText)
          }
          break
      }
    },

    getText(): string {
      return fullText
    },

    getToolCalls(): Array<{ name: string; args: Record<string, unknown>; result: unknown }> {
      return toolCalls.map((tc) => ({
        name: tc.name,
        args: tc.args,
        result: tc.result,
      }))
    },

    getResult(): ResultMessage | null {
      return result
    },

    hasError(): boolean {
      return !!error
    },

    getError(): string | null {
      return error
    },
  }
}
