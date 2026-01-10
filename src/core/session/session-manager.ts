// Session Manager for Obsidian plugin
// Combines session management and AI operations

import type { Vault } from 'obsidian'
import type {
  SessionId,
  SessionState,
  SessionStep,
  SessionEvent,
  SessionEventCallback,
  CreateSessionOptions,
  ISessionManager,
  ProjectNameSuggestion,
} from './types'
import { createInitialSessionState } from './types'
import {
  getSession,
  saveSession,
  deleteSession as deleteSessionFromStore,
  listSessions as listSessionsFromStore,
  updateSession,
  subscribe as subscribeToStore,
  emitEvent,
} from './session-store'
import {
  streamNextQuestion as aiStreamNextQuestion,
  extractProjectData as aiExtractProjectData,
  generateProjectNameSuggestions as aiGenerateProjectNameSuggestions,
  extractProjectName as aiExtractProjectName,
  type ConversationMessage,
  type ExtractedProjectData,
} from '../../ai/client'
import { buildSystemPrompt } from '../../ai/prompts'
import { getProvider } from '../../ai/providers/factory'
import type { AIProvider } from '../../ai/providers/types'
import type { LachesisSettings } from '../../settings'
import { createFolderName } from '../project/types'
import { scaffoldProject, type ScaffoldProjectData } from '../../scaffolder/scaffolder'
import { fetchCommits, formatCommitLog } from '../../github'

// ============================================================================
// Constants
// ============================================================================

const TRANSITION_PHRASE = 'very well, sir. let us proceed'

// ============================================================================
// Topic Detection
// ============================================================================

function detectTopics(questionText: string, existingTopics: string[]): string[] {
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

function checkForTransitionPhrase(responseText: string): boolean {
  return responseText.toLowerCase().includes(TRANSITION_PHRASE)
}

/**
 * Detect GitHub repository URL in user message.
 * Matches common formats: https://github.com/user/repo, github.com/user/repo, user/repo
 */
function detectGitHubUrl(message: string): string | null {
  // Match full GitHub URLs
  const fullUrlPattern = /(?:https?:\/\/)?github\.com\/[\w-]+\/[\w.-]+/i
  const fullMatch = message.match(fullUrlPattern)
  if (fullMatch) return fullMatch[0]

  // Match shorthand format (user/repo) - must be 2 parts separated by /
  const shorthandPattern = /\b([\w-]+\/[\w.-]+)\b/
  const shortMatch = message.match(shorthandPattern)
  if (shortMatch) {
    const candidate = shortMatch[1]
    // Avoid matching file paths or other patterns - must look like a repo
    if (!candidate.includes('.') && !candidate.startsWith('/')) {
      return `github.com/${candidate}`
    }
  }

  return null
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

// ============================================================================
// Session Manager Factory
// ============================================================================

export interface SessionManagerConfig {
  settings: LachesisSettings
  vault: Vault
}

export function createSessionManager(config: SessionManagerConfig): ISessionManager {
  const provider: AIProvider = getProvider(config.settings)

  // ============================================================================
  // Session Lifecycle
  // ============================================================================

  async function createSession(options: CreateSessionOptions): Promise<SessionState> {
    const session = createInitialSessionState(options)
    saveSession(session)

    emitEvent({ type: 'session_created', sessionId: session.id })

    const updatedSession = updateSession(session.id, { step: 'generating_question' })
    if (updatedSession) {
      emitEvent({
        type: 'step_changed',
        step: 'generating_question',
        previousStep: 'idle',
      })
    }

    return updatedSession ?? session
  }

  function getSessionById(sessionId: SessionId): SessionState | null {
    return getSession(sessionId)
  }

  function listAllSessions(): SessionState[] {
    return listSessionsFromStore()
  }

  function removeSession(sessionId: SessionId): void {
    deleteSessionFromStore(sessionId)
  }

  // ============================================================================
  // Conversation Operations
  // ============================================================================

  async function sendMessage(
    sessionId: SessionId,
    message: string,
    onEvent?: SessionEventCallback,
  ): Promise<SessionState> {
    const session = getSession(sessionId)
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`)
    }

    // Add user message
    const userMessage: ConversationMessage = {
      role: 'user',
      content: message,
      timestamp: new Date().toISOString(),
    }

    addMessage(sessionId, userMessage, onEvent)

    // Detect and fetch GitHub context if URL mentioned
    const detectedUrl = detectGitHubUrl(message)
    if (detectedUrl && detectedUrl !== session.githubRepoUrl) {
      updateSession(sessionId, { githubRepoUrl: detectedUrl })
      // Fetch commits in background (non-blocking)
      fetchGitHubContext(sessionId, detectedUrl)
    }

    // Transition to generating question
    transitionTo(sessionId, 'generating_question', {}, onEvent)

    const updatedSession = getSession(sessionId)
    if (!updatedSession) {
      throw new Error(`Session lost during message processing: ${sessionId}`)
    }

    return updatedSession
  }

  /**
   * Fetch GitHub commits for a repository and update session state.
   * Runs in background without blocking the conversation.
   */
  async function fetchGitHubContext(sessionId: SessionId, repoUrl: string): Promise<void> {
    try {
      const result = await fetchCommits(repoUrl, {
        token: config.settings.githubToken || undefined,
        perPage: 10,
      })

      if (result.success && result.data.length > 0) {
        const formatted = formatCommitLog(result.data, { includeDate: true })
        updateSession(sessionId, { githubCommitLog: formatted })
      }
    } catch (err) {
      // Non-critical failure - log and continue
      console.warn('Failed to fetch GitHub commits:', err)
    }
  }

  async function streamNextQuestion(
    sessionId: SessionId,
    onUpdate: (partial: string) => void,
  ): Promise<SessionState> {
    const session = getSession(sessionId)
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`)
    }

    // Build context
    const effectiveProjectName = session.projectName?.trim() || 'Untitled Project'
    const effectiveOneLiner = session.oneLiner?.trim() || 'Not provided yet'
    const isFirstMessage = session.messages.length === 0

    const prompt = buildSystemPrompt({
      projectName: effectiveProjectName,
      oneLiner: effectiveOneLiner,
      planningLevel: session.planningLevel ?? 'medium',
      coveredTopics: session.coveredTopics,
      currentHour: new Date().getHours(),
      isFirstMessage,
      recentCommits: session.githubCommitLog,
    })

    const context = {
      planningLevel: session.planningLevel ?? 'medium',
      projectName: effectiveProjectName,
      oneLiner: effectiveOneLiner,
      messages: session.messages,
      coveredTopics: session.coveredTopics,
    }

    const result = await aiStreamNextQuestion(context, prompt, provider, (partial) => {
      emitEvent({ type: 'ai_streaming', partial })
      onUpdate(partial)
    })

    if (result.success && result.content) {
      // Add assistant message
      const assistantMessage: ConversationMessage = {
        role: 'assistant',
        content: result.content,
        timestamp: new Date().toISOString(),
      }
      addMessage(sessionId, assistantMessage)

      emitEvent({ type: 'ai_complete', content: result.content })

      // Check for transition phrase
      const shouldTransition = checkForTransitionPhrase(result.content)

      if (!shouldTransition) {
        // Detect and update topics
        const newTopics = detectTopics(result.content, session.coveredTopics)
        if (newTopics.length > session.coveredTopics.length) {
          updateSession(sessionId, { coveredTopics: newTopics })
          emitEvent({ type: 'topics_updated', topics: newTopics })
        }
      }

      transitionTo(sessionId, 'waiting_for_answer')
    } else {
      transitionTo(sessionId, 'error', {
        error: result.error || 'Failed to generate question',
        errorDetails: result.debugDetails,
      })
    }

    return getSession(sessionId)!
  }

  // ============================================================================
  // Phase Transitions
  // ============================================================================

  async function requestNameSuggestions(sessionId: SessionId): Promise<SessionState> {
    const session = getSession(sessionId)
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`)
    }

    transitionTo(sessionId, 'generating_names')

    const effectiveProjectName = session.projectName?.trim() || 'Untitled Project'
    const effectiveOneLiner = session.oneLiner?.trim() || 'Not provided yet'

    const context = {
      planningLevel: session.planningLevel ?? 'medium',
      projectName: effectiveProjectName,
      oneLiner: effectiveOneLiner,
      messages: session.messages,
      coveredTopics: session.coveredTopics,
    }

    const result = await aiGenerateProjectNameSuggestions(context, provider)

    if (result.success && result.suggestions && result.suggestions.length > 0) {
      updateSession(sessionId, { nameSuggestions: result.suggestions })
      emitEvent({ type: 'names_generated', suggestions: result.suggestions })
      transitionTo(sessionId, 'naming_project')
    } else {
      // Generate a default suggestion based on the conversation
      const defaultSuggestions: ProjectNameSuggestion[] = [
        { name: 'New Project', reasoning: 'Default name - you can customize it' },
      ]
      updateSession(sessionId, { nameSuggestions: defaultSuggestions })
      emitEvent({ type: 'names_generated', suggestions: defaultSuggestions })
      transitionTo(sessionId, 'naming_project')
    }

    return getSession(sessionId)!
  }

  async function selectProjectName(sessionId: SessionId, name: string): Promise<SessionState> {
    const session = getSession(sessionId)
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`)
    }

    // Try to extract clean name if it looks like conversational input
    let finalName = name
    if (name.toLowerCase().includes("let's") || name.toLowerCase().includes('call it')) {
      const extracted = await aiExtractProjectName(name, provider)
      if (extracted.success && extracted.name) {
        finalName = extracted.name
      }
    }

    updateSession(sessionId, { selectedName: finalName })
    emitEvent({ type: 'name_selected', name: finalName })

    return getSession(sessionId)!
  }

  async function extractProjectData(sessionId: SessionId): Promise<SessionState> {
    const session = getSession(sessionId)
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`)
    }

    transitionTo(sessionId, 'extracting_data')

    const effectiveProjectName = session.selectedName || session.projectName?.trim() || 'Untitled Project'
    const effectiveOneLiner = session.oneLiner?.trim() || 'Not provided yet'

    const context = {
      planningLevel: session.planningLevel ?? 'medium',
      projectName: effectiveProjectName,
      oneLiner: effectiveOneLiner,
      messages: session.messages,
      coveredTopics: session.coveredTopics,
    }

    const result = await aiExtractProjectData(context, provider)

    let extractedData: ExtractedProjectData
    if (result.success && result.data) {
      extractedData = result.data
    } else {
      // Create minimal fallback data
      extractedData = {
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
    }

    updateSession(sessionId, { extractedData })
    emitEvent({ type: 'extraction_complete', data: extractedData })
    transitionTo(sessionId, 'ready_to_scaffold')

    return getSession(sessionId)!
  }

  // ============================================================================
  // Scaffolding
  // ============================================================================

  async function scaffold(
    sessionId: SessionId,
  ): Promise<{ success: boolean; projectPath?: string; error?: string }> {
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

    transitionTo(sessionId, 'scaffolding')

    try {
      const projectSlug = createFolderName(session.selectedName)

      const projectData: ScaffoldProjectData = {
        projectName: session.selectedName,
        projectSlug,
        oneLiner: session.oneLiner,
        extracted: session.extractedData,
        interviewTranscript: {
          messages: session.messages,
          planningLevel: session.planningLevel,
          createdAt: session.createdAt,
        },
      }

      const result = await scaffoldProject(
        config.vault,
        config.settings.projectsFolder,
        projectSlug,
        projectData,
      )

      if (!result.success) {
        transitionTo(sessionId, 'error', { error: result.error })
        return { success: false, error: result.error }
      }

      updateSession(sessionId, { scaffoldedPath: result.projectPath })
      emitEvent({ type: 'scaffold_complete', projectPath: result.projectPath! })
      transitionTo(sessionId, 'complete')

      return { success: true, projectPath: result.projectPath }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown scaffolding error'
      transitionTo(sessionId, 'error', { error: errorMessage })
      return { success: false, error: errorMessage }
    }
  }

  // ============================================================================
  // Event Subscription
  // ============================================================================

  function subscribe(callback: SessionEventCallback): () => void {
    return subscribeToStore(callback)
  }

  // ============================================================================
  // Return the Manager Interface
  // ============================================================================

  return {
    createSession,
    getSession: getSessionById,
    listSessions: listAllSessions,
    deleteSession: removeSession,
    sendMessage,
    streamNextQuestion,
    requestNameSuggestions,
    selectProjectName,
    extractProjectData,
    scaffold,
    subscribe,
  }
}
