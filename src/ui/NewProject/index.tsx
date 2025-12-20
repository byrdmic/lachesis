import React, { useState, useCallback, useEffect } from 'react'
import { Box, Text, useApp, useInput } from 'ink'
import { basename } from 'path'
import type { LachesisConfig } from '../../config/types.ts'
import type { PlanningLevel, SessionLogEntry } from '../../core/project/types.ts'
import type { Answer } from '../../core/interview/types.ts'
import type { ConversationMessage, ExtractedProjectData } from '../../ai/client.ts'
import type { StoredConversationState } from './ConversationPhase.tsx'
import type { AIStatusDescriptor } from '../components/StatusBar.tsx'
import { ConversationPhase } from './ConversationPhase.tsx'
import { SessionConversationPhase } from './SessionConversationPhase.tsx'
import { FinalizePhase } from './FinalizePhase.tsx'
import { StatusBar, SettingsPanel } from '../components/index.ts'
import { updateConfig } from '../../config/config.ts'
import { debugLog } from '../../debug/logger.ts'
import {
  getNewProjectInProgress,
  saveNewProjectInProgress,
  clearNewProjectInProgress,
} from '../../core/conversation-store.ts'
import { assertNever } from '../../utils/type-guards.ts'
import { WelcomeScreen } from './WelcomeScreen.tsx'
import { ConversationChoiceScreen } from './ConversationChoiceScreen.tsx'
import { QuickCapturePhase } from './QuickCapturePhase.tsx'
import { ExistingProjectFlow } from '../ExistingProject/index.tsx'

// ============================================================================
// Feature Flags
// ============================================================================

// Set to true to use the new session-based conversation system
// The session system enables CLI testing and separates UI from business logic
const USE_SESSION_CONVERSATION = false

// ============================================================================
// Types
// ============================================================================

type NewProjectFlowProps = {
  config: LachesisConfig
  debug?: boolean
  resuming?: boolean
  onExit?: () => void
  onDebugHotkeysChange?: (enabled: boolean) => void
}

type FlowState =
  | { step: 'welcome' }
  | { step: 'conversation_choice'; planningLevel: PlanningLevel; projectName: string; oneLiner: string }
  | { step: 'conversation'; planningLevel: PlanningLevel; projectName: string; oneLiner: string }
  | { step: 'quick_capture'; planningLevel: PlanningLevel; projectName: string; oneLiner: string }
  | { step: 'finalize'; planningLevel: PlanningLevel; projectName: string; oneLiner: string; extractedData?: ExtractedProjectData; conversationLog: ConversationMessage[]; answers?: Map<string, Answer>; sessionLog?: SessionLogEntry[] }
  | { step: 'complete'; projectPath: string; projectName: string }
  | { step: 'loading_project'; projectPath: string; projectName: string }
  | { step: 'cancelled' }

// ============================================================================
// Component
// ============================================================================

export function NewProjectFlow({
  config: initialConfig,
  debug = false,
  resuming = false,
  onExit,
  onDebugHotkeysChange,
}: NewProjectFlowProps) {
  const { exit } = useApp()

  // ============================================================================
  // State
  // ============================================================================

  const [state, setState] = useState<FlowState>(() => initializeState(resuming))
  const [savedConversationState, setSavedConversationState] = useState<StoredConversationState | null>(
    () => initializeSavedConversation(resuming)
  )
  const [showSettings, setShowSettings] = useState(false)
  const [config, setConfig] = useState<LachesisConfig>(initialConfig)
  const [aiStatus, setAIStatus] = useState<AIStatusDescriptor>({ state: 'idle', message: 'Ready' })
  const [inputLocked, setInputLocked] = useState(false)

  // Derived state
  const settingsHotkeyEnabled = !inputLocked && !showSettings && state.step !== 'complete' && state.step !== 'cancelled'

  // ============================================================================
  // Callbacks
  // ============================================================================

  const notifyDebugHotkeys = useCallback(
    (enabled: boolean) => onDebugHotkeysChange?.(enabled),
    [onDebugHotkeysChange],
  )

  const renderWithStatusBar = useCallback(
    (content: React.ReactNode, showSettingsHint = settingsHotkeyEnabled) => (
      <Box flexDirection="column" width="100%">
        <Box flexDirection="column">{content}</Box>
        <StatusBar config={config} aiStatus={aiStatus} showSettingsHint={showSettingsHint} />
      </Box>
    ),
    [aiStatus, config, settingsHotkeyEnabled],
  )

  // ============================================================================
  // Effects
  // ============================================================================

  // Log state changes in debug mode
  useEffect(() => {
    if (debug) {
      debugLog.debug('Flow state changed', { step: state.step })
    }
    notifyDebugHotkeys(false)
  }, [state.step, debug, notifyDebugHotkeys])

  // Update AI status based on step
  useEffect(() => {
    const statusMap: Partial<Record<FlowState['step'], AIStatusDescriptor>> = {
      welcome: { state: 'idle', message: 'Ready' },
      conversation_choice: { state: 'idle', message: 'Ready for planning' },
      quick_capture: { state: 'idle', message: 'Ready for planning' },
      finalize: { state: 'idle', message: 'Ready to scaffold' },
      complete: { state: 'idle', message: 'Finished' },
      cancelled: { state: 'idle', message: 'Session ended' },
    }

    const status = statusMap[state.step]
    if (status) {
      setAIStatus(status)
    } else if (state.step === 'conversation' && !savedConversationState) {
      setAIStatus({ state: 'idle', message: 'Starting conversation' })
    }
  }, [state.step, savedConversationState])

  // ============================================================================
  // Handlers
  // ============================================================================

  const handleSettingsSave = useCallback(
    (updates: Partial<LachesisConfig>) => {
      setConfig({ ...config, ...updates })
      updateConfig(updates)
    },
    [config],
  )

  const handleStart = useCallback(() => {
    setState({
      step: 'conversation',
      planningLevel: 'Not provided yet - ask during planning',
      projectName: '',
      oneLiner: '',
    })
  }, [])

  const handleConversationChoice = useCallback(
    (choice: 'conversation' | 'quick_capture', currentState: FlowState) => {
      if (currentState.step !== 'conversation_choice') return
      setState({
        step: choice,
        planningLevel: currentState.planningLevel,
        projectName: currentState.projectName,
        oneLiner: currentState.oneLiner,
      })
    },
    [],
  )

  const handleConversationComplete = useCallback(
    (
      extractedData: ExtractedProjectData,
      conversationLog: ConversationMessage[],
      selectedProjectName: string,
      oneLiner: string,
      planningLevel: PlanningLevel,
    ) => {
      const extractedOneLiner = extractedData?.vision?.oneLinePitch?.trim() ?? ''
      setState({
        step: 'finalize',
        planningLevel: planningLevel?.trim() || 'Captured during planning',
        projectName: selectedProjectName.trim() || extractedOneLiner || 'Untitled Project',
        oneLiner: oneLiner.trim() || extractedOneLiner || 'Not provided yet',
        extractedData,
        conversationLog,
      })
    },
    [],
  )

  const handleQuickCaptureComplete = useCallback(
    (extractedData: ExtractedProjectData, projectName: string, oneLiner: string, planningLevel: PlanningLevel) => {
      setState({
        step: 'finalize',
        planningLevel,
        projectName,
        oneLiner,
        extractedData,
        conversationLog: [],
      })
    },
    [],
  )

  const handleFinalizeComplete = useCallback((projectPath: string) => {
    clearNewProjectInProgress()
    setSavedConversationState(null)
    // Extract project name from the path (folder name)
    const projectName = basename(projectPath)
    setState({ step: 'complete', projectPath, projectName })
  }, [])

  const handleCancel = useCallback(() => {
    if (onExit) {
      onExit()
      return
    }
    setState({ step: 'cancelled' })
    setTimeout(() => exit(), 500)
  }, [exit, onExit])

  const handleConversationStateChange = useCallback(
    (conversationState: StoredConversationState) => {
      if (state.step !== 'conversation') return
      setSavedConversationState(conversationState)
      saveNewProjectInProgress({
        conversationState,
        planningLevel: state.planningLevel,
        projectName: state.projectName,
        oneLiner: state.oneLiner,
      })
    },
    [state],
  )

  // ============================================================================
  // Input Handling
  // ============================================================================

  useInput(
    (input, key) => {
      if (input.toLowerCase() === 's' && !showSettings && state.step !== 'complete' && state.step !== 'cancelled' && state.step !== 'loading_project') {
        setShowSettings(true)
      }
      if (key.escape && state.step !== 'loading_project') {
        handleCancel()
      }
      // Handle Enter on complete screen to load the created project
      if (key.return && state.step === 'complete') {
        setState({ step: 'loading_project', projectPath: state.projectPath, projectName: state.projectName })
      }
    },
    { isActive: !inputLocked },
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
      case 'welcome':
        return <WelcomeScreen config={config} aiStatus={aiStatus} onStart={handleStart} />

      case 'conversation_choice':
        return renderWithStatusBar(
          <ConversationChoiceScreen
            projectName={state.projectName}
            onChoice={(choice) => handleConversationChoice(choice, state)}
          />,
        )

      case 'conversation':
        // Use session-based conversation if feature flag is enabled
        if (USE_SESSION_CONVERSATION) {
          return renderWithStatusBar(
            <SessionConversationPhase
              config={config}
              planningLevel={state.planningLevel}
              projectName={state.projectName}
              oneLiner={state.oneLiner}
              debug={debug}
              sessionKind="new"
              onInputModeChange={setInputLocked}
              onAIStatusChange={setAIStatus}
              onDebugHotkeysChange={notifyDebugHotkeys}
              onShowSettings={() => setShowSettings(true)}
              onComplete={(extractedData, conversationLog, selectedProjectName) =>
                handleConversationComplete(extractedData, conversationLog, selectedProjectName, state.oneLiner, state.planningLevel)
              }
              onCancel={handleCancel}
            />,
          )
        }

        // Original ConversationPhase
        return renderWithStatusBar(
          <ConversationPhase
            config={config}
            planningLevel={state.planningLevel}
            projectName={state.projectName}
            oneLiner={state.oneLiner}
            debug={debug}
            sessionKind="new"
            initialState={savedConversationState ?? undefined}
            onInputModeChange={setInputLocked}
            onAIStatusChange={setAIStatus}
            onDebugHotkeysChange={notifyDebugHotkeys}
            onShowSettings={() => setShowSettings(true)}
            onStateChange={handleConversationStateChange}
            onComplete={(extractedData, conversationLog, selectedProjectName) =>
              handleConversationComplete(extractedData, conversationLog, selectedProjectName, state.oneLiner, state.planningLevel)
            }
            onCancel={handleCancel}
          />,
        )

      case 'quick_capture':
        return renderWithStatusBar(
          <QuickCapturePhase
            projectName={state.projectName}
            oneLiner={state.oneLiner}
            onComplete={(extractedData) =>
              handleQuickCaptureComplete(extractedData, state.projectName, state.oneLiner, state.planningLevel)
            }
          />,
        )

      case 'finalize':
        return renderWithStatusBar(
          <FinalizePhase
            config={config}
            planningLevel={state.planningLevel}
            projectName={state.projectName}
            oneLiner={state.oneLiner}
            extractedData={state.extractedData}
            conversationLog={state.conversationLog}
            answers={state.answers}
            sessionLog={state.sessionLog}
            onComplete={handleFinalizeComplete}
            onCancel={handleCancel}
          />,
        )

      case 'complete':
        return (
          <Box flexDirection="column" padding={1} height="100%" width="100%">
            <Text color="green" bold>Project created successfully!</Text>
            <Text>{'\n'}</Text>
            <Text>Your project has been scaffolded at:</Text>
            <Text color="cyan">{state.projectPath}</Text>
            <Text>{'\n'}</Text>
            <Text dimColor>Press Enter to continue to your project, or Esc to exit.</Text>
          </Box>
        )

      case 'loading_project':
        return (
          <ExistingProjectFlow
            config={config}
            debug={debug}
            onBack={handleCancel}
            onDebugHotkeysChange={onDebugHotkeysChange}
          />
        )

      case 'cancelled':
        return (
          <Box padding={1} height="100%" width="100%">
            <Text dimColor>Session cancelled.</Text>
          </Box>
        )

      default:
        return assertNever(state)
    }
  }

  return renderStep()
}

// ============================================================================
// Helper Functions
// ============================================================================

function initializeState(resuming: boolean): FlowState {
  if (resuming) {
    const saved = getNewProjectInProgress()
    if (saved && saved.conversationState.messages.length > 0) {
      return {
        step: 'conversation',
        planningLevel: saved.planningLevel as PlanningLevel,
        projectName: saved.projectName,
        oneLiner: saved.oneLiner,
      }
    }
  }
  return { step: 'welcome' }
}

function initializeSavedConversation(resuming: boolean): StoredConversationState | null {
  if (resuming) {
    const saved = getNewProjectInProgress()
    return saved?.conversationState ?? null
  }
  return null
}
