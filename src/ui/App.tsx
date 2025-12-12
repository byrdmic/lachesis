import React, { useCallback, useEffect, useState } from 'react'
import { Box, Text, useApp, useInput } from 'ink'
import { loadConfig, updateConfig } from '../config/config.ts'
import { NewProjectFlow } from './NewProject/index.tsx'
import { ExistingProjectFlow } from './ExistingProject/index.tsx'
import { DebugLog, Select, SettingsPanel, StatusBar } from './components/index.ts'
import { debugLog } from '../debug/logger.ts'
import type { LachesisConfig } from '../config/types.ts'
import type { AIStatusDescriptor } from './components/StatusBar.tsx'

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
  const [debugHotkeysEnabled, setDebugHotkeysEnabled] = useState(false)

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
        <Text color="cyan">Starting planning session...</Text>
      </Box>,
    )
  }

  // Ready state
  if (command === 'start') {
    return withDebugPanel(
      <ProjectLauncher
        config={state.config}
        debug={debug}
        onDebugHotkeysChange={setDebugHotkeysEnabled}
      />,
    )
  }

  if (command === 'new') {
    return withDebugPanel(
      <NewProjectFlow
        config={state.config}
        debug={debug}
        onDebugHotkeysChange={setDebugHotkeysEnabled}
      />,
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

type LauncherState = { step: 'menu' | 'new' | 'existing' }

function ProjectLauncher({
  config: initialConfig,
  debug = false,
  onDebugHotkeysChange,
}: {
  config: LachesisConfig
  debug?: boolean
  onDebugHotkeysChange?: (enabled: boolean) => void
}) {
  const { exit } = useApp()
  const [config, setConfig] = useState<LachesisConfig>(initialConfig)
  const [state, setState] = useState<LauncherState>({
    step: 'menu',
  })
  const [showSettings, setShowSettings] = useState(false)
  const settingsHotkeyEnabled = !showSettings && state.step === 'menu'
  const aiStatus: AIStatusDescriptor = { state: 'idle', message: 'Ready' }

  // Log state changes when debug is enabled
  useEffect(() => {
    if (debug) {
      debugLog.debug('Launcher state changed', { step: state.step })
    }
  }, [state.step, debug])

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

      if (key.escape) {
        exit()
        return
      }

      if (key.shift && lower === 'q') {
        exit()
        return
      }

      if (
        lower === 's' &&
        state.step === 'menu' &&
        !showSettings
      ) {
        setShowSettings(true)
        return
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

  if (state.step === 'menu') {
    return (
      <Box flexDirection="column" width="100%">
        {/* Menu content */}
        <Box padding={1} flexDirection="column">
          <Box marginBottom={1}>
            <Text bold>Lachesis Project Foundations Studio</Text>
          </Box>
          <Select
            label="What would you like to do?"
            options={[
              { label: 'Start a new project planning session', value: 'new' },
              { label: 'Load an existing project', value: 'existing' },
            ]}
            onSelect={(value) => setState({ step: value as 'new' | 'existing' })}
          />
          <Box marginTop={1}>
            <Text dimColor>
              Use ↑/↓ to choose, Enter to confirm. [s] to edit settings. [ESC] or
              [Q] to quit.
            </Text>
          </Box>
        </Box>
        {/* Status bar at bottom */}
        <StatusBar
          config={config}
          aiStatus={aiStatus}
          showSettingsHint={settingsHotkeyEnabled}
        />
      </Box>
    )
  }

  if (state.step === 'existing') {
    return (
      <ExistingProjectFlow
        config={config}
        debug={debug}
        onBack={() => setState({ step: 'menu' })}
        onDebugHotkeysChange={onDebugHotkeysChange}
      />
    )
  }

  // state.step === 'new'
  return (
    <NewProjectFlow
      config={config}
      debug={debug}
      onExit={() => setState({ step: 'menu' })}
      onDebugHotkeysChange={onDebugHotkeysChange}
    />
  )
}
