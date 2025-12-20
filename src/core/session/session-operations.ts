// Session operations - core business logic extracted from ConversationPhase
// These functions perform the actual AI operations and state updates

import type { LachesisConfig } from '../../config/types.ts'
import type { ConversationMessage, ExtractedProjectData } from '../../ai/client.ts'
import {
  streamNextQuestion as aiStreamNextQuestion,
  streamAgenticConversation,
  extractProjectData as aiExtractProjectData,
  generateProjectNameSuggestions as aiGenerateProjectNameSuggestions,
  extractProjectName as aiExtractProjectName,
} from '../../ai/client.ts'
import { buildSystemPrompt } from '../../ai/prompts.ts'
import { scaffoldProject } from '../../fs/scaffolder.ts'
import { createFolderName } from '../project/types.ts'
import { debugLog } from '../../debug/logger.ts'
import type {
  SessionId,
  SessionState,
  SessionStep,
  SessionEvent,
  SessionEventCallback,
  ProjectNameSuggestion,
} from './types.ts'
import { getSession, updateSession, emitEvent } from './session-store.ts'

// ============================================================================
// Types
// ============================================================================

export type OperationResult<T = void> = {
  success: boolean
  data?: T
  error?: string
  debugDetails?: string
}

export type StreamQuestionOptions = {
  sessionId: SessionId
  config: LachesisConfig
  onStreamUpdate?: (partial: string) => void
  onEvent?: SessionEventCallback
}

export type AgenticOptions = {
  sessionId: SessionId
  config: LachesisConfig
  projectPath: string
  onStreamUpdate?: (partial: string) => void
  onToolCall?: (toolName: string, args: unknown) => void
  onToolResult?: (toolName: string, result: unknown) => void
  onEvent?: SessionEventCallback
}

// ============================================================================
// Constants
// ============================================================================

// Phrase that signals the AI is ready to transition to naming phase
const TRANSITION_PHRASE = 'very well, sir. let us proceed'

// ============================================================================
// Topic Detection
// ============================================================================

/**
 * Topic detection from question text.
 * Topics map to Overview.md template sections.
 */
export function detectTopics(
  questionText: string,
  existingTopics: string[],
): string[] {
  const topicKeywords: Record<string, string[]> = {
    elevator_pitch: ['what are you building', 'what is this', 'describe', 'one sentence', 'elevator'],
    problem_statement: ['problem', 'pain', 'hurts', 'solve', 'why build', 'consequence'],
    target_users: ['who will', 'who is', 'target', 'audience', 'users', 'customer', 'context'],
    value_proposition: ['benefit', 'value', 'alternative', 'different', 'why this'],
    scope_and_antigoals: ['scope', 'in scope', 'out of scope', 'anti-goal', 'avoid', "shouldn't", 'not become'],
    constraints: ['constraint', 'limitation', 'budget', 'time', 'deadline', 'tech stack', 'money'],
  }

  const lowerQuestion = questionText.toLowerCase()
  const newTopics = new Set(existingTopics)

  for (const [topic, keywords] of Object.entries(topicKeywords)) {
    if (keywords.some((kw) => lowerQuestion.includes(kw))) {
      newTopics.add(topic)
    }
  }

  return Array.from(newTopics)
}

/**
 * Check if AI response contains the transition phrase
 */
export function checkForTransitionPhrase(responseText: string): boolean {
  return responseText.toLowerCase().includes(TRANSITION_PHRASE)
}

// ============================================================================
// Session State Helpers
// ============================================================================

function transitionTo(
  sessionId: SessionId,
  newStep: SessionStep,
  additionalUpdates: Partial<SessionState> = {},
  onEvent?: SessionEventCallback,
): SessionState | null {
  const session = getSession(sessionId)
  if (!session) return null

  const previousStep = session.step
  const updated = updateSession(sessionId, {
    step: newStep,
    ...additionalUpdates,
  })

  if (updated) {
    const event: SessionEvent = {
      type: 'step_changed',
      step: newStep,
      previousStep,
    }
    emitEvent(event)
    onEvent?.(event)
  }

  return updated
}

function addMessage(
  sessionId: SessionId,
  message: ConversationMessage,
  onEvent?: SessionEventCallback,
): SessionState | null {
  const session = getSession(sessionId)
  if (!session) return null

  const updated = updateSession(sessionId, {
    messages: [...session.messages, message],
  })

  if (updated) {
    const event: SessionEvent = { type: 'message_added', message }
    emitEvent(event)
    onEvent?.(event)
  }

  return updated
}

function setError(
  sessionId: SessionId,
  error: string,
  debugDetails?: string,
  onEvent?: SessionEventCallback,
): SessionState | null {
  const session = getSession(sessionId)
  if (!session) return null

  const updated = transitionTo(sessionId, 'error', { error, errorDetails: debugDetails }, onEvent)

  if (updated) {
    const event: SessionEvent = { type: 'error', error, details: debugDetails }
    emitEvent(event)
    onEvent?.(event)
  }

  return updated
}

// ============================================================================
// Core Operations
// ============================================================================

/**
 * Stream the next question from the AI.
 * This is the main conversation driver for new projects.
 */
export async function streamQuestion(
  options: StreamQuestionOptions,
): Promise<OperationResult<string>> {
  const { sessionId, config, onStreamUpdate, onEvent } = options
  const session = getSession(sessionId)

  if (!session) {
    return { success: false, error: `Session not found: ${sessionId}` }
  }

  debugLog.info('Session: streaming next question', {
    sessionId,
    messageCount: session.messages.length,
    coveredTopics: session.coveredTopics,
  })

  // Transition to generating state
  transitionTo(sessionId, 'generating_question', {}, onEvent)

  // Build context
  const effectiveProjectName = session.projectName?.trim() || 'Untitled Project'
  const effectiveOneLiner = session.oneLiner?.trim() || 'Not provided yet'
  const isFirstMessage = session.messages.length === 0

  const prompt = buildSystemPrompt({
    sessionType: session.type === 'new_project' ? 'new' : 'existing',
    projectName: effectiveProjectName,
    oneLiner: effectiveOneLiner,
    planningLevel: session.planningLevel ?? 'medium',
    coveredTopics: session.coveredTopics,
    currentHour: new Date().getHours(),
    isFirstMessage,
  })

  const context = {
    planningLevel: session.planningLevel ?? 'medium',
    projectName: effectiveProjectName,
    oneLiner: effectiveOneLiner,
    messages: session.messages,
    coveredTopics: session.coveredTopics,
  }

  // Stream ID for tracking the message
  const streamId = `${new Date().toISOString()}-${Math.random().toString(36).slice(2, 8)}`
  let streamedContent = ''

  const result = await aiStreamNextQuestion(context, prompt, config, (partial) => {
    streamedContent = partial

    // Emit streaming event
    const streamEvent: SessionEvent = { type: 'ai_streaming', partial }
    emitEvent(streamEvent)
    onEvent?.(streamEvent)
    onStreamUpdate?.(partial)
  })

  if (result.success && result.content !== undefined) {
    debugLog.info('Session: question streamed successfully', {
      sessionId,
      contentLength: result.content.length,
    })

    // Add assistant message
    const assistantMessage: ConversationMessage = {
      role: 'assistant',
      content: result.content,
      timestamp: streamId,
    }
    addMessage(sessionId, assistantMessage, onEvent)

    // Emit completion event
    const completeEvent: SessionEvent = { type: 'ai_complete', content: result.content }
    emitEvent(completeEvent)
    onEvent?.(completeEvent)

    // Check for transition phrase
    if (checkForTransitionPhrase(result.content)) {
      debugLog.info('Session: transition phrase detected')
      // Don't transition here - let the caller handle it
    } else {
      // Detect and update topics
      const newTopics = detectTopics(result.content, session.coveredTopics)
      if (newTopics.length > session.coveredTopics.length) {
        updateSession(sessionId, { coveredTopics: newTopics })
        const topicsEvent: SessionEvent = { type: 'topics_updated', topics: newTopics }
        emitEvent(topicsEvent)
        onEvent?.(topicsEvent)
      }
    }

    // Transition to waiting for answer
    transitionTo(sessionId, 'waiting_for_answer', {}, onEvent)

    return { success: true, data: result.content }
  } else {
    debugLog.error('Session: failed to stream question', {
      sessionId,
      error: result.error,
    })
    setError(sessionId, result.error || 'Failed to generate question', result.debugDetails, onEvent)
    return { success: false, error: result.error, debugDetails: result.debugDetails }
  }
}

/**
 * Stream an agentic conversation response (for existing projects with tools).
 */
export async function streamAgenticResponse(
  options: AgenticOptions,
): Promise<OperationResult<string>> {
  const { sessionId, config, projectPath, onStreamUpdate, onToolCall, onToolResult, onEvent } = options
  const session = getSession(sessionId)

  if (!session) {
    return { success: false, error: `Session not found: ${sessionId}` }
  }

  debugLog.info('Session: streaming agentic response', {
    sessionId,
    projectPath,
    messageCount: session.messages.length,
  })

  // Transition to generating state
  transitionTo(sessionId, 'generating_question', {}, onEvent)

  const effectiveProjectName = session.projectName?.trim() || 'Untitled Project'
  const isFirstMessage = session.messages.length === 0

  const qaPrompt = buildSystemPrompt({
    sessionType: 'existing',
    projectName: effectiveProjectName,
    snapshotSummary: session.projectSnapshot ?? '',
    toolsAvailable: ['Read', 'Write', 'Edit', 'Glob', 'Grep'],
    currentHour: new Date().getHours(),
    isFirstMessage,
  })

  const streamId = `${new Date().toISOString()}-${Math.random().toString(36).slice(2, 8)}`

  const result = await streamAgenticConversation(config, {
    systemPrompt: qaPrompt,
    messages: session.messages,
    projectPath,
    maxToolCalls: 10,
    onToolCall: (toolName, args) => {
      debugLog.info('Session: agentic tool called', { toolName, args })
      onToolCall?.(toolName, args)
    },
    onToolResult: (toolName, resultData) => {
      debugLog.info('Session: agentic tool result', { toolName })
      onToolResult?.(toolName, resultData)
    },
    onTextUpdate: (partial) => {
      const streamEvent: SessionEvent = { type: 'ai_streaming', partial }
      emitEvent(streamEvent)
      onEvent?.(streamEvent)
      onStreamUpdate?.(partial)
    },
  })

  if (result.success && result.response) {
    debugLog.info('Session: agentic response complete', {
      sessionId,
      responseLength: result.response.length,
      toolCallCount: result.toolCalls?.length ?? 0,
    })

    // Add assistant message
    const assistantMessage: ConversationMessage = {
      role: 'assistant',
      content: result.response,
      timestamp: streamId,
    }
    addMessage(sessionId, assistantMessage, onEvent)

    // Emit completion event
    const completeEvent: SessionEvent = { type: 'ai_complete', content: result.response }
    emitEvent(completeEvent)
    onEvent?.(completeEvent)

    // Check for transition phrase
    if (checkForTransitionPhrase(result.response)) {
      debugLog.info('Session: transition phrase detected in agentic response')
    }

    // Transition to waiting for answer
    transitionTo(sessionId, 'waiting_for_answer', {}, onEvent)

    return { success: true, data: result.response }
  } else {
    debugLog.error('Session: agentic response failed', {
      sessionId,
      error: result.error,
    })
    setError(sessionId, result.error || 'Failed to generate response', result.debugDetails, onEvent)
    return { success: false, error: result.error, debugDetails: result.debugDetails }
  }
}

/**
 * Process a user message and generate the next AI response.
 */
export async function processUserMessage(
  sessionId: SessionId,
  message: string,
  config: LachesisConfig,
  options: {
    onStreamUpdate?: (partial: string) => void
    onEvent?: SessionEventCallback
    agenticEnabled?: boolean
    projectPath?: string
    onToolCall?: (toolName: string, args: unknown) => void
    onToolResult?: (toolName: string, result: unknown) => void
  } = {},
): Promise<OperationResult<string>> {
  const session = getSession(sessionId)
  if (!session) {
    return { success: false, error: `Session not found: ${sessionId}` }
  }

  debugLog.info('Session: processing user message', {
    sessionId,
    messageLength: message.length,
  })

  // Add user message
  const userMessage: ConversationMessage = {
    role: 'user',
    content: message,
    timestamp: new Date().toISOString(),
  }
  addMessage(sessionId, userMessage, options.onEvent)

  // Generate next response
  if (options.agenticEnabled && options.projectPath) {
    return streamAgenticResponse({
      sessionId,
      config,
      projectPath: options.projectPath,
      onStreamUpdate: options.onStreamUpdate,
      onToolCall: options.onToolCall,
      onToolResult: options.onToolResult,
      onEvent: options.onEvent,
    })
  } else {
    return streamQuestion({
      sessionId,
      config,
      onStreamUpdate: options.onStreamUpdate,
      onEvent: options.onEvent,
    })
  }
}

/**
 * Generate project name suggestions.
 */
export async function generateNameSuggestions(
  sessionId: SessionId,
  config: LachesisConfig,
  onEvent?: SessionEventCallback,
): Promise<OperationResult<ProjectNameSuggestion[]>> {
  const session = getSession(sessionId)
  if (!session) {
    return { success: false, error: `Session not found: ${sessionId}` }
  }

  debugLog.info('Session: generating name suggestions', { sessionId })

  // Transition to generating names
  transitionTo(sessionId, 'generating_names', {}, onEvent)

  const effectiveProjectName = session.projectName?.trim() || 'Untitled Project'
  const effectiveOneLiner = session.oneLiner?.trim() || 'Not provided yet'

  const context = {
    planningLevel: session.planningLevel ?? 'medium',
    projectName: effectiveProjectName,
    oneLiner: effectiveOneLiner,
    messages: session.messages,
    coveredTopics: session.coveredTopics,
  }

  const result = await aiGenerateProjectNameSuggestions(context, config)

  if (result.success && result.suggestions && result.suggestions.length > 0) {
    debugLog.info('Session: name suggestions generated', {
      sessionId,
      count: result.suggestions.length,
    })

    // Update session with suggestions
    updateSession(sessionId, { nameSuggestions: result.suggestions })

    // Emit event
    const event: SessionEvent = { type: 'names_generated', suggestions: result.suggestions }
    emitEvent(event)
    onEvent?.(event)

    // Transition to naming
    transitionTo(sessionId, 'naming_project', {}, onEvent)

    return { success: true, data: result.suggestions }
  } else {
    debugLog.warn('Session: name generation failed', {
      sessionId,
      error: result.error,
    })
    // Don't set error state - just return failure so caller can use default name
    return { success: false, error: result.error }
  }
}

/**
 * Select (or extract from custom input) a project name.
 */
export async function selectProjectName(
  sessionId: SessionId,
  name: string,
  isCustomInput: boolean,
  config: LachesisConfig,
  onEvent?: SessionEventCallback,
): Promise<OperationResult<string>> {
  const session = getSession(sessionId)
  if (!session) {
    return { success: false, error: `Session not found: ${sessionId}` }
  }

  debugLog.info('Session: selecting project name', {
    sessionId,
    name,
    isCustomInput,
  })

  let finalName = name

  // For custom input, use AI to extract the actual project name
  if (isCustomInput) {
    const result = await aiExtractProjectName(name, config)
    if (result.success && result.name) {
      finalName = result.name
      debugLog.info('Session: extracted project name from custom input', {
        original: name,
        extracted: finalName,
      })
    } else {
      debugLog.warn('Session: failed to extract name, using raw input', {
        original: name,
        error: result.error,
      })
    }
  }

  // Add user's selection as a message
  const userSelectionMessage: ConversationMessage = {
    role: 'user',
    content: name, // Keep original input in the log
    timestamp: new Date().toISOString(),
  }
  addMessage(sessionId, userSelectionMessage, onEvent)

  // Update session with selected name
  updateSession(sessionId, { selectedName: finalName })

  // Emit event
  const event: SessionEvent = { type: 'name_selected', name: finalName }
  emitEvent(event)
  onEvent?.(event)

  return { success: true, data: finalName }
}

/**
 * Extract structured project data from the conversation.
 */
export async function extractProjectDataFromSession(
  sessionId: SessionId,
  config: LachesisConfig,
  onEvent?: SessionEventCallback,
): Promise<OperationResult<ExtractedProjectData>> {
  const session = getSession(sessionId)
  if (!session) {
    return { success: false, error: `Session not found: ${sessionId}` }
  }

  debugLog.info('Session: extracting project data', { sessionId })

  // Transition to extracting
  transitionTo(sessionId, 'extracting_data', {}, onEvent)

  const effectiveProjectName = session.selectedName || session.projectName?.trim() || 'Untitled Project'
  const effectiveOneLiner = session.oneLiner?.trim() || 'Not provided yet'

  const context = {
    planningLevel: session.planningLevel ?? 'medium',
    projectName: effectiveProjectName,
    oneLiner: effectiveOneLiner,
    messages: session.messages,
    coveredTopics: session.coveredTopics,
  }

  const result = await aiExtractProjectData(context, config)

  if (result.success && result.data) {
    debugLog.info('Session: project data extracted', {
      sessionId,
      hasVision: !!result.data.vision,
      hasConstraints: !!result.data.constraints,
    })

    // Update session
    updateSession(sessionId, { extractedData: result.data })

    // Emit event
    const event: SessionEvent = { type: 'extraction_complete', data: result.data }
    emitEvent(event)
    onEvent?.(event)

    // Transition to ready for scaffolding
    transitionTo(sessionId, 'ready_to_scaffold', {}, onEvent)

    return { success: true, data: result.data }
  } else {
    debugLog.warn('Session: extraction failed, using fallback', {
      sessionId,
      error: result.error,
    })

    // Create minimal fallback data
    const fallbackData: ExtractedProjectData = {
      vision: {
        oneLinePitch: effectiveOneLiner,
        description: effectiveOneLiner,
        primaryAudience: 'To be defined',
        problemSolved: 'To be defined',
        successCriteria: 'To be defined',
      },
      constraints: {
        known: [],
        assumptions: [],
        risks: [],
        antiGoals: [],
      },
      execution: {},
    }

    updateSession(sessionId, { extractedData: fallbackData })
    transitionTo(sessionId, 'ready_to_scaffold', {}, onEvent)

    return { success: true, data: fallbackData }
  }
}

/**
 * Scaffold the project files.
 */
export async function scaffoldSessionProject(
  sessionId: SessionId,
  vaultPath: string,
  onEvent?: SessionEventCallback,
): Promise<OperationResult<string>> {
  const session = getSession(sessionId)
  if (!session) {
    return { success: false, error: `Session not found: ${sessionId}` }
  }

  if (!session.extractedData) {
    return { success: false, error: 'No extracted data available. Run extraction first.' }
  }

  if (!session.selectedName) {
    return { success: false, error: 'No project name selected.' }
  }

  debugLog.info('Session: scaffolding project', {
    sessionId,
    projectName: session.selectedName,
    vaultPath,
  })

  // Transition to scaffolding
  transitionTo(sessionId, 'scaffolding', {}, onEvent)

  try {
    const projectSlug = createFolderName(session.selectedName)

    const result = await scaffoldProject(vaultPath, projectSlug, {
      projectName: session.selectedName,
      projectSlug,
      oneLiner: session.oneLiner,
      extracted: session.extractedData,
    })

    if (!result.success) {
      debugLog.error('Session: scaffolding failed', {
        sessionId,
        error: result.error,
      })
      setError(sessionId, result.error, undefined, onEvent)
      return { success: false, error: result.error }
    }

    debugLog.info('Session: project scaffolded', {
      sessionId,
      projectPath: result.projectPath,
    })

    // Update session
    updateSession(sessionId, { scaffoldedPath: result.projectPath })

    // Emit event
    const event: SessionEvent = { type: 'scaffold_complete', projectPath: result.projectPath }
    emitEvent(event)
    onEvent?.(event)

    // Transition to complete
    transitionTo(sessionId, 'complete', {}, onEvent)

    return { success: true, data: result.projectPath }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown scaffolding error'
    debugLog.error('Session: scaffolding failed', {
      sessionId,
      error: errorMessage,
    })
    setError(sessionId, errorMessage, undefined, onEvent)
    return { success: false, error: errorMessage }
  }
}

/**
 * Complete the full finalization flow: select name → extract data → scaffold.
 */
export async function finalizeSession(
  sessionId: SessionId,
  name: string,
  isCustomInput: boolean,
  config: LachesisConfig,
  vaultPath: string,
  onEvent?: SessionEventCallback,
): Promise<OperationResult<{ projectPath: string; extractedData: ExtractedProjectData }>> {
  // Select name
  const nameResult = await selectProjectName(sessionId, name, isCustomInput, config, onEvent)
  if (!nameResult.success) {
    return { success: false, error: nameResult.error }
  }

  // Extract data
  const extractResult = await extractProjectDataFromSession(sessionId, config, onEvent)
  if (!extractResult.success || !extractResult.data) {
    return { success: false, error: extractResult.error || 'Extraction failed' }
  }

  // Scaffold
  const scaffoldResult = await scaffoldSessionProject(sessionId, vaultPath, onEvent)
  if (!scaffoldResult.success || !scaffoldResult.data) {
    return { success: false, error: scaffoldResult.error || 'Scaffolding failed' }
  }

  return {
    success: true,
    data: {
      projectPath: scaffoldResult.data,
      extractedData: extractResult.data,
    },
  }
}
