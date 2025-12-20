// Anthropic types for Lachesis

export const ANTHROPIC_MODELS = [
  'claude-opus-4-5-20251101',
  'claude-sonnet-4-5-20250929',
  'claude-sonnet-4-20250514',
  'claude-haiku-3-5-20241022',
] as const

export type AnthropicModelId = (typeof ANTHROPIC_MODELS)[number]

// Message types for conversations
export type MessageRole = 'user' | 'assistant'

export type MessageContent =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string }

// Agent SDK stream message types
export type AgentStreamMessage =
  | { type: 'text'; content: string }
  | { type: 'tool_use'; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; name: string; result: unknown }
  | { type: 'error'; message: string }

// Result from agentic conversation
export type AgentResult = {
  success: boolean
  response?: string
  toolCalls?: Array<{
    name: string
    args: Record<string, unknown>
    result: unknown
  }>
  error?: string
  debugDetails?: string
}

// Tool call tracking
export type ToolCallRecord = {
  name: string
  args: Record<string, unknown>
  result: unknown
}
