import React, { useCallback, useEffect, useState } from 'react'
import { Box, Text, useApp, useInput } from 'ink'
import { loadConfig, updateConfig } from '../config/config.ts'
import { NewProjectFlow } from './NewProject/index.tsx'
import { ExistingProjectFlow } from './ExistingProject/index.tsx'
import { DebugLog, Select, SettingsPanel, StatusBar } from './components/index.ts'
import { debugLog } from '../debug/logger.ts'
import type { LachesisConfig } from '../config/types.ts'
import { DEFAULT_MCP_CONFIG } from '../config/types.ts'
import type { AIStatusDescriptor, MCPStatusDescriptor } from './components/StatusBar.tsx'
import {
  hasNewProjectInProgress,
  clearNewProjectInProgress,
  getNewProjectInProgress,
  getActiveExistingProject,
} from '../core/conversation-store.ts'
import { assertNever } from '../utils/type-guards.ts'
import type { ActiveChatInfo } from './components/StatusBar.tsx'
import { testMCPConnection, type MCPTestResult } from '../mcp/index.ts'

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

  // Step renderer with switch for exhaustive handling
  const renderAppPhase = (): React.ReactNode => {
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
            <Text color="green" bold>
              First-time setup complete!
            </Text>
            <Text>{'\n'}</Text>
            <Text dimColor>{state.message}</Text>
            <Text>{'\n'}</Text>
            <Text color="cyan">Starting planning session...</Text>
          </Box>
        )

      case 'ready':
        // Route based on command
        if (command === 'start') {
          return (
            <ProjectLauncher
              config={state.config}
              debug={debug}
              onDebugHotkeysChange={setDebugHotkeysEnabled}
            />
          )
        }
        if (command === 'new') {
          return (
            <NewProjectFlow
              config={state.config}
              debug={debug}
              onDebugHotkeysChange={setDebugHotkeysEnabled}
            />
          )
        }
        return (
          <Box>
            <Text color="red">Unknown command: {command}</Text>
          </Box>
        )

      default:
        return assertNever(state)
    }
  }

  return withDebugPanel(renderAppPhase())
}

// ============================================================================
// Project Launcher (start command)
// ============================================================================

type LauncherState = 
  | { step: 'menu' }
  | { step: 'new'; resuming: boolean }
  | { step: 'existing' }
  | { step: 'confirm_new_project' }

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
  const [hasWIP, setHasWIP] = useState(() => hasNewProjectInProgress())
  const [mcpStatus, setMcpStatus] = useState<MCPStatusDescriptor>({ state: 'idle' })
  const [mcpTestResult, setMcpTestResult] = useState<MCPTestResult | null>(null)
  const settingsHotkeyEnabled = !showSettings && state.step === 'menu'
  const aiStatus: AIStatusDescriptor = { state: 'idle', message: 'Ready' }

  // Test MCP connection when debug mode is enabled
  const runMCPTest = useCallback(async () => {
    const mcpConfig = config.mcp ?? DEFAULT_MCP_CONFIG
    if (!mcpConfig.enabled) {
      setMcpStatus({ state: 'idle' })
      setMcpTestResult(null)
      return
    }

    setMcpStatus({ state: 'connecting' })
    debugLog.info('MCP: Starting connection test...')

    const result = await testMCPConnection(mcpConfig)
    setMcpTestResult(result)

    if (result.success) {
      setMcpStatus({
        state: 'connected',
        toolCount: result.toolCount,
      })
      debugLog.info('MCP: Test passed', {
        toolCount: result.toolCount,
        tools: result.toolNames,
      })
    } else {
      setMcpStatus({
        state: 'error',
        error: result.error,
      })
      debugLog.error('MCP: Test failed', { error: result.error })
    }
  }, [config.mcp])

  // Auto-test MCP on mount when debug mode is enabled
  useEffect(() => {
    if (debug && config.mcp?.enabled) {
      runMCPTest()
    }
  }, [debug])
  
  // Check for WIP on menu return
  useEffect(() => {
    if (state.step === 'menu') {
      setHasWIP(hasNewProjectInProgress())
    }
  }, [state.step])

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

      // MCP test hotkey (only in debug mode)
      if (lower === 'm' && debug && state.step === 'menu' && !showSettings) {
        runMCPTest()
        return
      }
    },
    { isActive: state.step === 'menu' && !showSettings },
  )

  // Handle menu selection
  const handleMenuSelect = useCallback((value: string) => {
    if (value === 'resume') {
      setState({ step: 'new', resuming: true })
    } else if (value === 'new') {
      // Check if there's a WIP - show confirmation first
      if (hasWIP) {
        setState({ step: 'confirm_new_project' })
      } else {
        setState({ step: 'new', resuming: false })
      }
    } else if (value === 'existing') {
      setState({ step: 'existing' })
    }
  }, [hasWIP])

  // Overlay: Settings panel (early return before switch)
  if (showSettings) {
    return (
      <SettingsPanel
        config={config}
        onSave={handleSettingsSave}
        onClose={() => setShowSettings(false)}
      />
    )
  }

  // Step renderer with switch for exhaustive handling
  const renderLauncherStep = (): React.ReactNode => {
    switch (state.step) {
      case 'menu':
        return (
          <LauncherMenuView
            config={config}
            hasWIP={hasWIP}
            debug={debug}
            aiStatus={aiStatus}
            mcpStatus={mcpStatus}
            settingsHotkeyEnabled={settingsHotkeyEnabled}
            onMenuSelect={handleMenuSelect}
          />
        )

      case 'confirm_new_project':
        return (
          <ConfirmNewProjectDialog
            onConfirm={() => {
              clearNewProjectInProgress()
              setHasWIP(false)
              setState({ step: 'new', resuming: false })
            }}
            onCancel={() => setState({ step: 'menu' })}
            config={config}
            aiStatus={aiStatus}
          />
        )

      case 'existing':
        return (
          <ExistingProjectFlow
            config={config}
            debug={debug}
            onBack={() => setState({ step: 'menu' })}
            onDebugHotkeysChange={onDebugHotkeysChange}
          />
        )

      case 'new':
        return (
          <NewProjectFlow
            config={config}
            debug={debug}
            resuming={state.resuming}
            onExit={() => setState({ step: 'menu' })}
            onDebugHotkeysChange={onDebugHotkeysChange}
          />
        )

      default:
        return assertNever(state)
    }
  }

  return renderLauncherStep()
}

// ============================================================================
// Confirmation Dialog for New Project when WIP exists
// ============================================================================

function ConfirmNewProjectDialog({
  onConfirm,
  onCancel,
  config,
  aiStatus,
}: {
  onConfirm: () => void
  onCancel: () => void
  config: LachesisConfig
  aiStatus: AIStatusDescriptor
}) {
  const [selected, setSelected] = useState(1) // Default to "No, go back"

  useInput((input, key) => {
    if (key.upArrow || input === 'k') {
      setSelected((s) => Math.max(0, s - 1))
    }
    if (key.downArrow || input === 'j') {
      setSelected((s) => Math.min(1, s + 1))
    }
    if (key.return) {
      if (selected === 0) {
        onConfirm()
      } else {
        onCancel()
      }
    }
    if (key.escape) {
      onCancel()
    }
  })

  return (
    <Box flexDirection="column" width="100%">
      <Box padding={1} flexDirection="column">
        <Box marginBottom={1}>
          <Text bold>Lachesis Project Foundations Studio</Text>
        </Box>
        
        <Box
          borderStyle="round"
          borderColor="yellow"
          paddingX={2}
          paddingY={1}
          marginBottom={1}
          flexDirection="column"
        >
          <Text color="yellow" bold>⚠ Warning</Text>
          <Text>{'\n'}</Text>
          <Text>You have an existing new project in progress.</Text>
          <Text>Starting a new project will erase all progress on that project.</Text>
        </Box>
        
        <Text bold>Are you sure you want to start fresh?</Text>
        <Box flexDirection="column" marginTop={1}>
          <Text color={selected === 0 ? 'red' : undefined}>
            {selected === 0 ? '❯ ' : '  '}Yes, discard and start fresh
          </Text>
          <Text color={selected === 1 ? 'cyan' : undefined}>
            {selected === 1 ? '❯ ' : '  '}No, go back to menu
          </Text>
        </Box>
        
        <Box marginTop={1}>
          <Text dimColor>Use ↑/↓ to choose, Enter to confirm, ESC to cancel</Text>
        </Box>
      </Box>
      
      <StatusBar config={config} aiStatus={aiStatus} showSettingsHint={false} />
    </Box>
  )
}

// ============================================================================
// Launcher Menu View
// ============================================================================

function LauncherMenuView({
  config,
  hasWIP,
  debug,
  aiStatus,
  mcpStatus,
  settingsHotkeyEnabled,
  onMenuSelect,
}: {
  config: LachesisConfig
  hasWIP: boolean
  debug: boolean
  aiStatus: AIStatusDescriptor
  mcpStatus: MCPStatusDescriptor
  settingsHotkeyEnabled: boolean
  onMenuSelect: (value: string) => void
}) {
  // Build menu options dynamically based on WIP status
  const menuOptions = []

  if (hasWIP) {
    menuOptions.push({
      label: '⟳ Resume Project (Work in Progress)',
      value: 'resume',
    })
  }

  menuOptions.push(
    { label: 'Start a new project planning session', value: 'new' },
    { label: 'Load an existing project', value: 'existing' },
  )

  // Compute active chat info for status bar
  let activeChat: ActiveChatInfo | undefined
  const newProjectWIP = getNewProjectInProgress()
  const activeExisting = getActiveExistingProject()

  if (newProjectWIP?.projectName) {
    activeChat = {
      projectName: newProjectWIP.projectName,
      type: 'new',
    }
  } else if (activeExisting) {
    activeChat = {
      projectName: activeExisting.name,
      type: 'existing',
    }
  }

  return (
    <Box flexDirection="column" width="100%">
      <Box padding={1} flexDirection="column">
        <Box marginBottom={1}>
          <Text bold>Lachesis Project Foundations Studio</Text>
        </Box>
        <Select
          label="What would you like to do?"
          options={menuOptions}
          onSelect={onMenuSelect}
        />
        <Box marginTop={1}>
          <Text dimColor>
            Use ↑/↓ to choose, Enter to confirm. [s] settings{debug ? ' [m] test MCP' : ''}. [ESC]/[Q] quit.
          </Text>
        </Box>
      </Box>
      <StatusBar
        config={config}
        aiStatus={aiStatus}
        mcpStatus={debug ? mcpStatus : undefined}
        showSettingsHint={settingsHotkeyEnabled}
        activeChat={activeChat}
      />
    </Box>
  )
}
