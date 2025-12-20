// Session Manager Context - provides session management to React components
import React, { createContext, useContext, useMemo, useEffect, useRef } from 'react'
import type { LachesisConfig } from '../../config/types.ts'
import {
  createSessionManager,
  type SessionManager,
  type SessionEvent,
  type SessionEventCallback,
  subscribe as subscribeToStore,
} from '../../core/session/index.ts'

// ============================================================================
// Context Type
// ============================================================================

type SessionManagerContextValue = {
  manager: SessionManager
  config: LachesisConfig
}

const SessionManagerContext = createContext<SessionManagerContextValue | null>(null)

// ============================================================================
// Provider Component
// ============================================================================

type SessionManagerProviderProps = {
  config: LachesisConfig
  children: React.ReactNode
}

export function SessionManagerProvider({
  config,
  children,
}: SessionManagerProviderProps) {
  // Create session manager once, memoized by config reference
  const manager = useMemo(() => createSessionManager(config), [config])

  const value = useMemo(
    () => ({ manager, config }),
    [manager, config],
  )

  return (
    <SessionManagerContext.Provider value={value}>
      {children}
    </SessionManagerContext.Provider>
  )
}

// ============================================================================
// Hook to access the session manager
// ============================================================================

export function useSessionManager(): SessionManager {
  const context = useContext(SessionManagerContext)
  if (!context) {
    throw new Error('useSessionManager must be used within a SessionManagerProvider')
  }
  return context.manager
}

export function useSessionConfig(): LachesisConfig {
  const context = useContext(SessionManagerContext)
  if (!context) {
    throw new Error('useSessionConfig must be used within a SessionManagerProvider')
  }
  return context.config
}

// ============================================================================
// Hook to subscribe to session events
// ============================================================================

export function useSessionEvents(callback: SessionEventCallback): void {
  const callbackRef = useRef(callback)
  callbackRef.current = callback

  useEffect(() => {
    const unsubscribe = subscribeToStore((event: SessionEvent) => {
      callbackRef.current(event)
    })
    return unsubscribe
  }, [])
}
