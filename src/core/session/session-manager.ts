// Session Manager - central coordinator for all session operations
// This is the main entry point that both CLI and TUI will use

import type { LachesisConfig } from '../../config/types.ts'
import type {
  SessionId,
  SessionState,
  SessionEvent,
  SessionEventCallback,
  CreateSessionOptions,
  SessionManager as ISessionManager,
} from './types.ts'
import {
  createInitialSessionState,
} from './types.ts'
import {
  getSession,
  saveSession,
  deleteSession as deleteSessionFromStore,
  listSessions as listSessionsFromStore,
  updateSession,
  subscribe as subscribeToStore,
  emitEvent,
} from './session-store.ts'

// ============================================================================
// Session Manager Implementation
// ============================================================================

/**
 * Create a session manager instance.
 * The manager requires a config to communicate with AI services.
 */
export function createSessionManager(config: LachesisConfig): ISessionManager {
  // ============================================================================
  // Session Lifecycle
  // ============================================================================

  async function createSession(
    options: CreateSessionOptions,
  ): Promise<SessionState> {
    const session = createInitialSessionState(options)

    // Save to store
    saveSession(session)

    // Emit creation event
    emitEvent({ type: 'session_created', sessionId: session.id })

    // Start generating the first question
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
    const userMessage = {
      role: 'user' as const,
      content: message,
      timestamp: new Date().toISOString(),
    }

    const messagesUpdated = [...session.messages, userMessage]
    updateSession(sessionId, { messages: messagesUpdated })

    // Emit message added event
    const messageEvent: SessionEvent = { type: 'message_added', message: userMessage }
    emitEvent(messageEvent)
    onEvent?.(messageEvent)

    // Transition to generating question
    const stepEvent: SessionEvent = {
      type: 'step_changed',
      step: 'generating_question',
      previousStep: session.step,
    }
    updateSession(sessionId, { step: 'generating_question' })
    emitEvent(stepEvent)
    onEvent?.(stepEvent)

    // Generate next question (this will be implemented in session-operations.ts)
    // For now, return the updated session
    const updatedSession = getSession(sessionId)
    if (!updatedSession) {
      throw new Error(`Session lost during message processing: ${sessionId}`)
    }

    return updatedSession
  }

  async function streamNextQuestion(
    sessionId: SessionId,
    onUpdate: (partial: string) => void,
  ): Promise<SessionState> {
    const session = getSession(sessionId)
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`)
    }

    // This will be implemented in session-operations.ts
    // For now, just return the current session
    return session
  }

  // ============================================================================
  // Phase Transitions
  // ============================================================================

  async function requestNameSuggestions(
    sessionId: SessionId,
  ): Promise<SessionState> {
    const session = getSession(sessionId)
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`)
    }

    // Transition to generating names
    updateSession(sessionId, { step: 'generating_names' })
    emitEvent({
      type: 'step_changed',
      step: 'generating_names',
      previousStep: session.step,
    })

    // This will be implemented in session-operations.ts
    return getSession(sessionId)!
  }

  async function selectProjectName(
    sessionId: SessionId,
    name: string,
  ): Promise<SessionState> {
    const session = getSession(sessionId)
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`)
    }

    // Save selected name
    updateSession(sessionId, {
      selectedName: name,
      step: 'extracting_data',
    })

    // Emit events
    emitEvent({ type: 'name_selected', name })
    emitEvent({
      type: 'step_changed',
      step: 'extracting_data',
      previousStep: 'naming_project',
    })

    return getSession(sessionId)!
  }

  async function extractProjectData(sessionId: SessionId): Promise<SessionState> {
    const session = getSession(sessionId)
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`)
    }

    // This will be implemented in session-operations.ts
    // For now, transition to ready_to_scaffold
    updateSession(sessionId, { step: 'ready_to_scaffold' })
    emitEvent({
      type: 'step_changed',
      step: 'ready_to_scaffold',
      previousStep: session.step,
    })

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

    // Transition to scaffolding
    updateSession(sessionId, { step: 'scaffolding' })
    emitEvent({
      type: 'step_changed',
      step: 'scaffolding',
      previousStep: session.step,
    })

    // This will be implemented in session-operations.ts
    // For now, return a placeholder
    return { success: false, error: 'Not implemented yet' }
  }

  // ============================================================================
  // Existing Project Support
  // ============================================================================

  async function loadExistingProject(
    projectPath: string,
    onEvent?: SessionEventCallback,
  ): Promise<SessionState> {
    // Create a session for an existing project
    const session = createInitialSessionState({
      type: 'existing_project',
      projectPath,
    })

    saveSession(session)

    // Emit creation event
    const createEvent: SessionEvent = { type: 'session_created', sessionId: session.id }
    emitEvent(createEvent)
    onEvent?.(createEvent)

    return session
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
    loadExistingProject,
    subscribe,
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let defaultManager: ISessionManager | null = null

/**
 * Get the default session manager instance.
 * Creates one if it doesn't exist.
 */
export function getDefaultSessionManager(config: LachesisConfig): ISessionManager {
  if (!defaultManager) {
    defaultManager = createSessionManager(config)
  }
  return defaultManager
}

/**
 * Reset the default session manager (for testing)
 */
export function resetDefaultSessionManager(): void {
  defaultManager = null
}
