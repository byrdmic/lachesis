import React, { useCallback, useEffect, useState } from 'react'
import { useApp, useInput } from 'ink'
import type { LachesisConfig } from '../../config/types.ts'
import { updateConfig } from '../../config/config.ts'
import type { AIStatusDescriptor } from '../components/StatusBar.tsx'
import { SettingsPanel } from '../components/index.ts'
import { NewProjectFlow } from '../NewProject/index.tsx'
import { ExistingProjectFlow } from '../ExistingProject/index.tsx'
import {
  hasNewProjectInProgress,
  clearNewProjectInProgress,
} from '../../core/conversation-store.ts'
import { debugLog } from '../../debug/logger.ts'
import { assertNever } from '../../utils/type-guards.ts'
import { LauncherMenuView } from './LauncherMenuView.tsx'
import { ConfirmNewProjectDialog } from './ConfirmNewProjectDialog.tsx'

// ============================================================================
// Types
// ============================================================================

type ProjectLauncherProps = {
  config: LachesisConfig
  debug?: boolean
  onDebugHotkeysChange?: (enabled: boolean) => void
}

type LauncherState =
  | { step: 'menu' }
  | { step: 'new'; resuming: boolean }
  | { step: 'existing' }
  | { step: 'confirm_new_project' }

// ============================================================================
// Component
// ============================================================================

export function ProjectLauncher({
  config: initialConfig,
  debug = false,
  onDebugHotkeysChange,
}: ProjectLauncherProps) {
  const { exit } = useApp()

  // State
  const [config, setConfig] = useState<LachesisConfig>(initialConfig)
  const [state, setState] = useState<LauncherState>({ step: 'menu' })
  const [showSettings, setShowSettings] = useState(false)
  const [hasWIP, setHasWIP] = useState(() => hasNewProjectInProgress())

  // Derived state
  const settingsHotkeyEnabled = !showSettings && state.step === 'menu'
  const aiStatus: AIStatusDescriptor = { state: 'idle', message: 'Ready' }

  // ============================================================================
  // Effects
  // ============================================================================

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

  // ============================================================================
  // Handlers
  // ============================================================================

  const handleSettingsSave = useCallback(
    (updates: Partial<LachesisConfig>) => {
      const newConfig = { ...config, ...updates }
      setConfig(newConfig)
      updateConfig(updates)
    },
    [config],
  )

  const handleMenuSelect = useCallback(
    (value: string) => {
      switch (value) {
        case 'resume':
          setState({ step: 'new', resuming: true })
          break
        case 'new':
          if (hasWIP) {
            setState({ step: 'confirm_new_project' })
          } else {
            setState({ step: 'new', resuming: false })
          }
          break
        case 'existing':
          setState({ step: 'existing' })
          break
      }
    },
    [hasWIP],
  )

  const handleConfirmNewProject = useCallback(() => {
    clearNewProjectInProgress()
    setHasWIP(false)
    setState({ step: 'new', resuming: false })
  }, [])

  const handleBackToMenu = useCallback(() => {
    setState({ step: 'menu' })
  }, [])

  // ============================================================================
  // Input Handling
  // ============================================================================

  useInput(
    (input, key) => {
      const lower = input.toLowerCase()

      if (key.escape || (key.shift && lower === 'q')) {
        exit()
        return
      }

      if (lower === 's' && state.step === 'menu' && !showSettings) {
        setShowSettings(true)
        return
      }
    },
    { isActive: state.step === 'menu' && !showSettings },
  )

  // ============================================================================
  // Render
  // ============================================================================

  // Overlay: Settings panel
  if (showSettings) {
    return (
      <SettingsPanel
        config={config}
        onSave={handleSettingsSave}
        onClose={() => setShowSettings(false)}
      />
    )
  }

  // Step renderer
  const renderStep = (): React.ReactNode => {
    switch (state.step) {
      case 'menu':
        return (
          <LauncherMenuView
            config={config}
            hasWIP={hasWIP}
            debug={debug}
            aiStatus={aiStatus}
            settingsHotkeyEnabled={settingsHotkeyEnabled}
            onMenuSelect={handleMenuSelect}
          />
        )

      case 'confirm_new_project':
        return (
          <ConfirmNewProjectDialog
            config={config}
            aiStatus={aiStatus}
            onConfirm={handleConfirmNewProject}
            onCancel={handleBackToMenu}
          />
        )

      case 'existing':
        return (
          <ExistingProjectFlow
            config={config}
            debug={debug}
            onBack={handleBackToMenu}
            onDebugHotkeysChange={onDebugHotkeysChange}
          />
        )

      case 'new':
        return (
          <NewProjectFlow
            config={config}
            debug={debug}
            resuming={state.resuming}
            onExit={handleBackToMenu}
            onDebugHotkeysChange={onDebugHotkeysChange}
          />
        )

      default:
        return assertNever(state)
    }
  }

  return renderStep()
}
