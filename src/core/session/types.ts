// Session management types for Obsidian plugin
// These types define the session state machine

import type { PlanningLevel } from '../project/types'
import type { ConversationMessage, ExtractedProjectData } from '../../ai/client'

// ============================================================================
// Session Identity
// ============================================================================

export type SessionId = string

export type SessionType = 'new_project' | 'existing_project'

// ============================================================================
// Session Steps (State Machine)
// ============================================================================

export type SessionStep =
  | 'idle' // Session created but not started
  | 'generating_question' // AI is generating the next question
  | 'waiting_for_answer' // Waiting for user input
  | 'generating_names' // AI is generating project name suggestions
  | 'naming_project' // User is selecting/entering project name
  | 'extracting_data' // AI is extracting structured project data
  | 'ready_to_scaffold' // Data extracted, ready to create project files
  | 'scaffolding' // Creating project files
  | 'complete' // Session finished successfully
  | 'error' // Session encountered an error

// ============================================================================
// Project Name Suggestions
// ============================================================================

export type ProjectNameSuggestion = {
  name: string
  reasoning: string
}

// ============================================================================
// Session State
// ============================================================================

export type SessionState = {
  // Identity
  id: SessionId
  type: SessionType
  step: SessionStep

  // Timestamps
  createdAt: string
  updatedAt: string

  // Setup context (for new projects)
  planningLevel?: PlanningLevel
  projectName?: string
  oneLiner?: string

  // Conversation state
  messages: ConversationMessage[]
  coveredTopics: string[]

  // For existing projects
  projectPath?: string
  projectSnapshot?: string

  // Results from AI operations
  nameSuggestions?: ProjectNameSuggestion[]
  selectedName?: string
  extractedData?: ExtractedProjectData
  scaffoldedPath?: string

  // GitHub context (for new project interviews)
  githubRepoUrl?: string
  githubCommitLog?: string

  // Error information
  error?: string
  errorDetails?: string
}

// ============================================================================
// Session Events (for real-time updates)
// ============================================================================

export type SessionEvent =
  | { type: 'session_created'; sessionId: SessionId }
  | { type: 'step_changed'; step: SessionStep; previousStep: SessionStep }
  | { type: 'message_added'; message: ConversationMessage }
  | { type: 'ai_streaming'; partial: string }
  | { type: 'ai_complete'; content: string }
  | { type: 'topics_updated'; topics: string[] }
  | { type: 'names_generated'; suggestions: ProjectNameSuggestion[] }
  | { type: 'name_selected'; name: string }
  | { type: 'extraction_complete'; data: ExtractedProjectData }
  | { type: 'scaffold_complete'; projectPath: string }
  | { type: 'error'; error: string; details?: string }

// ============================================================================
// Session Creation Options
// ============================================================================

export type CreateSessionOptions = {
  type: SessionType
  planningLevel?: PlanningLevel
  projectName?: string
  oneLiner?: string
  projectPath?: string // For existing projects
}

// ============================================================================
// Session Manager Interface
// ============================================================================

export type SessionEventCallback = (event: SessionEvent) => void

export interface ISessionManager {
  // Session lifecycle
  createSession(options: CreateSessionOptions): Promise<SessionState>
  getSession(sessionId: SessionId): SessionState | null
  listSessions(): SessionState[]
  deleteSession(sessionId: SessionId): void

  // Conversation operations
  sendMessage(
    sessionId: SessionId,
    message: string,
    onEvent?: SessionEventCallback,
  ): Promise<SessionState>

  streamNextQuestion(
    sessionId: SessionId,
    onUpdate: (partial: string) => void,
  ): Promise<SessionState>

  // Phase transitions
  requestNameSuggestions(sessionId: SessionId): Promise<SessionState>
  selectProjectName(sessionId: SessionId, name: string): Promise<SessionState>
  extractProjectData(sessionId: SessionId): Promise<SessionState>

  // Scaffolding
  scaffold(
    sessionId: SessionId,
  ): Promise<{ success: boolean; projectPath?: string; error?: string }>

  // Event subscription
  subscribe(callback: SessionEventCallback): () => void
}

// ============================================================================
// Utility Functions
// ============================================================================

export function generateSessionId(): SessionId {
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).substring(2, 8)
  return `sess_${timestamp}_${random}`
}

export function createInitialSessionState(
  options: CreateSessionOptions,
): SessionState {
  const now = new Date().toISOString()
  return {
    id: generateSessionId(),
    type: options.type,
    step: 'idle',
    createdAt: now,
    updatedAt: now,
    planningLevel: options.planningLevel,
    projectName: options.projectName,
    oneLiner: options.oneLiner,
    projectPath: options.projectPath,
    messages: [],
    coveredTopics: [],
  }
}

export function isInputStep(step: SessionStep): boolean {
  return step === 'waiting_for_answer' || step === 'naming_project'
}

export function isTerminalStep(step: SessionStep): boolean {
  return step === 'complete' || step === 'error'
}

export function isProcessingStep(step: SessionStep): boolean {
  return (
    step === 'generating_question' ||
    step === 'generating_names' ||
    step === 'extracting_data' ||
    step === 'scaffolding'
  )
}
