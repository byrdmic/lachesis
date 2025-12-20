// Session module - CLI-first architecture for conversation management
// Both CLI commands and TUI components use this module

// Types
export type {
  SessionId,
  SessionType,
  SessionStep,
  SessionState,
  SessionEvent,
  SessionEventCallback,
  CreateSessionOptions,
  SessionManager,
  ProjectNameSuggestion,
  // CLI output types
  SessionStartOutput,
  SessionMessageOutput,
  SessionStatusOutput,
  SessionListOutput,
  SessionFinalizeOutput,
} from './types.ts'

// Type utilities
export {
  generateSessionId,
  createInitialSessionState,
  isInputStep,
  isTerminalStep,
  isProcessingStep,
} from './types.ts'

// Session manager
export {
  createSessionManager,
  getDefaultSessionManager,
  resetDefaultSessionManager,
} from './session-manager.ts'

// Session store (for direct access if needed)
export {
  getSession,
  saveSession,
  deleteSession,
  listSessions,
  updateSession,
  subscribe,
  emitEvent,
  cleanupOldSessions,
  clearAllSessions,
  getSessionsByType,
  getActiveSessions,
  findSessionByProjectPath,
} from './session-store.ts'

// Session operations (core business logic)
export {
  streamQuestion,
  streamAgenticResponse,
  processUserMessage,
  generateNameSuggestions,
  selectProjectName,
  extractProjectDataFromSession,
  scaffoldSessionProject,
  finalizeSession,
  detectTopics,
  checkForTransitionPhrase,
} from './session-operations.ts'

export type { OperationResult, StreamQuestionOptions, AgenticOptions } from './session-operations.ts'

// State machine transitions
export {
  isValidTransition,
  getValidNextSteps,
  isTerminalState,
  canRetryFromError,
  INPUT_STEPS,
  PROCESSING_STEPS,
  SUCCESS_STEPS,
  FAILURE_STEPS,
  STEP_DESCRIPTIONS,
  getStepDescription,
  getStepProgress,
} from './session-transitions.ts'
