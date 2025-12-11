import React, { useState, useCallback, useEffect } from 'react'
import { Box, Text, useApp, useInput } from 'ink'
import Spinner from 'ink-spinner'
import type { LachesisConfig } from '../../config/types.ts'
import type { Answer } from '../../core/interview/types.ts'
import type { PlanningLevel, SessionLogEntry } from '../../core/project/types.ts'
import type {
  ConversationMessage,
  ExtractedProjectData,
} from '../../ai/client.ts'
import { ConversationPhase } from './ConversationPhase.tsx'
import { FinalizePhase } from './FinalizePhase.tsx'
import { StatusBar, SettingsPanel } from '../components/index.ts'
import { updateConfig } from '../../config/config.ts'
import { debugLog } from '../../debug/logger.ts'
import type { AIStatusDescriptor } from '../components/StatusBar.tsx'

type NewProjectFlowProps = {
  config: LachesisConfig
  debug?: boolean
  onExit?: () => void
  onDebugHotkeysChange?: (enabled: boolean) => void
}

type FlowState =
  | { step: 'welcome' }
  | {
      step: 'conversation_choice'
      planningLevel: PlanningLevel
      projectName: string
      oneLiner: string
    }
  | {
      step: 'conversation'
      planningLevel: PlanningLevel
      projectName: string
      oneLiner: string
    }
  | {
      step: 'quick_capture'
      planningLevel: PlanningLevel
      projectName: string
      oneLiner: string
    }
  | {
      step: 'finalize'
      planningLevel: PlanningLevel
      projectName: string
      oneLiner: string
      extractedData?: ExtractedProjectData
      conversationLog: ConversationMessage[]
      // Legacy support
      answers?: Map<string, Answer>
      sessionLog?: SessionLogEntry[]
    }
  | { step: 'complete'; projectPath: string }
  | { step: 'cancelled' }

export function NewProjectFlow({
  config: initialConfig,
  debug = false,
  onExit,
  onDebugHotkeysChange,
}: NewProjectFlowProps) {
  const { exit } = useApp()
  const [state, setState] = useState<FlowState>({ step: 'welcome' })
  const [showSettings, setShowSettings] = useState(false)
  const [config, setConfig] = useState<LachesisConfig>(initialConfig)
  const [aiStatus, setAIStatus] = useState<AIStatusDescriptor>({
    state: 'idle',
    message: 'Ready',
  })
  const [inputLocked, setInputLocked] = useState(false)
  const settingsHotkeyEnabled =
    !inputLocked && !showSettings && state.step !== 'complete' && state.step !== 'cancelled'
  const notifyDebugHotkeys = useCallback(
    (enabled: boolean) => onDebugHotkeysChange?.(enabled),
    [onDebugHotkeysChange],
  )
  const renderWithStatusBar = useCallback(
    (content: React.ReactNode, showSettingsHint = settingsHotkeyEnabled) => (
      <Box flexDirection="column" height="100%" width="100%">
        <StatusBar
          config={config}
          aiStatus={aiStatus}
          showSettingsHint={showSettingsHint}
        />
        <Box flexDirection="column" flexGrow={1} minHeight={0}>
          {content}
        </Box>
      </Box>
    ),
    [aiStatus, config, settingsHotkeyEnabled],
  )

  // Log state changes in debug mode
  useEffect(() => {
    if (debug) {
      debugLog.debug('Flow state changed', { step: state.step })
    }
    // Disable debug hotkeys unless explicitly enabled by a phase (e.g., menu mode)
    notifyDebugHotkeys(false)
  }, [state.step, debug, notifyDebugHotkeys])

  // Reflect high-level AI status by flow step (more detailed updates come from child phases)
  useEffect(() => {
    switch (state.step) {
      case 'welcome':
        setAIStatus({ state: 'idle', message: 'Ready' })
        break
      case 'conversation':
        setAIStatus({ state: 'streaming', message: 'Preparing first planning message' })
        break
      case 'conversation_choice':
      case 'quick_capture':
        setAIStatus({ state: 'idle', message: 'Ready for planning' })
        break
      case 'finalize':
        setAIStatus({ state: 'idle', message: 'Ready to scaffold' })
        break
      case 'complete':
        setAIStatus({ state: 'idle', message: 'Finished' })
        break
      case 'cancelled':
        setAIStatus({ state: 'idle', message: 'Session ended' })
        break
      default:
        break
    }
  }, [state])

  // Handle 's' key to open settings (except during AI check)
  useInput(
    (input, key) => {
      if (
        input.toLowerCase() === 's' &&
        !showSettings &&
        state.step !== 'complete' &&
        state.step !== 'cancelled'
      ) {
        setShowSettings(true)
      }
      if (key.escape) {
        handleCancel()
      }
    },
    { isActive: !inputLocked },
  )

  // Handle settings save
  const handleSettingsSave = useCallback(
    (updates: Partial<LachesisConfig>) => {
      const newConfig = { ...config, ...updates }
      setConfig(newConfig)
      updateConfig(updates)
    },
    [config],
  )

  // Start AI check after welcome
  const handleStart = useCallback(() => {
    setState({
      step: 'conversation',
      planningLevel: 'Not provided yet - ask during planning',
      projectName: '',
      oneLiner: '',
    })
  }, [])

  // Handle conversation mode choice
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

  // Handle conversation completion (AI planning chat)
  const handleConversationComplete = useCallback(
    (
      extractedData: ExtractedProjectData,
      conversationLog: ConversationMessage[],
      projectName: string,
      oneLiner: string,
      planningLevel: PlanningLevel,
    ) => {
      const extractedOneLiner = extractedData?.vision?.oneLinePitch?.trim() ?? ''
      const nextProjectName =
        projectName.trim() || extractedOneLiner || 'Untitled Project'
      const nextOneLiner =
        oneLiner.trim() || extractedOneLiner || 'Not provided yet'
      const nextPlanningLevel =
        planningLevel?.trim() || 'Captured during planning'

      setState({
        step: 'finalize',
        planningLevel: nextPlanningLevel,
        projectName: nextProjectName,
        oneLiner: nextOneLiner,
        extractedData,
        conversationLog,
      })
    },
    [],
  )

  // Handle quick capture completion
  const handleQuickCaptureComplete = useCallback(
    (
      extractedData: ExtractedProjectData,
      projectName: string,
      oneLiner: string,
      planningLevel: PlanningLevel,
    ) => {
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

  // Handle finalization complete
  const handleFinalizeComplete = useCallback((projectPath: string) => {
    setState({ step: 'complete', projectPath })
  }, [])

  // Handle cancellation
  const handleCancel = useCallback(() => {
    if (onExit) {
      onExit()
      return
    }
    setState({ step: 'cancelled' })
    setTimeout(() => exit(), 500)
  }, [exit, onExit])

  // Show settings panel overlay
  if (showSettings) {
    return (
      <SettingsPanel
        config={config}
        onSave={handleSettingsSave}
        onClose={() => setShowSettings(false)}
      />
    )
  }

  // Render based on state
  if (state.step === 'welcome') {
    return (
      <WelcomeScreen onStart={handleStart} config={config} aiStatus={aiStatus} />
    )
  }

  if (state.step === 'conversation_choice') {
    return (
      renderWithStatusBar(
        <ConversationChoiceScreen
          projectName={state.projectName}
          onChoice={(choice) => handleConversationChoice(choice, state)}
        />,
      )
    )
  }

  if (state.step === 'conversation') {
    return (
      renderWithStatusBar(
        <ConversationPhase
          config={config}
          planningLevel={state.planningLevel}
          projectName={state.projectName}
          oneLiner={state.oneLiner}
          debug={debug}
          sessionKind="new"
          onInputModeChange={setInputLocked}
          onAIStatusChange={setAIStatus}
          onDebugHotkeysChange={notifyDebugHotkeys}
          onComplete={(extractedData, conversationLog) =>
            handleConversationComplete(
              extractedData,
              conversationLog,
              state.projectName,
              state.oneLiner,
              state.planningLevel,
            )
          }
          onCancel={handleCancel}
        />,
      )
    )
  }

  if (state.step === 'quick_capture') {
    return (
      renderWithStatusBar(
        <QuickCapturePhase
          config={config}
          projectName={state.projectName}
          oneLiner={state.oneLiner}
          onComplete={(extractedData) =>
            handleQuickCaptureComplete(
              extractedData,
              state.projectName,
              state.oneLiner,
              state.planningLevel,
            )
          }
          onCancel={handleCancel}
        />,
      )
    )
  }

  if (state.step === 'finalize') {
    return (
      renderWithStatusBar(
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
    )
  }

  if (state.step === 'complete') {
    return (
      <Box flexDirection="column" padding={1} height="100%" width="100%">
        <Text color="green" bold>
          Project created successfully!
        </Text>
        <Text>{'\n'}</Text>
        <Text>Your project has been scaffolded at:</Text>
        <Text color="cyan">{state.projectPath}</Text>
        <Text>{'\n'}</Text>
        <Text dimColor>Open it in Obsidian to continue.</Text>
      </Box>
    )
  }

  if (state.step === 'cancelled') {
    return (
      <Box padding={1} height="100%" width="100%">
        <Text dimColor>Session cancelled.</Text>
      </Box>
    )
  }

  return null
}

// ============================================================================
// Sub-components
// ============================================================================

function WelcomeScreen({
  onStart,
  config,
  aiStatus,
}: {
  onStart: () => void
  config: LachesisConfig
  aiStatus: AIStatusDescriptor
}) {
  useEffect(() => {
    const timer = setTimeout(onStart, 100)
    return () => clearTimeout(timer)
  }, [onStart])

  return (
    <Box flexDirection="column" height="100%" width="100%">
      <StatusBar config={config} aiStatus={aiStatus} />
      <Box flexDirection="column" padding={1} flexGrow={1}>
        <Box
          borderStyle="double"
          borderColor="cyan"
          paddingX={3}
          paddingY={1}
          marginBottom={1}
        >
          <Text color="cyan" bold>
            Lachesis Project Foundations Studio
          </Text>
        </Box>
        <Text>Welcome. Let's shape your idea into a structured project.</Text>
      </Box>
    </Box>
  )
}

export function AIConnectionCheck({
  config,
  checking,
  error,
  showSettingsHint = true,
  aiStatus,
  onConnected,
  onError,
}: {
  config: LachesisConfig
  checking: boolean
  error?: string
  showSettingsHint?: boolean
  aiStatus?: AIStatusDescriptor
  onConnected: () => void
  onError: (error: string) => void
}) {
  return (
    <Box flexDirection="column" height="100%" width="100%">
      <StatusBar
        config={config}
        aiStatus={aiStatus}
        showSettingsHint={showSettingsHint}
      />
      <Box flexDirection="column" padding={1} flexGrow={1}>
        <Box
          borderStyle="double"
          borderColor="cyan"
          paddingX={3}
          paddingY={1}
          marginBottom={1}
        >
          <Text color="cyan" bold>
            Lachesis Project Foundations Studio
          </Text>
        </Box>

        {checking ? (
          <Box>
            <Text color="cyan">
              <Spinner type="dots" />
            </Text>
            <Text> Connecting to AI...</Text>
          </Box>
        ) : error ? (
          <Box flexDirection="column">
            <Text color="red">AI connection failed:</Text>
            <Text color="red">{error}</Text>
            <Text>{'\n'}</Text>
            <Text dimColor>
              Press [S] for settings, [R] to retry, or [Q] to quit
            </Text>
          </Box>
        ) : null}
      </Box>
    </Box>
  )
}

function ConversationChoiceScreen({
  projectName,
  onChoice,
}: {
  projectName: string
  onChoice: (choice: 'conversation' | 'quick_capture') => void
}) {
  const [selected, setSelected] = useState(0)
  const options = [
    {
      label: 'AI-guided planning chat',
      value: 'conversation' as const,
      desc: 'Have a conversation to explore and plan your idea',
    },
    {
      label: 'Quick capture',
      value: 'quick_capture' as const,
      desc: 'Fill in key fields directly',
    },
  ]

  useInput((input, key) => {
    if (key.upArrow) {
      setSelected((s) => (s > 0 ? s - 1 : s))
    }
    if (key.downArrow) {
      setSelected((s) => (s < options.length - 1 ? s + 1 : s))
    }
    if (key.return) {
      const opt = options[selected]
      if (opt) {
        onChoice(opt.value)
      }
    }
  })

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold>You have a well-defined idea for "{projectName}"</Text>
      <Text dimColor>How would you like to proceed?</Text>
      <Text>{'\n'}</Text>

      {options.map((opt, i) => (
        <Box key={opt.value} flexDirection="column" marginBottom={1}>
          <Text color={i === selected ? 'cyan' : undefined}>
            {i === selected ? '❯ ' : '  '}
            {opt.label}
          </Text>
          <Text dimColor> {opt.desc}</Text>
        </Box>
      ))}
    </Box>
  )
}

// Placeholder for QuickCapturePhase - will implement if needed
function QuickCapturePhase({
  config,
  projectName,
  oneLiner,
  onComplete,
  onCancel,
}: {
  config: LachesisConfig
  projectName: string
  oneLiner: string
  onComplete: (data: ExtractedProjectData) => void
  onCancel: () => void
}) {
  // TODO: Implement quick capture form
  // For now, create minimal data and proceed
  useEffect(() => {
    const minimalData: ExtractedProjectData = {
      vision: {
        oneLinePitch: oneLiner,
        description: oneLiner,
        primaryAudience: 'To be defined',
        problemSolved: 'To be defined',
        successCriteria: 'To be defined',
      },
      constraints: {
        known: [],
        assumptions: [],
        risks: [],
        antiGoals: [],
      },
      execution: {},
    }
    // Auto-complete for now - can enhance later
    setTimeout(() => onComplete(minimalData), 100)
  }, [oneLiner, onComplete])

  return (
    <Box flexDirection="column" padding={1}>
      <Text>Quick capture for {projectName}...</Text>
    </Box>
  )
}
