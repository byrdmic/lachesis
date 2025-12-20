import React, { useEffect, useState } from 'react'
import { Box, Text } from 'ink'
import { loadConfig } from '../config/config.ts'
import type { LachesisConfig } from '../config/types.ts'
import { DebugLog } from './components/index.ts'
import { debugLog } from '../debug/logger.ts'
import { assertNever } from '../utils/type-guards.ts'
import { ProjectLauncher } from './ProjectLauncher/index.tsx'
import { NewProjectFlow } from './NewProject/index.tsx'
import { SessionManagerProvider } from './contexts/SessionManagerContext.tsx'

// ============================================================================
// Types
// ============================================================================

type AppProps = {
  command: 'new' | 'start'
  debug?: boolean
}

type AppState =
  | { phase: 'loading' }
  | { phase: 'config_created'; config: LachesisConfig; message: string }
  | { phase: 'ready'; config: LachesisConfig }
  | { phase: 'error'; error: string }

// ============================================================================
// Component
// ============================================================================

export function App({ command, debug = false }: AppProps) {
  const [state, setState] = useState<AppState>({ phase: 'loading' })
  const [debugHotkeysEnabled, setDebugHotkeysEnabled] = useState(false)

  // ============================================================================
  // Effects
  // ============================================================================

  // Enable debug logging
  useEffect(() => {
    debugLog.setEnabled(debug)
    if (debug) {
      debugLog.info('Debug mode enabled')
      debugLog.info('App starting', { command })
    }
  }, [debug, command])

  // Load configuration
  useEffect(() => {
    const result = loadConfig()
    if (debug) {
      debugLog.debug('Config loaded')
    }

    switch (result.status) {
      case 'loaded':
        setState({ phase: 'ready', config: result.config })
        break
      case 'created':
        setState({
          phase: 'config_created',
          config: result.config,
          message: result.message,
        })
        setTimeout(() => {
          setState({ phase: 'ready', config: result.config })
        }, 2000)
        break
      case 'error':
        setState({ phase: 'error', error: result.error })
        break
    }
  }, [debug])

  // ============================================================================
  // Render Helpers
  // ============================================================================

  const withDebugPanel = (content: React.ReactNode) => {
    if (!debug) {
      return (
        <Box flexDirection="column" height="100%" width="100%">
          {content}
        </Box>
      )
    }

    return (
      <Box flexDirection="column" height="100%" width="100%">
        <Box flexDirection="column" flexGrow={1} minHeight={0} width="100%">
          {content}
        </Box>
        <DebugLog maxLines={6} isActive={debugHotkeysEnabled} />
      </Box>
    )
  }

  const renderPhase = (): React.ReactNode => {
    switch (state.phase) {
      case 'loading':
        return (
          <Box flexDirection="column" padding={1}>
            <Text color="cyan">Loading Lachesis...</Text>
          </Box>
        )

      case 'error':
        return (
          <Box flexDirection="column" padding={1}>
            <Text color="red">Error: {state.error}</Text>
          </Box>
        )

      case 'config_created':
        return (
          <Box flexDirection="column" padding={1}>
            <Text color="green" bold>First-time setup complete!</Text>
            <Text>{'\n'}</Text>
            <Text dimColor>{state.message}</Text>
            <Text>{'\n'}</Text>
            <Text color="cyan">Starting planning session...</Text>
          </Box>
        )

      case 'ready':
        return renderReadyState(state.config)

      default:
        return assertNever(state)
    }
  }

  const renderReadyState = (config: LachesisConfig): React.ReactNode => {
    const content = (() => {
      switch (command) {
        case 'start':
          return (
            <ProjectLauncher
              config={config}
              debug={debug}
              onDebugHotkeysChange={setDebugHotkeysEnabled}
            />
          )
        case 'new':
          return (
            <NewProjectFlow
              config={config}
              debug={debug}
              onDebugHotkeysChange={setDebugHotkeysEnabled}
            />
          )
        default:
          return (
            <Box>
              <Text color="red">Unknown command: {command}</Text>
            </Box>
          )
      }
    })()

    // Wrap with SessionManagerProvider for session-based operations
    return (
      <SessionManagerProvider config={config}>
        {content}
      </SessionManagerProvider>
    )
  }

  // ============================================================================
  // Main Render
  // ============================================================================

  return withDebugPanel(renderPhase())
}
