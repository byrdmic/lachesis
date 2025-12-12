/**
 * In-memory store for conversation state per project.
 * Allows conversations to be restored when components remount.
 */

import type { StoredConversationState } from '../ui/NewProject/ConversationPhase.tsx'

// Re-export for convenience
export type { StoredConversationState }

// In-memory store keyed by project path
const conversationStore = new Map<string, StoredConversationState>()

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
