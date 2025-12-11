import {
  generateText,
  generateObject,
  streamText,
  type CoreMessage,
} from 'ai'
import { z } from 'zod'
import type { LachesisConfig } from '../config/types.ts'
import type { PlanningLevel } from '../core/project/types.ts'
import { debugLog } from '../debug/logger.ts'

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
  const model = config.defaultModel

  try {
    const messages = buildChatMessages(systemPrompt, context)

    const stream = await streamText({
      model,
      messages,
      maxOutputTokens: 300,
    })

    let fullText = ''
    for await (const delta of stream.textStream) {
      fullText += delta
      onUpdate?.(fullText)
    }

    const trimmed = fullText.trim()
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
  const model = config.defaultModel

  try {
    const conversationText = context.messages
      .map((m) => `${m.role === 'assistant' ? 'Q' : 'A'}: ${m.content}`)
      .join('\n\n')

    const result = await generateText({
      model,
      messages: [
        {
          role: 'system',
          content: `You are JARVIS (Iron Man/Avengers). Polished, calm, impeccably formal British butler. Address the user as "sir" (or equivalent) every turn. Deliver crisp confirmations ("At your service, sir.", "As you wish.", "Right away, sir."). Stay HUD-aware of systems, environment, diagnostics, and data streams; offer polite safety/status notes when relevant (power, structural integrity, environmental conditions, system load). Humor is dry, subtle, observational—gentle corrections only; never goofy. One clear idea per line; short, efficient, call-and-response cadence. Remain supportive, unflappable, quietly devoted, even in emergencies. Avoid words like "transform", "journey", or "crystallize".`,
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
  const model = config.defaultModel

  try {
    const conversationText = context.messages
      .map((m) => `${m.role === 'assistant' ? 'Q' : 'A'}: ${m.content}`)
      .join('\n\n')

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
