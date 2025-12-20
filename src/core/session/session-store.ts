// Session store for in-memory state + optional file persistence
// Manages the lifecycle of session state across CLI invocations

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import type { SessionId, SessionState, SessionEventCallback, SessionEvent } from './types.ts'

// ============================================================================
// Store Configuration
// ============================================================================

const SESSIONS_DIR = join(homedir(), '.lachesis', 'sessions')
const MAX_SESSIONS = 100 // Maximum number of sessions to keep

// ============================================================================
// In-Memory Store
// ============================================================================

const sessionMap = new Map<SessionId, SessionState>()
const subscribers = new Set<SessionEventCallback>()

// ============================================================================
// Event Emission
// ============================================================================

/**
 * Emit an event to all subscribers
 */
export function emitEvent(event: SessionEvent): void {
  for (const callback of subscribers) {
    try {
      callback(event)
    } catch {
      // Ignore subscriber errors
    }
  }
}

/**
 * Subscribe to session events
 */
export function subscribe(callback: SessionEventCallback): () => void {
  subscribers.add(callback)
  return () => {
    subscribers.delete(callback)
  }
}

// ============================================================================
// Session CRUD Operations
// ============================================================================

/**
 * Get a session by ID (from memory first, then disk)
 */
export function getSession(sessionId: SessionId): SessionState | null {
  // Check memory first
  const memorySession = sessionMap.get(sessionId)
  if (memorySession) {
    return memorySession
  }

  // Try to load from disk
  const diskSession = loadSessionFromDisk(sessionId)
  if (diskSession) {
    // Cache in memory
    sessionMap.set(sessionId, diskSession)
    return diskSession
  }

  return null
}

/**
 * Save a session (to memory and optionally disk)
 */
export function saveSession(session: SessionState, persistToDisk = true): void {
  // Update timestamp
  session.updatedAt = new Date().toISOString()

  // Save to memory
  sessionMap.set(session.id, session)

  // Persist to disk if requested
  if (persistToDisk) {
    saveSessionToDisk(session)
  }
}

/**
 * Delete a session
 */
export function deleteSession(sessionId: SessionId): void {
  sessionMap.delete(sessionId)
  deleteSessionFromDisk(sessionId)
}

/**
 * List all sessions (from memory + disk)
 */
export function listSessions(): SessionState[] {
  // Get all sessions from disk
  const diskSessionIds = listSessionsFromDisk()

  // Load any that aren't in memory
  for (const id of diskSessionIds) {
    if (!sessionMap.has(id)) {
      const session = loadSessionFromDisk(id)
      if (session) {
        sessionMap.set(id, session)
      }
    }
  }

  // Return all sessions sorted by updated time (newest first)
  return Array.from(sessionMap.values()).sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  )
}

/**
 * Update session state with a partial update
 */
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
// Disk Persistence
// ============================================================================

/**
 * Ensure the sessions directory exists
 */
function ensureSessionsDir(): void {
  if (!existsSync(SESSIONS_DIR)) {
    mkdirSync(SESSIONS_DIR, { recursive: true })
  }
}

/**
 * Get the file path for a session
 */
function getSessionPath(sessionId: SessionId): string {
  return join(SESSIONS_DIR, `${sessionId}.json`)
}

/**
 * Save a session to disk
 */
function saveSessionToDisk(session: SessionState): void {
  try {
    ensureSessionsDir()
    const filePath = getSessionPath(session.id)
    writeFileSync(filePath, JSON.stringify(session, null, 2), 'utf-8')
  } catch {
    // Silently fail disk writes - in-memory is the source of truth
  }
}

/**
 * Load a session from disk
 */
function loadSessionFromDisk(sessionId: SessionId): SessionState | null {
  try {
    const filePath = getSessionPath(sessionId)
    if (!existsSync(filePath)) {
      return null
    }
    const content = readFileSync(filePath, 'utf-8')
    return JSON.parse(content) as SessionState
  } catch {
    return null
  }
}

/**
 * Delete a session from disk
 */
function deleteSessionFromDisk(sessionId: SessionId): void {
  try {
    const filePath = getSessionPath(sessionId)
    if (existsSync(filePath)) {
      unlinkSync(filePath)
    }
  } catch {
    // Silently fail
  }
}

/**
 * List all session IDs from disk
 */
function listSessionsFromDisk(): SessionId[] {
  try {
    ensureSessionsDir()
    const files = readdirSync(SESSIONS_DIR)
    return files
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.replace('.json', ''))
  } catch {
    return []
  }
}

// ============================================================================
// Cleanup Operations
// ============================================================================

/**
 * Clean up old sessions (keep only recent ones)
 */
export function cleanupOldSessions(): void {
  const sessions = listSessions()

  // If we have too many sessions, delete the oldest ones
  if (sessions.length > MAX_SESSIONS) {
    const toDelete = sessions.slice(MAX_SESSIONS)
    for (const session of toDelete) {
      deleteSession(session.id)
    }
  }
}

/**
 * Clear all sessions (for testing)
 */
export function clearAllSessions(): void {
  sessionMap.clear()
  try {
    ensureSessionsDir()
    const files = readdirSync(SESSIONS_DIR)
    for (const file of files) {
      if (file.endsWith('.json')) {
        unlinkSync(join(SESSIONS_DIR, file))
      }
    }
  } catch {
    // Silently fail
  }
}

// ============================================================================
// Session State Helpers
// ============================================================================

/**
 * Get sessions by type
 */
export function getSessionsByType(type: SessionState['type']): SessionState[] {
  return listSessions().filter((s) => s.type === type)
}

/**
 * Get active sessions (not complete or error)
 */
export function getActiveSessions(): SessionState[] {
  return listSessions().filter(
    (s) => s.step !== 'complete' && s.step !== 'error',
  )
}

/**
 * Find a session by project path (for existing projects)
 */
export function findSessionByProjectPath(projectPath: string): SessionState | null {
  const sessions = listSessions()
  return sessions.find((s) => s.projectPath === projectPath) ?? null
}
