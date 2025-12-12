/**
 * In-memory store for conversation state per project.
 * Allows conversations to be restored when components remount.
 */

import type { StoredConversationState } from '../ui/NewProject/ConversationPhase.tsx'

// Re-export for convenience
export type { StoredConversationState }

// In-memory store keyed by project path
const conversationStore = new Map<string, StoredConversationState>()

// Special key for new project in progress (not yet saved to disk)
const NEW_PROJECT_KEY = '__NEW_PROJECT__'

/**
 * Get stored conversation state for a project
 */
export function getConversationState(projectPath: string): StoredConversationState | null {
  return conversationStore.get(projectPath) ?? null
}

/**
 * Save conversation state for a project
 */
export function saveConversationState(projectPath: string, state: StoredConversationState): void {
  conversationStore.set(projectPath, state)
}

/**
 * Clear conversation state for a project (restart conversation)
 */
export function clearConversationState(projectPath: string): void {
  conversationStore.delete(projectPath)
}

/**
 * Check if a project has an active conversation
 */
export function hasConversationState(projectPath: string): boolean {
  return conversationStore.has(projectPath)
}

// ============================================================================
// New Project In-Progress State
// ============================================================================

export type NewProjectInProgressState = {
  conversationState: StoredConversationState
  planningLevel: string
  projectName: string
  oneLiner: string
}

/**
 * Check if there's a new project in progress
 */
export function hasNewProjectInProgress(): boolean {
  return conversationStore.has(NEW_PROJECT_KEY)
}

/**
 * Get the new project in-progress state
 */
export function getNewProjectInProgress(): NewProjectInProgressState | null {
  const stored = conversationStore.get(NEW_PROJECT_KEY)
  if (!stored) return null
  
  // The state is stored with extra metadata
  return (stored as unknown as NewProjectInProgressState)
}

/**
 * Save the new project in-progress state
 */
export function saveNewProjectInProgress(state: NewProjectInProgressState): void {
  conversationStore.set(NEW_PROJECT_KEY, state as unknown as StoredConversationState)
}

/**
 * Clear the new project in-progress state
 */
export function clearNewProjectInProgress(): void {
  conversationStore.delete(NEW_PROJECT_KEY)
}
