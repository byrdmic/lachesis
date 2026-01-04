// AI Client - orchestration functions for AI operations
// Adapted for Obsidian plugin with multi-provider support

import { z } from 'zod'
import type { PlanningLevel } from '../core/project/types'
import type { AIProvider, ConversationMessage } from './providers/types'

// ============================================================================
// Re-export types from provider
// ============================================================================

export type { ConversationMessage } from './providers/types'

// ============================================================================
// Types
// ============================================================================

export type AIConnectionResult = {
  connected: boolean
  error?: string
}

export type GenerationResult = {
  success: boolean
  content?: string
  error?: string
  debugDetails?: string
}

export type ConversationContext = {
  planningLevel: PlanningLevel
  projectName: string
  oneLiner: string
  messages: ConversationMessage[]
  coveredTopics: string[]
}

// Schema for extracted project data
const ExtractedProjectDataSchema = z.object({
  vision: z.object({
    oneLinePitch: z.string().describe('Single sentence describing what this does'),
    description: z.string().describe('2-3 sentence expanded description'),
    primaryAudience: z.string().describe('Primary user/audience'),
    secondaryAudience: z.string().optional().describe('Secondary audience if mentioned'),
    problemSolved: z.string().describe('The specific problem or pain point this addresses'),
    successCriteria: z.string().describe('How they will know if this succeeded'),
  }),
  constraints: z.object({
    known: z.array(z.string()).describe('Known constraints mentioned (time, budget, tech, etc)'),
    assumptions: z.array(z.string()).describe('Assumptions being made'),
    risks: z.array(z.string()).describe('Potential risks identified'),
    antiGoals: z.array(z.string()).describe('Things this should NOT become'),
  }),
  execution: z.object({
    suggestedFirstMove: z.string().optional().describe('Suggested first step if discussed'),
    techStack: z.string().optional().describe('Technology preferences if mentioned'),
  }),
  config: z
    .object({
      githubRepo: z
        .string()
        .optional()
        .describe('GitHub repository URL if mentioned (e.g., github.com/user/repo)'),
    })
    .optional(),
})

export type ExtractedProjectData = z.infer<typeof ExtractedProjectDataSchema>

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
  name: z.string().describe('The actual project name extracted from the user input'),
})

// Topics for conversation continuation check
const DEFAULT_DISCOVERY_TOPICS = [
  'elevator_pitch',
  'problem_statement',
  'target_users',
  'value_proposition',
  'scope_and_antigoals',
  'constraints',
] as const

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Test AI connection
 */
export async function testAIConnection(provider: AIProvider): Promise<AIConnectionResult> {
  return provider.testConnection()
}

/**
 * Stream the next planning question
 */
export async function streamNextQuestion(
  context: ConversationContext,
  systemPrompt: string,
  provider: AIProvider,
  onUpdate?: (partial: string) => void,
): Promise<GenerationResult> {
  const result = await provider.streamText(
    systemPrompt,
    context.messages,
    onUpdate,
  )

  return result
}

/**
 * Generate a summary of the conversation so far
 */
export async function generateSummary(
  context: ConversationContext,
  provider: AIProvider,
): Promise<GenerationResult> {
  const conversationText = context.messages
    .map((m) => `${m.role === 'assistant' ? 'Q' : 'A'}: ${m.content}`)
    .join('\n\n')

  const systemPrompt = `You are Lachesis. Polished, calm, impeccably formal British butler. Address the user as "sir" (or equivalent) every turn. Deliver crisp confirmations. Stay HUD-aware of systems, environment, diagnostics, and data streams. Humor is dry, subtle, observational. One clear idea per line; short, efficient, call-and-response cadence. Remain supportive, unflappable, quietly devoted.`

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

Keep bullets crisp and address the reader as "sir".`

  return provider.generateText(systemPrompt, userPrompt)
}

/**
 * Extract structured project data from conversation
 */
export async function extractProjectData(
  context: ConversationContext,
  provider: AIProvider,
): Promise<{
  success: boolean
  data?: ExtractedProjectData
  error?: string
  debugDetails?: string
}> {
  const conversationText = context.messages
    .map((m) => `${m.role === 'assistant' ? 'Q' : 'A'}: ${m.content}`)
    .join('\n\n')

  const prompt = `Extract structured project information from this planning conversation.

Project name: ${context.projectName}
One-liner: ${context.oneLiner}

Conversation transcript:
${conversationText}

Extract all relevant information. For fields not discussed, use reasonable defaults or leave optional fields empty. Be direct and factual.`

  return provider.generateStructuredOutput(prompt, ExtractedProjectDataSchema)
}

/**
 * Check if conversation should continue or wrap up
 */
export function shouldContinueConversation(
  context: ConversationContext,
): { continue: boolean; reason?: string } {
  const topicsNeeded = Array.from(DEFAULT_DISCOVERY_TOPICS)
  const covered = new Set(context.coveredTopics)

  const uncovered = topicsNeeded.filter((t) => !covered.has(t))

  if (uncovered.length === 0) {
    return { continue: false, reason: 'All topics covered' }
  }

  const maxMessages = 12
  if (context.messages.length >= maxMessages) {
    return { continue: false, reason: 'Reached conversation limit' }
  }

  return { continue: true }
}

/**
 * Extract the actual project name from conversational user input
 */
export async function extractProjectName(
  userInput: string,
  provider: AIProvider,
): Promise<{
  success: boolean
  name?: string
  error?: string
  debugDetails?: string
}> {
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

  const result = await provider.generateStructuredOutput(prompt, ExtractedProjectNameSchema)

  if (result.success && result.data) {
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
  provider: AIProvider,
): Promise<{
  success: boolean
  suggestions?: ProjectNameSuggestion[]
  error?: string
  debugDetails?: string
}> {
  const conversationText = context.messages
    .map((m) => `${m.role === 'assistant' ? 'Q' : 'A'}: ${m.content}`)
    .join('\n\n')

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

  const result = await provider.generateStructuredOutput(prompt, ProjectNameSuggestionsSchema)

  if (result.success && result.data) {
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

// Export schemas for use elsewhere
export { ExtractedProjectDataSchema }
