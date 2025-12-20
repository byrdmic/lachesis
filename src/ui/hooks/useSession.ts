// useSession hook - provides a convenient API for session management in components
import { useState, useEffect, useCallback, useRef } from 'react'
import type {
  SessionId,
  SessionState,
  SessionEvent,
  CreateSessionOptions,
  ProjectNameSuggestion,
} from '../../core/session/index.ts'
import {
  getSession,
  subscribe,
  streamQuestion,
  processUserMessage,
  generateNameSuggestions,
  selectProjectName as selectName,
  extractProjectDataFromSession,
  scaffoldSessionProject,
  checkForTransitionPhrase,
} from '../../core/session/index.ts'
import { useSessionManager, useSessionConfig } from '../contexts/SessionManagerContext.tsx'

// ============================================================================
// Types
// ============================================================================

export type UseSessionOptions = {
  sessionId?: SessionId
  onEvent?: (event: SessionEvent) => void
  agenticEnabled?: boolean
  projectPath?: string
}

export type UseSessionResult = {
  // Session state
  session: SessionState | null
  isLoading: boolean
  error: string | null

  // Streaming state
  streamingText: string
  isStreaming: boolean

  // Actions
  createSession: (options: CreateSessionOptions) => Promise<SessionState>
  sendMessage: (message: string) => Promise<void>
  generateFirstQuestion: () => Promise<void>
  requestNameSuggestions: () => Promise<ProjectNameSuggestion[]>
  selectProjectName: (name: string, isCustomInput?: boolean) => Promise<void>
  extractProjectData: () => Promise<void>
  scaffold: (vaultPath: string) => Promise<string | null>
  clearError: () => void
}

// ============================================================================
// Hook Implementation
// ============================================================================

export function useSession(options: UseSessionOptions = {}): UseSessionResult {
  const { sessionId: initialSessionId, onEvent, agenticEnabled, projectPath } = options

  const manager = useSessionManager()
  const config = useSessionConfig()

  // State
  const [sessionId, setSessionId] = useState<SessionId | null>(initialSessionId ?? null)
  const [session, setSession] = useState<SessionState | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [streamingText, setStreamingText] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)

  // Refs for callbacks
  const onEventRef = useRef(onEvent)
  onEventRef.current = onEvent

  // Update session state when sessionId changes
  useEffect(() => {
    if (sessionId) {
      const currentSession = getSession(sessionId)
      setSession(currentSession)
    } else {
      setSession(null)
    }
  }, [sessionId])

  // Subscribe to session events
  useEffect(() => {
    const unsubscribe = subscribe((event: SessionEvent) => {
      // Forward to external handler
      onEventRef.current?.(event)

      // Handle streaming events
      if (event.type === 'ai_streaming') {
        setStreamingText(event.partial)
        setIsStreaming(true)
      } else if (event.type === 'ai_complete') {
        setStreamingText('')
        setIsStreaming(false)
      }

      // Handle step changes
      if (event.type === 'step_changed') {
        if (sessionId) {
          setSession(getSession(sessionId))
        }
      }

      // Handle errors
      if (event.type === 'error') {
        setError(event.error)
        setIsLoading(false)
      }

      // Update session on relevant events
      if (
        event.type === 'message_added' ||
        event.type === 'names_generated' ||
        event.type === 'name_selected' ||
        event.type === 'extraction_complete' ||
        event.type === 'scaffold_complete'
      ) {
        if (sessionId) {
          setSession(getSession(sessionId))
        }
      }
    })

    return unsubscribe
  }, [sessionId])

  // ============================================================================
  // Actions
  // ============================================================================

  const createSession = useCallback(
    async (options: CreateSessionOptions): Promise<SessionState> => {
      setIsLoading(true)
      setError(null)

      try {
        const newSession = await manager.createSession(options)
        setSessionId(newSession.id)
        setSession(newSession)
        return newSession
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to create session'
        setError(errorMessage)
        throw err
      } finally {
        setIsLoading(false)
      }
    },
    [manager],
  )

  const generateFirstQuestion = useCallback(async (): Promise<void> => {
    if (!sessionId) {
      setError('No session ID')
      return
    }

    setIsLoading(true)
    setError(null)
    setStreamingText('')
    setIsStreaming(true)

    try {
      if (agenticEnabled && projectPath) {
        // Use agentic mode for existing projects
        const { streamAgenticResponse } = await import('../../core/session/session-operations.ts')
        await streamAgenticResponse({
          sessionId,
          config,
          projectPath,
          onStreamUpdate: (partial) => setStreamingText(partial),
        })
      } else {
        await streamQuestion({
          sessionId,
          config,
          onStreamUpdate: (partial) => setStreamingText(partial),
        })
      }

      setSession(getSession(sessionId))
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to generate question'
      setError(errorMessage)
    } finally {
      setIsLoading(false)
      setIsStreaming(false)
      setStreamingText('')
    }
  }, [sessionId, config, agenticEnabled, projectPath])

  const sendMessage = useCallback(
    async (message: string): Promise<void> => {
      if (!sessionId) {
        setError('No session ID')
        return
      }

      setIsLoading(true)
      setError(null)
      setStreamingText('')
      setIsStreaming(true)

      try {
        const result = await processUserMessage(sessionId, message, config, {
          onStreamUpdate: (partial) => setStreamingText(partial),
          agenticEnabled,
          projectPath,
        })

        // Check if the response contains the transition phrase
        if (result.success && result.data && checkForTransitionPhrase(result.data)) {
          // The AI wants to transition to naming - caller should handle this
        }

        setSession(getSession(sessionId))
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to send message'
        setError(errorMessage)
      } finally {
        setIsLoading(false)
        setIsStreaming(false)
        setStreamingText('')
      }
    },
    [sessionId, config, agenticEnabled, projectPath],
  )

  const requestNameSuggestions = useCallback(async (): Promise<ProjectNameSuggestion[]> => {
    if (!sessionId) {
      setError('No session ID')
      return []
    }

    setIsLoading(true)
    setError(null)

    try {
      const result = await generateNameSuggestions(sessionId, config)
      setSession(getSession(sessionId))

      if (result.success && result.data) {
        return result.data
      }
      return []
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to generate names'
      setError(errorMessage)
      return []
    } finally {
      setIsLoading(false)
    }
  }, [sessionId, config])

  const selectProjectName = useCallback(
    async (name: string, isCustomInput = false): Promise<void> => {
      if (!sessionId) {
        setError('No session ID')
        return
      }

      setIsLoading(true)
      setError(null)

      try {
        await selectName(sessionId, name, isCustomInput, config)
        setSession(getSession(sessionId))
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to select name'
        setError(errorMessage)
      } finally {
        setIsLoading(false)
      }
    },
    [sessionId, config],
  )

  const extractProjectData = useCallback(async (): Promise<void> => {
    if (!sessionId) {
      setError('No session ID')
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      await extractProjectDataFromSession(sessionId, config)
      setSession(getSession(sessionId))
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to extract data'
      setError(errorMessage)
    } finally {
      setIsLoading(false)
    }
  }, [sessionId, config])

  const scaffold = useCallback(
    async (vaultPath: string): Promise<string | null> => {
      if (!sessionId) {
        setError('No session ID')
        return null
      }

      setIsLoading(true)
      setError(null)

      try {
        const result = await scaffoldSessionProject(sessionId, vaultPath)
        setSession(getSession(sessionId))

        if (result.success && result.data) {
          return result.data
        }
        if (result.error) {
          setError(result.error)
        }
        return null
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to scaffold'
        setError(errorMessage)
        return null
      } finally {
        setIsLoading(false)
      }
    },
    [sessionId],
  )

  const clearError = useCallback(() => {
    setError(null)
  }, [])

  return {
    session,
    isLoading,
    error,
    streamingText,
    isStreaming,
    createSession,
    sendMessage,
    generateFirstQuestion,
    requestNameSuggestions,
    selectProjectName,
    extractProjectData,
    scaffold,
    clearError,
  }
}
