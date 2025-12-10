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
import { testAIConnection } from '../../ai/client.ts'
import { InterviewPhase } from './InterviewPhase.tsx'
import { FinalizePhase } from './FinalizePhase.tsx'
import { StatusBar, SettingsPanel } from '../components/index.ts'
import { updateConfig } from '../../config/config.ts'
import { debugLog } from '../../debug/logger.ts'

type NewProjectFlowProps = {
  config: LachesisConfig
  debug?: boolean
}

type FlowState =
  | { step: 'welcome' }
  | { step: 'ai_check'; checking: boolean; error?: string }
  | {
      step: 'interview_choice'
      planningLevel: PlanningLevel
      projectName: string
      oneLiner: string
    }
  | {
      step: 'interview'
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
}: NewProjectFlowProps) {
  const { exit } = useApp()
  const [state, setState] = useState<FlowState>({ step: 'welcome' })
  const [showSettings, setShowSettings] = useState(false)
  const [config, setConfig] = useState<LachesisConfig>(initialConfig)
  const [inputLocked, setInputLocked] = useState(false)

  // Log state changes in debug mode
  useEffect(() => {
    if (debug) {
      debugLog.debug('Flow state changed', { step: state.step })
    }
  }, [state.step, debug])

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
      // Handle 'r' for retry during AI check error
      if (
        input.toLowerCase() === 'r' &&
        state.step === 'ai_check' &&
        state.error
      ) {
        setState({ step: 'ai_check', checking: true })
      }
      // Handle 'q' for quit during AI check error
      if (
        input.toLowerCase() === 'q' &&
        state.step === 'ai_check' &&
        state.error
      ) {
        setState({ step: 'cancelled' })
        setTimeout(() => exit(), 500)
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
    setState({ step: 'ai_check', checking: true })
  }, [])

  // Handle AI check completion
  const handleAICheckComplete = useCallback(() => {
    setState({
      step: 'interview',
      planningLevel: 'Not provided yet - ask during interview',
      projectName: '',
      oneLiner: '',
    })
  }, [])

  // Handle interview choice
  const handleInterviewChoice = useCallback(
    (choice: 'interview' | 'quick_capture', currentState: FlowState) => {
      if (currentState.step !== 'interview_choice') return

      setState({
        step: choice,
        planningLevel: currentState.planningLevel,
        projectName: currentState.projectName,
        oneLiner: currentState.oneLiner,
      })
    },
    [],
  )

  // Handle interview completion (AI conversation)
  const handleInterviewComplete = useCallback(
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
        planningLevel?.trim() || 'Captured during interview'

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
    setState({ step: 'cancelled' })
    setTimeout(() => exit(), 500)
  }, [exit])

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
    return <WelcomeScreen onStart={handleStart} config={config} />
  }

  if (state.step === 'ai_check') {
    return (
      <AIConnectionCheck
        config={config}
        checking={state.checking}
        error={state.error}
        onConnected={handleAICheckComplete}
        onError={(error) =>
          setState({ step: 'ai_check', checking: false, error })
        }
      />
    )
  }

  if (state.step === 'interview_choice') {
    return (
      <Box flexDirection="column">
        <StatusBar config={config} />
        <InterviewChoiceScreen
          projectName={state.projectName}
          onChoice={(choice) => handleInterviewChoice(choice, state)}
        />
      </Box>
    )
  }

  if (state.step === 'interview') {
    return (
      <Box flexDirection="column">
        <StatusBar config={config} />
        <InterviewPhase
          config={config}
          planningLevel={state.planningLevel}
          projectName={state.projectName}
          oneLiner={state.oneLiner}
          debug={debug}
          onInputModeChange={setInputLocked}
          onComplete={(extractedData, conversationLog) =>
            handleInterviewComplete(
              extractedData,
              conversationLog,
              state.projectName,
              state.oneLiner,
              state.planningLevel,
            )
          }
          onCancel={handleCancel}
        />
      </Box>
    )
  }

  if (state.step === 'quick_capture') {
    return (
      <Box flexDirection="column">
        <StatusBar config={config} />
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
        />
      </Box>
    )
  }

  if (state.step === 'finalize') {
    return (
      <Box flexDirection="column">
        <StatusBar config={config} />
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
        />
      </Box>
    )
  }

  if (state.step === 'complete') {
    return (
      <Box flexDirection="column" padding={1}>
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
      <Box padding={1}>
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
}: {
  onStart: () => void
  config: LachesisConfig
}) {
  useEffect(() => {
    const timer = setTimeout(onStart, 100)
    return () => clearTimeout(timer)
  }, [onStart])

  return (
    <Box flexDirection="column">
      <StatusBar config={config} />
      <Box flexDirection="column" padding={1}>
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
  onConnected,
  onError,
}: {
  config: LachesisConfig
  checking: boolean
  error?: string
  onConnected: () => void
  onError: (error: string) => void
}) {
  useEffect(() => {
    if (!checking) return

    let cancelled = false

    debugLog.info('Testing AI connection...')
    testAIConnection(config).then((result) => {
      if (cancelled) return

      if (result.connected) {
        debugLog.info('AI connection successful')
        onConnected()
      } else {
        debugLog.error('AI connection failed', result.error)
        onError(result.error || 'Connection failed')
      }
    })

    return () => {
      cancelled = true
    }
  }, [checking, config, onConnected, onError])

  return (
    <Box flexDirection="column">
      <StatusBar config={config} />
      <Box flexDirection="column" padding={1}>
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

function InterviewChoiceScreen({
  projectName,
  onChoice,
}: {
  projectName: string
  onChoice: (choice: 'interview' | 'quick_capture') => void
}) {
  const [selected, setSelected] = useState(0)
  const options = [
    {
      label: 'AI-guided interview',
      value: 'interview' as const,
      desc: 'Have a conversation to explore your idea',
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
