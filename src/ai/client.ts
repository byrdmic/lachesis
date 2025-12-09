// AI Client for Lachesis - handles all AI interactions
import { openai, createOpenAI } from '@ai-sdk/openai'
import { generateText, generateObject } from 'ai'
import { z } from 'zod'
import type { LachesisConfig } from '../config/types.ts'
import type { PlanningLevel, InterviewDepth } from '../core/project/types.ts'
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
  depth: InterviewDepth
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

/**
 * Create an AI client based on config
 */
export function createAIClient(config: LachesisConfig): AIClient {
  const apiKey = process.env[config.apiKeyEnvVar]
  const isConfigured = Boolean(apiKey)

  return {
    isConfigured,
    provider: config.defaultProvider,
    model: config.defaultModel,
  }
}

/**
 * Check if AI features are available (sync check)
 */
export function isAIAvailable(config: LachesisConfig): boolean {
  const apiKey = process.env[config.apiKeyEnvVar]
  return Boolean(apiKey)
}

/**
 * Get the configured OpenAI provider
 */
export function getOpenAIProvider(config: LachesisConfig) {
  const apiKey = process.env[config.apiKeyEnvVar]

  if (!apiKey) {
    return null
  }

  return createOpenAI({ apiKey })
}

/**
 * Test AI connection by making a minimal API call
 */
export async function testAIConnection(
  config: LachesisConfig,
): Promise<AIConnectionResult> {
  debugLog.debug('Testing AI connection', { config: JSON.stringify(config) })
  const provider = getOpenAIProvider(config)
  debugLog.debug('Provider', { provider })

  if (!provider) {
    return {
      connected: false,
      error: `No API key found. Set ${config.apiKeyEnvVar} environment variable.`,
    }
  }

  try {
    // Make a minimal API call to verify connection
    await generateText({
      model: provider(config.defaultModel),
      prompt: "Say 'ok'",
      maxTokens: 5,
    })

    return { connected: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)

    // Provide helpful error messages
    if (message.includes('401') || message.includes('invalid_api_key')) {
      return {
        connected: false,
        error: 'Invalid API key. Check your API key and try again.',
      }
    }
    if (message.includes('429')) {
      return {
        connected: false,
        error: 'Rate limited. Wait a moment and try again.',
      }
    }
    if (message.includes('model')) {
      return {
        connected: false,
        error: `Model "${config.defaultModel}" not available. Check your settings.`,
      }
    }

    return {
      connected: false,
      error: `Connection failed: ${message}`,
    }
  }
}

/**
 * Generate the next interview question based on conversation context
 */
export async function generateNextQuestion(
  context: ConversationContext,
  systemPrompt: string,
  config: LachesisConfig,
): Promise<GenerationResult> {
  const provider = getOpenAIProvider(config)

  if (!provider) {
    return {
      success: false,
      error: 'AI not configured',
    }
  }

  try {
    // Build message history for the AI
    const messages: Array<{
      role: 'system' | 'user' | 'assistant'
      content: string
    }> = [{ role: 'system', content: systemPrompt }]

    // Add conversation history
    for (const msg of context.messages) {
      messages.push({
        role: msg.role,
        content: msg.content,
      })
    }

    const result = await generateText({
      model: provider(config.defaultModel),
      messages,
      maxTokens: 300,
      temperature: 0.7,
    })

    return {
      success: true,
      content: result.text.trim(),
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return {
      success: false,
      error: `Failed to generate question: ${message}`,
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
  const provider = getOpenAIProvider(config)

  if (!provider) {
    return {
      success: false,
      error: 'AI not configured',
    }
  }

  try {
    const conversationText = context.messages
      .map((m) => `${m.role === 'assistant' ? 'Q' : 'A'}: ${m.content}`)
      .join('\n\n')

    const result = await generateText({
      model: provider(config.defaultModel),
      messages: [
        {
          role: 'system',
          content: `You are summarizing a project ideation interview. Create a clear, structured summary of what was discussed. Be direct and factual. Do not use words like "transform", "journey", or "crystallize".`,
        },
        {
          role: 'user',
          content: `Project: ${context.projectName}
One-liner: ${context.oneLiner}

Interview transcript:
${conversationText}

Summarize what we learned about this project in a clear, bulleted format covering:
- What it does
- Who it's for
- What problem it solves
- Key constraints or considerations
- What success looks like`,
        },
      ],
      maxTokens: 500,
      temperature: 0.5,
    })

    return {
      success: true,
      content: result.text.trim(),
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return {
      success: false,
      error: `Failed to generate summary: ${message}`,
    }
  }
}

/**
 * Extract structured project data from conversation
 */
export async function extractProjectData(
  context: ConversationContext,
  config: LachesisConfig,
): Promise<{ success: boolean; data?: ExtractedProjectData; error?: string }> {
  const provider = getOpenAIProvider(config)

  if (!provider) {
    return {
      success: false,
      error: 'AI not configured',
    }
  }

  try {
    const conversationText = context.messages
      .map((m) => `${m.role === 'assistant' ? 'Q' : 'A'}: ${m.content}`)
      .join('\n\n')

    const result = await generateObject({
      model: provider(config.defaultModel),
      schema: ExtractedProjectDataSchema,
      prompt: `Extract structured project information from this interview.

Project name: ${context.projectName}
One-liner: ${context.oneLiner}

Interview transcript:
${conversationText}

Extract all relevant information. For fields not discussed, use reasonable defaults or leave optional fields empty. Be direct and factual.`,
      temperature: 0.3,
    })

    return {
      success: true,
      data: result.object,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return {
      success: false,
      error: `Failed to extract data: ${message}`,
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
  // Simple heuristic based on depth and covered topics
  const topicsNeeded = getTopicsForDepth(context.depth)
  const covered = new Set(context.coveredTopics)

  // Check if we've covered enough topics
  const uncovered = topicsNeeded.filter((t) => !covered.has(t))

  if (uncovered.length === 0) {
    return { continue: false, reason: 'All topics covered' }
  }

  // Also check message count as a safety limit
  const lower = context.depth.toLowerCase()
  const maxMessages =
    lower.includes('deep') || lower.includes('heavy')
      ? 20
      : lower.includes('medium')
        ? 14
        : lower.includes('short') || lower.includes('light') || lower === 'quick'
          ? 8
          : 12
  if (context.messages.length >= maxMessages) {
    return { continue: false, reason: 'Reached conversation limit' }
  }

  return { continue: true }
}

/**
 * Get topics that should be covered based on depth
 */
function getTopicsForDepth(depth: InterviewDepth): string[] {
  const core = ['core_purpose', 'target_users', 'problem_solved']
  const extended = [...core, 'constraints', 'success_criteria']
  const full = [...extended, 'anti_goals', 'first_move', 'tech_considerations']

  const lower = depth.toLowerCase()
  if (lower.includes('short') || lower.includes('light') || lower === 'quick') {
    return core
  }
  if (lower.includes('deep') || lower.includes('heavy')) {
    return full
  }
  return extended
}

// Export schema for use elsewhere
export { ExtractedProjectDataSchema }
