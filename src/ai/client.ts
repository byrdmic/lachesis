import { z } from 'zod'
import type { LachesisConfig } from '../config/types.ts'
import type { PlanningLevel } from '../core/project/types.ts'
import { debugLog } from '../debug/logger.ts'
import { getProvider } from './providers/factory.ts'
import type {
  ConversationMessage as ProviderMessage,
  AgenticOptions as ProviderAgenticOptions,
} from './providers/types.ts'

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

/**
 * Test AI connection
 */
export async function testAIConnection(
  config: LachesisConfig,
): Promise<AIConnectionResult> {
  const provider = await getProvider(config)
  return provider.testConnection(config)
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
  debugLog.info('Streaming next question: sending request', {
    provider: config.defaultProvider,
    model: config.defaultModel,
    systemPromptPreview: systemPrompt.slice(0, 200),
    messageCount: context.messages.length,
    coveredTopics: context.coveredTopics,
    lastMessage: context.messages.at(-1),
  })

  const provider = await getProvider(config)
  const result = await provider.streamText(
    systemPrompt,
    context.messages as ProviderMessage[],
    config,
    onUpdate,
  )

  if (result.success) {
    debugLog.info('Streaming next question: completed', {
      provider: config.defaultProvider,
      model: config.defaultModel,
      contentPreview: result.content?.slice(0, 200),
      totalLength: result.content?.length ?? 0,
    })
  }

  return result
}

/**
 * Generate a summary of the conversation so far
 */
export async function generateSummary(
  context: ConversationContext,
  config: LachesisConfig,
): Promise<GenerationResult> {
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

  const systemPrompt = `You are Lachesis. Polished, calm, impeccably formal British butler. Address the user as "sir" (or equivalent) every turn. Deliver crisp confirmations ("At your service, sir.", "As you wish.", "Right away, sir."). Stay HUD-aware of systems, environment, diagnostics, and data streams; offer polite safety/status notes when relevant (power, structural integrity, environmental conditions, system load). Humor is dry, subtle, observational—gentle corrections only; never goofy. One clear idea per line; short, efficient, call-and-response cadence. Remain supportive, unflappable, quietly devoted, even in emergencies. Avoid words like "transform", "journey", or "crystallize".`

  const userPrompt = `Project: ${context.projectName}
One-liner: ${context.oneLiner}

Conversation transcript:
${conversationText}

Summarize what we learned in a clear, bulleted format covering:
- What it does
- Who it's for
- What problem it solves
- Key constraints or considerations
- What success looks like

Keep bullets crisp and Jarvis-voiced; HUD/status flavor is welcome where it helps. Address the reader as "sir".`

  const provider = await getProvider(config)
  const result = await provider.generateText(systemPrompt, userPrompt, config)

  if (result.success) {
    debugLog.info('Generating summary: received response', {
      provider: config.defaultProvider,
      model: config.defaultModel,
      contentPreview: result.content?.slice(0, 200),
      totalLength: result.content?.length ?? 0,
    })
  }

  return result
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

  const prompt = `Extract structured project information from this planning conversation.

Project name: ${context.projectName}
One-liner: ${context.oneLiner}

Conversation transcript:
${conversationText}

Extract all relevant information. For fields not discussed, use reasonable defaults or leave optional fields empty. Be direct and factual.`

  const provider = await getProvider(config)
  const result = await provider.generateStructuredOutput(
    prompt,
    ExtractedProjectDataSchema,
    config,
  )

  if (result.success && result.data) {
    debugLog.info('Extracting project data: received response', {
      provider: config.defaultProvider,
      model: config.defaultModel,
      fields: Object.keys(result.data),
    })
  }

  return result
}

/**
 * Check if conversation should continue or wrap up
 */
export async function shouldContinueConversation(
  context: ConversationContext,
  _config: LachesisConfig,
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
 * Topics to cover during the planning conversation.
 * These map to Overview.md template sections.
 */
const DEFAULT_DISCOVERY_TOPICS = [
  'elevator_pitch', // What are you building, for whom, why?
  'problem_statement', // What hurts, why, consequence?
  'target_users', // Who, context, non-users?
  'value_proposition', // Benefit, differentiator?
  'scope_and_antigoals', // In-scope, out-of-scope?
  'constraints', // Time, tech, money, operational?
] as const

// Export schema for use elsewhere
export { ExtractedProjectDataSchema }

// Schema for project name suggestions
const ProjectNameSuggestionsSchema = z.object({
  suggestions: z
    .array(
      z.object({
        name: z.string().describe('Project name (2-4 words, catchy and memorable)'),
        reasoning: z.string().describe('Brief explanation of why this name fits'),
      }),
    )
    .min(3)
    .max(5)
    .describe('3-5 creative project name suggestions'),
})

export type ProjectNameSuggestion = {
  name: string
  reasoning: string
}

// Schema for extracting the actual project name from conversational input
const ExtractedProjectNameSchema = z.object({
  name: z
    .string()
    .describe(
      'The actual project name extracted from the user input (e.g., "Kerbal Capcom" from "let\'s go with Kerbal Capcom")',
    ),
})

/**
 * Extract the actual project name from conversational user input.
 * e.g., "let's go with Kerbal Capcom" → "Kerbal Capcom"
 */
export async function extractProjectName(
  userInput: string,
  config: LachesisConfig,
): Promise<{
  success: boolean
  name?: string
  error?: string
  debugDetails?: string
}> {
  debugLog.info('Extracting project name: sending request', {
    provider: config.defaultProvider,
    model: config.defaultModel,
    userInput,
  })

  const prompt = `The user was asked to provide a project name and responded with:
"${userInput}"

Extract ONLY the actual project name from this response. Remove any conversational phrasing like:
- "let's go with..."
- "I'll call it..."
- "how about..."
- "I think..."
- "maybe..."

Just return the clean project name. If the entire input IS the project name (no conversational fluff), return it as-is.

Examples:
- "let's go with Kerbal Capcom" → "Kerbal Capcom"
- "I'll call it Project Nova" → "Project Nova"
- "SkyNet" → "SkyNet"
- "how about 'The Hive'?" → "The Hive"`

  const provider = await getProvider(config)
  const result = await provider.generateStructuredOutput(
    prompt,
    ExtractedProjectNameSchema,
    config,
  )

  if (result.success && result.data) {
    debugLog.info('Extracting project name: received response', {
      provider: config.defaultProvider,
      model: config.defaultModel,
      extractedName: result.data.name,
    })

    return {
      success: true,
      name: result.data.name,
    }
  }

  return {
    success: false,
    error: result.error,
    debugDetails: result.debugDetails,
  }
}

/**
 * Generate creative project name suggestions based on the conversation
 */
export async function generateProjectNameSuggestions(
  context: ConversationContext,
  config: LachesisConfig,
): Promise<{
  success: boolean
  suggestions?: ProjectNameSuggestion[]
  error?: string
  debugDetails?: string
}> {
  const conversationText = context.messages
    .map((m) => `${m.role === 'assistant' ? 'Q' : 'A'}: ${m.content}`)
    .join('\n\n')

  debugLog.info('Generating project name suggestions: sending request', {
    provider: config.defaultProvider,
    model: config.defaultModel,
    messageCount: context.messages.length,
    projectName: context.projectName,
  })

  const prompt = `Based on this planning conversation, suggest 3-5 creative, memorable project names.

Current working name: ${context.projectName || 'Not yet named'}
One-liner: ${context.oneLiner || 'Not provided'}

Conversation transcript:
${conversationText}

Guidelines for names:
- Short and memorable (2-4 words max)
- Could be: descriptive, metaphorical, playful, or acronym-based
- Avoid generic names like "Project X" or "My App"
- Consider the project's purpose, audience, and vibe
- Mix styles: some serious, some creative, some punny if appropriate`

  const provider = await getProvider(config)
  const result = await provider.generateStructuredOutput(
    prompt,
    ProjectNameSuggestionsSchema,
    config,
  )

  if (result.success && result.data) {
    debugLog.info('Generating project name suggestions: received response', {
      provider: config.defaultProvider,
      model: config.defaultModel,
      suggestionCount: result.data.suggestions.length,
    })

    return {
      success: true,
      suggestions: result.data.suggestions,
    }
  }

  return {
    success: false,
    error: result.error,
    debugDetails: result.debugDetails,
  }
}

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
  _contextSerialized: string,
  systemPrompt: string,
  config: LachesisConfig,
): Promise<{
  success: boolean
  briefing?: AIBriefingResponse
  error?: string
  debugDetails?: string
}> {
  debugLog.info('Generating project briefing: sending request', {
    provider: config.defaultProvider,
    model: config.defaultModel,
  })

  const provider = await getProvider(config)
  const result = await provider.generateStructuredOutput(
    systemPrompt,
    AIBriefingResponseSchema,
    config,
  )

  if (result.success && result.data) {
    debugLog.info('Generating project briefing: received response', {
      provider: config.defaultProvider,
      model: config.defaultModel,
      hasGreeting: !!result.data.greeting,
      actionCount: result.data.suggestedActions.length,
    })

    return {
      success: true,
      briefing: result.data,
    }
  }

  return {
    success: false,
    error: result.error,
    debugDetails: result.debugDetails,
  }
}

export { AIBriefingResponseSchema }

// ============================================================================
// Agentic Conversation (Agent SDK with file tools)
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
 * Run an agentic conversation with file tool access.
 * The model can autonomously use Read, Write, Edit, Glob, and Grep tools.
 */
export async function runAgenticConversation(
  config: LachesisConfig,
  options: AgenticConversationOptions,
): Promise<AgenticResult> {
  const provider = await getProvider(config)
  return provider.runAgenticConversation(config, {
    systemPrompt: options.systemPrompt,
    messages: options.messages as ProviderMessage[],
    projectPath: options.projectPath,
    maxTurns: options.maxToolCalls,
    onToolCall: options.onToolCall,
    onToolResult: options.onToolResult,
  } as ProviderAgenticOptions)
}

/**
 * Stream an agentic conversation with file tool access.
 * Like runAgenticConversation but streams text incrementally.
 */
export async function streamAgenticConversation(
  config: LachesisConfig,
  options: StreamingAgenticOptions,
): Promise<AgenticResult> {
  const provider = await getProvider(config)
  return provider.runAgenticConversation(config, {
    systemPrompt: options.systemPrompt,
    messages: options.messages as ProviderMessage[],
    projectPath: options.projectPath,
    maxTurns: options.maxToolCalls,
    onToolCall: options.onToolCall,
    onToolResult: options.onToolResult,
    onTextUpdate: options.onTextUpdate,
  } as ProviderAgenticOptions)
}
