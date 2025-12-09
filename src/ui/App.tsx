import React, { useCallback, useEffect, useState } from 'react'
import { Box, Text, useApp, useInput } from 'ink'
import { loadConfig, updateConfig } from '../config/config.ts'
import { NewProjectFlow, AIConnectionCheck } from './NewProject/index.tsx'
import { ExistingProjectFlow } from './ExistingProject/index.tsx'
import { DebugLog, Select, SettingsPanel, StatusBar } from './components/index.ts'
import { debugLog } from '../debug/logger.ts'
import { testAIConnection } from '../ai/client.ts'
import type { LachesisConfig } from '../config/types.ts'

type AppProps = {
  command: 'new' | 'start'
  debug?: boolean
}

type AppState =
  | { phase: 'loading' }
  | { phase: 'config_created'; config: LachesisConfig; message: string }
  | { phase: 'ready'; config: LachesisConfig }
  | { phase: 'error'; error: string }

export function App({ command, debug = false }: AppProps) {
  const [state, setState] = useState<AppState>({ phase: 'loading' })

  // Enable debug logging if flag is set
  useEffect(() => {
    debugLog.setEnabled(debug)
    if (debug) {
      debugLog.info('Debug mode enabled')
      debugLog.info('App starting', { command })
    }
  }, [debug, command])

  useEffect(() => {
    const result = loadConfig()
    if (debug) {
      debugLog.debug('Config loaded', { result: JSON.stringify(result) })
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
        // Auto-advance after showing message
        setTimeout(() => {
          setState({ phase: 'ready', config: result.config })
        }, 2000)
        break
      case 'error':
        setState({ phase: 'error', error: result.error })
        break
    }
  }, [])

  // Wrapper component for debug layout
  const withDebugPanel = (content: React.ReactNode) => {
    if (!debug) return content
    return (
      <Box flexDirection="column" height="100%">
        <Box flexDirection="column" flexGrow={1}>
          {content}
        </Box>
        <DebugLog maxLines={6} />
      </Box>
    )
  }

  if (state.phase === 'loading') {
    return withDebugPanel(
      <Box flexDirection="column" padding={1}>
        <Text color="cyan">Loading Lachesis...</Text>
      </Box>,
    )
  }

  if (state.phase === 'error') {
    return withDebugPanel(
      <Box flexDirection="column" padding={1}>
        <Text color="red">Error: {state.error}</Text>
      </Box>,
    )
  }

  if (state.phase === 'config_created') {
    return withDebugPanel(
      <Box flexDirection="column" padding={1}>
        <Text color="green" bold>
          First-time setup complete!
        </Text>
        <Text>{'\n'}</Text>
        <Text dimColor>{state.message}</Text>
        <Text>{'\n'}</Text>
        <Text color="cyan">Starting interview...</Text>
      </Box>,
    )
  }

  // Ready state
  if (command === 'start') {
    return withDebugPanel(
      <ProjectLauncher config={state.config} debug={debug} />,
    )
  }

  if (command === 'new') {
    return withDebugPanel(
      <NewProjectFlow config={state.config} debug={debug} />,
    )
  }

  return withDebugPanel(
    <Box>
      <Text color="red">Unknown command: {command}</Text>
    </Box>,
  )
}

// ============================================================================
// Project Launcher (start command)
// ============================================================================

type LauncherState =
  | { step: 'ai_check'; checking: boolean; error?: string }
  | { step: 'menu' }
  | { step: 'new' }
  | { step: 'existing' }

function ProjectLauncher({
  config: initialConfig,
  debug = false,
}: {
  config: LachesisConfig
  debug?: boolean
}) {
  const { exit } = useApp()
  const [config, setConfig] = useState<LachesisConfig>(initialConfig)
  const [state, setState] = useState<LauncherState>({
    step: 'ai_check',
    checking: true,
  })
  const [showSettings, setShowSettings] = useState(false)

  // Log state changes when debug is enabled
  useEffect(() => {
    if (debug) {
      debugLog.debug('Launcher state changed', { step: state.step })
    }
  }, [state.step, debug])

  // Test AI connectivity before showing the menu
  useEffect(() => {
    if (state.step !== 'ai_check' || !state.checking) return

    let cancelled = false

    testAIConnection(config).then((result) => {
      if (cancelled) return

      if (result.connected) {
        setState({ step: 'menu' })
      } else {
        setState({
          step: 'ai_check',
          checking: false,
          error: result.error || 'Connection failed',
        })
      }
    })

    return () => {
      cancelled = true
    }
  }, [
    config,
    state.step,
    state.step === 'ai_check' ? state.checking : false,
  ])

  const handleSettingsSave = useCallback(
    (updates: Partial<LachesisConfig>) => {
      const newConfig = { ...config, ...updates }
      setConfig(newConfig)
      updateConfig(updates)
    },
    [config],
  )

  // Handle launcher-level inputs (settings + AI retry)
  useInput(
    (input, key) => {
      const lower = input.toLowerCase()

      if (
        lower === 's' &&
        (state.step === 'ai_check' || state.step === 'menu') &&
        !showSettings
      ) {
        setShowSettings(true)
        return
      }

      if (state.step === 'ai_check' && state.error) {
        if (lower === 'r') {
          setState({ step: 'ai_check', checking: true })
        }
        if (lower === 'q') {
          exit()
        }
      }
    },
    { isActive: state.step !== 'new' && state.step !== 'existing' && !showSettings },
  )

  if (showSettings) {
    return (
      <SettingsPanel
        config={config}
        onSave={handleSettingsSave}
        onClose={() => setShowSettings(false)}
      />
    )
  }

  if (state.step === 'ai_check') {
    return (
      <AIConnectionCheck
        config={config}
        checking={state.checking}
        error={state.error}
        onConnected={() => setState({ step: 'menu' })}
        onError={(error) =>
          setState({ step: 'ai_check', checking: false, error })
        }
      />
    )
  }

  if (state.step === 'menu') {
    return (
      <Box flexDirection="column">
        <StatusBar config={config} />
        <Box padding={1} flexDirection="column">
          <Box marginBottom={1}>
            <Text bold>Lachesis Project Foundations Studio</Text>
          </Box>
          <Select
            label="What would you like to do?"
            options={[
              { label: 'Start a new project interview', value: 'new' },
              { label: 'Load an existing project', value: 'existing' },
            ]}
            onSelect={(value) => setState({ step: value as 'new' | 'existing' })}
          />
          <Box marginTop={1}>
            <Text dimColor>
              Use ↑/↓ to choose, Enter to confirm. [S] to edit settings.
            </Text>
          </Box>
        </Box>
      </Box>
    )
  }

  if (state.step === 'existing') {
    return (
      <ExistingProjectFlow
        config={config}
        onBack={() => setState({ step: 'menu' })}
      />
    )
  }

  // state.step === 'new'
  return <NewProjectFlow config={config} debug={debug} />
}
