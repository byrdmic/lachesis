import {
  generateText,
  generateObject,
  streamText,
  stepCountIs,
  type CoreMessage,
  type LanguageModel,
  type Tool,
} from 'ai'
import { openai } from '@ai-sdk/openai'
import { z } from 'zod'
import type { LachesisConfig } from '../config/types.ts'
import type { PlanningLevel } from '../core/project/types.ts'
import { debugLog } from '../debug/logger.ts'
import { isMCPConnected, getMCPToolNames } from '../mcp/index.ts'
import { createScopedTools } from '../mcp/tools.ts'

// ============================================================================
// Types
// ============================================================================

export type AIClient = {
  isConfigured: boolean
  provider: string
  model: string
}

export type ConversationMessage = {
  role: 'assistant' | 'user'
  content: string
  timestamp: string
}

export type ConversationContext = {
  planningLevel: PlanningLevel
  projectName: string
  oneLiner: string
  messages: ConversationMessage[]
  coveredTopics: string[]
}

export type AIConnectionResult = {
  connected: boolean
  error?: string
}

export type GenerationResult = {
  success: boolean
  content?: string
  error?: string
  /**
   * Additional detail for debugging (stack traces, context, etc).
   * Only surfaced in debug mode.
   */
  debugDetails?: string
}

// Schema for extracted project data
const ExtractedProjectDataSchema = z.object({
  vision: z.object({
    oneLinePitch: z
      .string()
      .describe('Single sentence describing what this does'),
    description: z.string().describe('2-3 sentence expanded description'),
    primaryAudience: z.string().describe('Primary user/audience'),
    secondaryAudience: z
      .string()
      .optional()
      .describe('Secondary audience if mentioned'),
    problemSolved: z
      .string()
      .describe('The specific problem or pain point this addresses'),
    successCriteria: z
      .string()
      .describe('How they will know if this succeeded'),
  }),
  constraints: z.object({
    known: z
      .array(z.string())
      .describe('Known constraints mentioned (time, budget, tech, etc)'),
    assumptions: z.array(z.string()).describe('Assumptions being made'),
    risks: z.array(z.string()).describe('Potential risks identified'),
    antiGoals: z.array(z.string()).describe('Things this should NOT become'),
  }),
  execution: z.object({
    suggestedFirstMove: z
      .string()
      .optional()
      .describe('Suggested first step if discussed'),
    techStack: z
      .string()
      .optional()
      .describe('Technology preferences if mentioned'),
  }),
})

export type ExtractedProjectData = z.infer<typeof ExtractedProjectDataSchema>

// ============================================================================
// Core Functions
// ============================================================================

function buildChatMessages(
  systemPrompt: string,
  context: ConversationContext,
): CoreMessage[] {
  const messages: CoreMessage[] = [{ role: 'system', content: systemPrompt }]

  for (const msg of context.messages) {
    messages.push({ role: msg.role, content: msg.content })
  }

  return messages
}

/**
 * Stream the next planning question, emitting incremental text updates.
 */
export async function streamNextQuestion(
  context: ConversationContext,
  systemPrompt: string,
  config: LachesisConfig,
  onUpdate?: (partial: string) => void,
): Promise<GenerationResult> {
  const model = openai(config.defaultModel) as unknown as LanguageModel

  try {
    const messages = buildChatMessages(systemPrompt, context)

    debugLog.info('Streaming next question: sending request', {
      provider: config.defaultProvider,
      model: config.defaultModel,
      systemPromptPreview: systemPrompt.slice(0, 200),
      messageCount: messages.length,
      coveredTopics: context.coveredTopics,
      lastMessage: context.messages.at(-1),
    })

    const stream = await streamText({
      model,
      messages,
      maxOutputTokens: 500,
    })

    let fullText = ''
    for await (const delta of stream.textStream) {
      fullText += delta
      onUpdate?.(fullText)
      debugLog.debug('Streaming next question: received delta', {
        delta,
        accumulatedLength: fullText.length,
      })
    }

    const trimmed = fullText.trim()

    debugLog.info('Streaming next question: completed', {
      provider: config.defaultProvider,
      model: config.defaultModel,
      contentPreview: trimmed.slice(0, 200),
      totalLength: trimmed.length,
    })
    return { success: true, content: trimmed }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const stack = err instanceof Error ? err.stack : undefined
    debugLog.error('Failed to stream planning question', {
      message,
      stack,
      provider: config.defaultProvider,
      model: config.defaultModel,
      messageCount: context.messages.length,
      coveredTopics: context.coveredTopics,
    })
    return {
      success: false,
      error: `Failed to generate question: ${message}`,
      debugDetails: stack ? `${message}\n${stack}` : message,
    }
  }
}

/**
   * Generate a summary of the conversation so far
   */
export async function generateSummary(
  context: ConversationContext,
  config: LachesisConfig,
): Promise<GenerationResult> {
  const model = openai(config.defaultModel) as unknown as LanguageModel

  try {
    const conversationText = context.messages
      .map((m) => `${m.role === 'assistant' ? 'Q' : 'A'}: ${m.content}`)
      .join('\n\n')

    debugLog.info('Generating summary: sending request', {
      provider: config.defaultProvider,
      model: config.defaultModel,
      messageCount: context.messages.length,
      planningLevel: context.planningLevel,
      projectName: context.projectName,
    })

    const result = await generateText({
      model,
      messages: [
        {
          role: 'system',
          content: `You are Lachesis. Polished, calm, impeccably formal British butler. Address the user as "sir" (or equivalent) every turn. Deliver crisp confirmations ("At your service, sir.", "As you wish.", "Right away, sir."). Stay HUD-aware of systems, environment, diagnostics, and data streams; offer polite safety/status notes when relevant (power, structural integrity, environmental conditions, system load). Humor is dry, subtle, observational—gentle corrections only; never goofy. One clear idea per line; short, efficient, call-and-response cadence. Remain supportive, unflappable, quietly devoted, even in emergencies. Avoid words like "transform", "journey", or "crystallize".`,
        },
        {
          role: 'user',
          content: `Project: ${context.projectName}
One-liner: ${context.oneLiner}

Conversation transcript:
${conversationText}

Summarize what we learned in a clear, bulleted format covering:
- What it does
- Who it's for
- What problem it solves
- Key constraints or considerations
- What success looks like

Keep bullets crisp and Jarvis-voiced; HUD/status flavor is welcome where it helps. Address the reader as "sir".`,
        },
      ],
      maxOutputTokens: 500,
      temperature: 0.5,
    })

    debugLog.info('Generating summary: received response', {
      provider: config.defaultProvider,
      model: config.defaultModel,
      contentPreview: result.text.slice(0, 200),
      totalLength: result.text.length,
    })

    return {
      success: true,
      content: result.text.trim(),
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const stack = err instanceof Error ? err.stack : undefined
    debugLog.error('Failed to generate summary', {
      message,
      stack,
      provider: config.defaultProvider,
      model: config.defaultModel,
      messageCount: context.messages.length,
    })
    return {
      success: false,
      error: `Failed to generate summary: ${message}`,
      debugDetails: stack ? `${message}\n${stack}` : message,
    }
  }
}

/**
 * Extract structured project data from conversation
 */
export async function extractProjectData(
  context: ConversationContext,
  config: LachesisConfig,
): Promise<{
  success: boolean
  data?: ExtractedProjectData
  error?: string
  debugDetails?: string
}> {
  const model = openai(config.defaultModel) as unknown as LanguageModel

  try {
    const conversationText = context.messages
      .map((m) => `${m.role === 'assistant' ? 'Q' : 'A'}: ${m.content}`)
      .join('\n\n')

    debugLog.info('Extracting project data: sending request', {
      provider: config.defaultProvider,
      model: config.defaultModel,
      messageCount: context.messages.length,
      planningLevel: context.planningLevel,
      projectName: context.projectName,
    })

    const result = await generateObject({
      model,
      schema: ExtractedProjectDataSchema,
      prompt: `Extract structured project information from this planning conversation.

Project name: ${context.projectName}
One-liner: ${context.oneLiner}

Conversation transcript:
${conversationText}

Extract all relevant information. For fields not discussed, use reasonable defaults or leave optional fields empty. Be direct and factual.`,
    })

    debugLog.info('Extracting project data: received response', {
      provider: config.defaultProvider,
      model: config.defaultModel,
      fields: Object.keys(result.object || {}),
    })

    return {
      success: true,
      data: result.object,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const stack = err instanceof Error ? err.stack : undefined
    debugLog.error('Failed to extract project data', {
      message,
      stack,
      provider: config.defaultProvider,
      model: config.defaultModel,
      messageCount: context.messages.length,
    })
    return {
      success: false,
      error: `Failed to extract data: ${message}`,
      debugDetails: stack ? `${message}\n${stack}` : message,
    }
  }
}

/**
 * Check if conversation should continue or wrap up
 */
export async function shouldContinueConversation(
  context: ConversationContext,
  config: LachesisConfig,
): Promise<{ continue: boolean; reason?: string }> {
  // Simple heuristic based on covered topics
  const topicsNeeded = Array.from(DEFAULT_DISCOVERY_TOPICS)
  const covered = new Set(context.coveredTopics)

  // Check if we've covered enough topics
  const uncovered = topicsNeeded.filter((t) => !covered.has(t))

  if (uncovered.length === 0) {
    return { continue: false, reason: 'All topics covered' }
  }

  // Also check message count as a safety limit
  const maxMessages = 12
  if (context.messages.length >= maxMessages) {
    return { continue: false, reason: 'Reached conversation limit' }
  }

  return { continue: true }
}

/**
 * Topics to cover during the planning conversation
 */
const DEFAULT_DISCOVERY_TOPICS = [
  'core_purpose',
  'target_users',
  'problem_solved',
  'constraints',
  'success_criteria',
  'anti_goals',
  'first_move',
  'tech_considerations',
] as const

// Export schema for use elsewhere
export { ExtractedProjectDataSchema }

// Schema for AI briefing response when loading existing projects
const AIBriefingResponseSchema = z.object({
  greeting: z.string().describe('Time-appropriate Lachesis greeting'),
  reorientation: z
    .string()
    .describe('1-2 sentences on what this project is and who it serves'),
  recentActivity: z
    .string()
    .describe('Summary of recent activity or lack thereof'),
  healthAssessment: z
    .string()
    .describe('Diplomatic assessment of missing/weak areas'),
  recommendations: z
    .array(z.string())
    .describe('2-3 concrete next moves'),
  question: z
    .string()
    .describe('One focused question to understand session intent'),
  suggestedActions: z
    .array(
      z.object({
        id: z.string(),
        label: z.string(),
        description: z.string(),
        actionType: z.enum([
          'continue_planning',
          'start_building',
          'review_roadmap',
          'update_log',
          'open_obsidian',
          'custom',
        ]),
      }),
    )
    .describe('Actions for the UI menu'),
})

export type AIBriefingResponse = z.infer<typeof AIBriefingResponseSchema>

/**
 * Generate a project briefing for an existing project
 */
export async function generateProjectBriefing(
  contextSerialized: string,
  systemPrompt: string,
  config: LachesisConfig,
): Promise<{
  success: boolean
  briefing?: AIBriefingResponse
  error?: string
  debugDetails?: string
}> {
  const model = openai(config.defaultModel) as unknown as LanguageModel

  try {
    debugLog.info('Generating project briefing: sending request', {
      provider: config.defaultProvider,
      model: config.defaultModel,
      contextLength: contextSerialized.length,
    })

    const result = await generateObject({
      model,
      schema: AIBriefingResponseSchema,
      prompt: systemPrompt,
    })

    debugLog.info('Generating project briefing: received response', {
      provider: config.defaultProvider,
      model: config.defaultModel,
      hasGreeting: !!result.object.greeting,
      actionCount: result.object.suggestedActions.length,
    })

    return {
      success: true,
      briefing: result.object,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const stack = err instanceof Error ? err.stack : undefined
    debugLog.error('Failed to generate project briefing', {
      message,
      stack,
      provider: config.defaultProvider,
      model: config.defaultModel,
    })
    return {
      success: false,
      error: `Failed to generate briefing: ${message}`,
      debugDetails: stack ? `${message}\n${stack}` : message,
    }
  }
}

export { AIBriefingResponseSchema }

// ============================================================================
// Agentic Conversation (MCP Tool-Calling)
// ============================================================================

export type AgenticToolCall = {
  name: string
  args: Record<string, unknown>
  result: unknown
}

export type AgenticConversationOptions = {
  systemPrompt: string
  messages: ConversationMessage[]
  projectPath?: string
  maxToolCalls?: number
  onToolCall?: (toolName: string, args: Record<string, unknown>) => void
  onToolResult?: (toolName: string, result: unknown) => void
}

export type AgenticResult = {
  success: boolean
  response?: string
  toolCalls?: AgenticToolCall[]
  error?: string
  debugDetails?: string
}

export type StreamingAgenticOptions = AgenticConversationOptions & {
  onTextUpdate?: (partial: string) => void
}

/**
 * Run an agentic conversation with MCP tool access.
 * The model can autonomously call MCP tools to search, read, and write vault files.
 */
export async function runAgenticConversation(
  config: LachesisConfig,
  options: AgenticConversationOptions,
): Promise<AgenticResult> {
  const model = openai(config.defaultModel) as unknown as LanguageModel

  try {
    // Get tools if MCP is connected and configured
    let tools: Record<string, Tool> = {}

    if (isMCPConnected() && config.mcp?.enabled) {
      if (options.projectPath && config.mcp) {
        // Use scoped tools that enforce project folder restrictions
        tools = createScopedTools(options.projectPath, config.mcp)
      } else {
        // No scoping - this shouldn't happen in normal flow
        debugLog.warn(
          'Agentic: MCP connected but no projectPath provided, skipping tools',
        )
      }

      const toolNames = Object.keys(tools)
      debugLog.info('Agentic: Using MCP tools', {
        toolCount: toolNames.length,
        toolNames,
        projectPath: options.projectPath,
      })
    } else {
      debugLog.info('Agentic: MCP not connected or disabled, running without tools')
    }

    // Build messages
    const messages: CoreMessage[] = [
      { role: 'system', content: options.systemPrompt },
      ...options.messages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    ]

    // Track tool calls for reporting
    const toolCalls: AgenticToolCall[] = []

    debugLog.info('Agentic: Starting conversation', {
      provider: config.defaultProvider,
      model: config.defaultModel,
      messageCount: messages.length,
      hasTools: Object.keys(tools).length > 0,
      maxSteps: options.maxToolCalls ?? 10,
    })

    // Run generation with tool-calling loop
    const result = await generateText({
      model,
      messages,
      maxOutputTokens: 500,
      tools: Object.keys(tools).length > 0 ? tools : undefined,
      stopWhen: stepCountIs(options.maxToolCalls ?? 10),
      onStepFinish: (step) => {
        // Track tool calls as they happen
        if (step.toolCalls && step.toolCalls.length > 0) {
          for (const call of step.toolCalls) {
            // Find matching result by toolCallId
            const toolResult = step.toolResults?.find(
              (r: { toolCallId: string }) => r.toolCallId === call.toolCallId,
            )

            // In AI SDK 5, tool calls use 'input' instead of 'args'
            const toolArgs = (call as { input?: Record<string, unknown> }).input ?? {}

            // Notify callback
            options.onToolCall?.(call.toolName, toolArgs)

            // Store for later
            toolCalls.push({
              name: call.toolName,
              args: toolArgs,
              result: toolResult,
            })

            // Notify result callback
            if (toolResult !== undefined) {
              options.onToolResult?.(call.toolName, toolResult)
            }

            debugLog.info('Agentic: Tool call completed', {
              tool: call.toolName,
              args: toolArgs,
              hasResult: toolResult !== undefined,
            })
          }
        }
      },
    })

    debugLog.info('Agentic: Conversation complete', {
      responseLength: result.text.length,
      toolCallCount: toolCalls.length,
      finishReason: result.finishReason,
    })

    return {
      success: true,
      response: result.text,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const stack = err instanceof Error ? err.stack : undefined

    debugLog.error('Agentic: Failed', {
      message,
      stack,
      provider: config.defaultProvider,
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
 * Stream an agentic conversation with MCP tool access.
 * Like runAgenticConversation but streams text incrementally.
 */
export async function streamAgenticConversation(
  config: LachesisConfig,
  options: StreamingAgenticOptions,
): Promise<AgenticResult> {
  const model = openai(config.defaultModel) as unknown as LanguageModel

  try {
    // Get tools if MCP is connected and configured
    let tools: Record<string, Tool> = {}

    if (isMCPConnected() && config.mcp?.enabled) {
      if (options.projectPath && config.mcp) {
        tools = createScopedTools(options.projectPath, config.mcp)
      } else {
        debugLog.warn(
          'Agentic stream: MCP connected but no projectPath provided, skipping tools',
        )
      }

      const toolNames = Object.keys(tools)
      debugLog.info('Agentic stream: Using MCP tools', {
        toolCount: toolNames.length,
        toolNames,
        projectPath: options.projectPath,
      })
    } else {
      debugLog.info('Agentic stream: MCP not connected or disabled, running without tools')
    }

    // Build messages
    const messages: CoreMessage[] = [
      { role: 'system', content: options.systemPrompt },
      ...options.messages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    ]

    // Track tool calls for reporting
    const toolCalls: AgenticToolCall[] = []

    debugLog.info('Agentic stream: Starting conversation', {
      provider: config.defaultProvider,
      model: config.defaultModel,
      messageCount: messages.length,
      hasTools: Object.keys(tools).length > 0,
      maxSteps: options.maxToolCalls ?? 10,
    })

    // Run streaming generation with tool-calling loop
    const stream = streamText({
      model,
      messages,
      maxOutputTokens: 500,
      tools: Object.keys(tools).length > 0 ? tools : undefined,
      stopWhen: stepCountIs(options.maxToolCalls ?? 10),
      onStepFinish: (step) => {
        // Track tool calls as they happen
        if (step.toolCalls && step.toolCalls.length > 0) {
          for (const call of step.toolCalls) {
            const toolResult = step.toolResults?.find(
              (r: { toolCallId: string }) => r.toolCallId === call.toolCallId,
            )

            const toolArgs = (call as { input?: Record<string, unknown> }).input ?? {}

            options.onToolCall?.(call.toolName, toolArgs)

            toolCalls.push({
              name: call.toolName,
              args: toolArgs,
              result: toolResult,
            })

            if (toolResult !== undefined) {
              options.onToolResult?.(call.toolName, toolResult)
            }

            debugLog.info('Agentic stream: Tool call completed', {
              tool: call.toolName,
              args: toolArgs,
              hasResult: toolResult !== undefined,
            })
          }
        }
      },
    })

    // Stream text updates
    let fullText = ''
    for await (const delta of stream.textStream) {
      fullText += delta
      options.onTextUpdate?.(fullText)
    }

    debugLog.info('Agentic stream: Conversation complete', {
      responseLength: fullText.length,
      toolCallCount: toolCalls.length,
    })

    return {
      success: true,
      response: fullText,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const stack = err instanceof Error ? err.stack : undefined

    debugLog.error('Agentic stream: Failed', {
      message,
      stack,
      provider: config.defaultProvider,
      model: config.defaultModel,
    })

    return {
      success: false,
      error: message,
      debugDetails: stack ? `${message}\n${stack}` : message,
    }
  }
}
