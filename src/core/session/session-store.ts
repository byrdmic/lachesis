// Session store for Obsidian plugin
// Uses plugin data storage instead of file system

import type { Plugin } from 'obsidian'
import type { SessionId, SessionState, SessionEventCallback, SessionEvent } from './types'

// ============================================================================
// Store State
// ============================================================================

const sessionMap = new Map<SessionId, SessionState>()
const subscribers = new Set<SessionEventCallback>()
let pluginInstance: Plugin | null = null

// ============================================================================
// Initialization
// ============================================================================

/**
 * Initialize the session store with the plugin instance
 */
export function initializeStore(plugin: Plugin): void {
  pluginInstance = plugin
}

/**
 * Load sessions from plugin data
 */
export async function loadFromDisk(): Promise<void> {
  if (!pluginInstance) return

  try {
    const data = await pluginInstance.loadData()
    if (data?.sessions) {
      for (const [id, session] of Object.entries(data.sessions)) {
        sessionMap.set(id, session as SessionState)
      }
    }
  } catch {
    // Silently fail - start with empty sessions
  }
}

/**
 * Save all sessions to plugin data
 */
async function saveToDisk(): Promise<void> {
  if (!pluginInstance) return

  try {
    const data = (await pluginInstance.loadData()) || {}
    data.sessions = Object.fromEntries(sessionMap.entries())
    await pluginInstance.saveData(data)
  } catch {
    // Silently fail
  }
}

// ============================================================================
// Event Emission
// ============================================================================

export function emitEvent(event: SessionEvent): void {
  for (const callback of subscribers) {
    try {
      callback(event)
    } catch {
      // Ignore subscriber errors
    }
  }
}

export function subscribe(callback: SessionEventCallback): () => void {
  subscribers.add(callback)
  return () => {
    subscribers.delete(callback)
  }
}

// ============================================================================
// Session CRUD Operations
// ============================================================================

export function getSession(sessionId: SessionId): SessionState | null {
  return sessionMap.get(sessionId) ?? null
}

export function saveSession(session: SessionState): void {
  session.updatedAt = new Date().toISOString()
  sessionMap.set(session.id, session)
  // Fire and forget disk save
  saveToDisk()
}

export function deleteSession(sessionId: SessionId): void {
  sessionMap.delete(sessionId)
  saveToDisk()
}

export function listSessions(): SessionState[] {
  return Array.from(sessionMap.values()).sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  )
}

export function updateSession(
  sessionId: SessionId,
  updates: Partial<SessionState>,
): SessionState | null {
  const session = getSession(sessionId)
  if (!session) {
    return null
  }

  const updatedSession: SessionState = {
    ...session,
    ...updates,
    id: session.id, // Ensure ID can't be changed
    createdAt: session.createdAt, // Ensure createdAt can't be changed
    updatedAt: new Date().toISOString(),
  }

  saveSession(updatedSession)
  return updatedSession
}

// ============================================================================
// Cleanup Operations
// ============================================================================

const MAX_SESSIONS = 50

export function cleanupOldSessions(): void {
  const sessions = listSessions()

  if (sessions.length > MAX_SESSIONS) {
    const toDelete = sessions.slice(MAX_SESSIONS)
    for (const session of toDelete) {
      deleteSession(session.id)
    }
  }
}

export function clearAllSessions(): void {
  sessionMap.clear()
  saveToDisk()
}

// ============================================================================
// Session State Helpers
// ============================================================================

export function getSessionsByType(type: SessionState['type']): SessionState[] {
  return listSessions().filter((s) => s.type === type)
}

export function getActiveSessions(): SessionState[] {
  return listSessions().filter(
    (s) => s.step !== 'complete' && s.step !== 'error',
  )
}
