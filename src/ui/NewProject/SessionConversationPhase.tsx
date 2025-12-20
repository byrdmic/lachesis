// SessionConversationPhase - Session-based conversation component
// This is a refactored version of ConversationPhase that uses the session system

import React, { useState, useEffect, useCallback } from 'react'
import { Box, Text, useInput } from 'ink'
import Spinner from 'ink-spinner'
import type { LachesisConfig } from '../../config/types.ts'
import type { PlanningLevel } from '../../core/project/types.ts'
import type { ConversationMessage, ExtractedProjectData } from '../../ai/client.ts'
import type { ProjectNameSuggestion, SessionState } from '../../core/session/index.ts'
import { checkForTransitionPhrase } from '../../core/session/index.ts'
import { TextInput } from '../components/TextInput.tsx'
import { ConversationView } from '../components/ConversationView.tsx'
import { debugLog } from '../../debug/logger.ts'
import type { AIStatusDescriptor } from '../components/StatusBar.tsx'
import { useSession } from '../hooks/useSession.ts'

// ============================================================================
// Types
// ============================================================================

type SessionConversationPhaseProps = {
  config: LachesisConfig
  planningLevel: PlanningLevel
  projectName: string
  oneLiner: string
  debug?: boolean
  sessionKind?: 'new' | 'existing'
  projectContext?: string
  agenticEnabled?: boolean
  projectPath?: string
  onInputModeChange?: (typing: boolean) => void
  onAIStatusChange?: (status: AIStatusDescriptor) => void
  onDebugHotkeysChange?: (enabled: boolean) => void
  onShowSettings?: () => void
  onComplete: (
    extractedData: ExtractedProjectData,
    conversationLog: ConversationMessage[],
    selectedProjectName: string,
  ) => void
  onCancel: () => void
}

// ============================================================================
// Component
// ============================================================================

export function SessionConversationPhase({
  config,
  planningLevel,
  projectName,
  oneLiner,
  debug = false,
  sessionKind = 'new',
  projectContext,
  agenticEnabled = false,
  projectPath,
  onInputModeChange,
  onAIStatusChange,
  onDebugHotkeysChange,
  onShowSettings,
  onComplete,
  onCancel,
}: SessionConversationPhaseProps) {
  // ============================================================================
  // Session Hook
  // ============================================================================

  const {
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
    clearError,
  } = useSession({
    agenticEnabled,
    projectPath,
  })

  // ============================================================================
  // Local State
  // ============================================================================

  const [menuMode, setMenuMode] = useState(false)
  const [sessionCreated, setSessionCreated] = useState(false)

  // ============================================================================
  // Derived State
  // ============================================================================

  const messages = session?.messages ?? []
  const step = session?.step ?? 'idle'
  const nameSuggestions = session?.nameSuggestions ?? null
  const coveredTopics = session?.coveredTopics ?? []

  // Current display messages (with streaming text if any)
  const displayMessages = isStreaming && streamingText
    ? [...messages, { role: 'assistant' as const, content: streamingText, timestamp: 'streaming' }]
    : messages

  // ============================================================================
  // Effects
  // ============================================================================

  // Create session and generate first question on mount
  useEffect(() => {
    if (!sessionCreated) {
      setSessionCreated(true)
      const initSession = async () => {
        debugLog.info('SessionConversationPhase: Creating session', {
          planningLevel,
          projectName,
          sessionKind,
        })

        try {
          await createSession({
            type: sessionKind === 'existing' ? 'existing_project' : 'new_project',
            planningLevel,
            projectName,
            oneLiner,
            projectPath,
          })

          // Generate first question after session is created
          await generateFirstQuestion()
        } catch (err) {
          debugLog.error('SessionConversationPhase: Failed to create session', { error: err })
        }
      }
      initSession()
    }
  }, [sessionCreated, createSession, generateFirstQuestion, planningLevel, projectName, oneLiner, sessionKind, projectPath])

  // Lock parent input
  useEffect(() => {
    onInputModeChange?.(true)
    return () => onInputModeChange?.(false)
  }, [onInputModeChange])

  // Enable debug hotkeys when not actively typing
  useEffect(() => {
    onDebugHotkeysChange?.(step !== 'waiting_for_answer')
    return () => onDebugHotkeysChange?.(false)
  }, [onDebugHotkeysChange, step])

  // Update AI status
  useEffect(() => {
    if (!onAIStatusChange) return

    const statusMap: Record<string, AIStatusDescriptor> = {
      idle: { state: 'idle', message: 'Ready' },
      generating_question: { state: 'streaming', message: 'Thinking...' },
      waiting_for_answer: { state: 'waiting', message: 'Waiting for your reply' },
      generating_names: { state: 'processing', message: 'Generating name suggestions' },
      naming_project: { state: 'idle', message: 'Choose a project name' },
      extracting_data: { state: 'processing', message: 'Structuring your project notes' },
      ready_to_scaffold: { state: 'idle', message: 'Ready to create project' },
      error: { state: 'error', message: error || 'Issue talking to AI' },
    }

    const status = statusMap[step]
    if (status) {
      onAIStatusChange(status)
    }
  }, [onAIStatusChange, step, error])

  // ============================================================================
  // Handlers
  // ============================================================================

  const handleUserAnswer = useCallback(
    async (answer: string) => {
      debugLog.info('SessionConversationPhase: User answer received', {
        length: answer.length,
      })

      await sendMessage(answer)

      // Check if AI wants to transition to naming phase
      // Get the last assistant message after sending
      const updatedSession = session
      if (updatedSession) {
        const lastAssistant = [...updatedSession.messages].reverse().find((m) => m.role === 'assistant')
        if (lastAssistant && checkForTransitionPhrase(lastAssistant.content)) {
          debugLog.info('SessionConversationPhase: Transition phrase detected')
          await requestNameSuggestions()
        }
      }
    },
    [sendMessage, session, requestNameSuggestions],
  )

  const handleNameSelected = useCallback(
    async (name: string, isCustomInput = false) => {
      debugLog.info('SessionConversationPhase: Name selected', { name, isCustomInput })

      await selectProjectName(name, isCustomInput)
      await extractProjectData()

      // Get final session state and complete
      if (session?.extractedData && session?.selectedName) {
        onComplete(session.extractedData, session.messages, session.selectedName)
      }
    },
    [selectProjectName, extractProjectData, session, onComplete],
  )

  const handleRetry = useCallback(() => {
    clearError()
    generateFirstQuestion()
  }, [clearError, generateFirstQuestion])

  const handleClearConversation = useCallback(() => {
    // Recreate the session
    setSessionCreated(false)
  }, [])

  // ============================================================================
  // Input Handling
  // ============================================================================

  useInput(
    (input, key) => {
      const lower = input.toLowerCase()

      if (menuMode) {
        if (key.escape || key.return) {
          setMenuMode(false)
          return
        }
        if (lower === 's' && onShowSettings) {
          onShowSettings()
          return
        }
        if (lower === 'c') {
          handleClearConversation()
          return
        }
        if (lower === 'b') {
          onCancel()
          return
        }
      } else {
        if (key.escape) {
          setMenuMode(true)
          return
        }
      }
    },
    { isActive: true },
  )

  // ============================================================================
  // Render
  // ============================================================================

  // Error state
  if (step === 'error' || error) {
    return (
      <Box flexDirection="column" paddingX={1}>
        <ConversationView messages={displayMessages} />
        <Box flexDirection="column" marginTop={1}>
          <Text color="red">Error: {error}</Text>
          <Text>{'\n'}</Text>
          <Text dimColor>Press any key to retry, or Esc to cancel</Text>
          <RetryHandler onRetry={handleRetry} />
        </Box>
      </Box>
    )
  }

  // Loading/generating state
  if (step === 'generating_question' || step === 'extracting_data' || step === 'idle') {
    return (
      <Box flexDirection="column" paddingX={1}>
        <ConversationView messages={displayMessages} />
        <Box marginTop={1}>
          <Text color="cyan">
            <Spinner type="dots" />
          </Text>
          <Text>
            {' '}
            {step === 'extracting_data' ? 'Processing...' : 'Thinking...'}
          </Text>
        </Box>
      </Box>
    )
  }

  // Generating names state
  if (step === 'generating_names') {
    return (
      <Box flexDirection="column" paddingX={1}>
        <ConversationView messages={displayMessages} />
        <Box marginTop={1}>
          <Text color="cyan">
            <Spinner type="dots" />
          </Text>
          <Text> Generating name suggestions...</Text>
        </Box>
      </Box>
    )
  }

  // Naming project state
  if (step === 'naming_project' && nameSuggestions) {
    return (
      <Box flexDirection="column" paddingX={1}>
        <ConversationView messages={displayMessages} />
        <Box flexDirection="column" marginTop={1}>
          <ProjectNamingView
            suggestions={nameSuggestions}
            onSelect={handleNameSelected}
            menuMode={menuMode}
            onToggleMenu={() => setMenuMode((m) => !m)}
            onShowSettings={onShowSettings}
            onCancel={onCancel}
          />
        </Box>
      </Box>
    )
  }

  // Waiting for answer (default)
  return (
    <Box flexDirection="column" paddingX={1}>
      <ConversationView messages={displayMessages} />
      <Box flexDirection="column" marginTop={1}>
        <ChatInput onSubmit={handleUserAnswer} focus={!menuMode} />
        <Box marginTop={1}>
          {menuMode ? (
            <Box flexDirection="column">
              <Text color="cyan" bold>Menu</Text>
              <Text dimColor>
                {onShowSettings ? '[S] Settings  ' : ''}[C] Clear chat  [B] Back  [ESC/Enter] Resume
              </Text>
            </Box>
          ) : (
            <Text dimColor>[ESC] Menu</Text>
          )}
        </Box>
      </Box>
    </Box>
  )
}

// ============================================================================
// Sub-components
// ============================================================================

function ChatInput({
  onSubmit,
  focus = true,
}: {
  onSubmit: (value: string) => void
  focus?: boolean
}) {
  const [value, setValue] = useState('')

  const handleSubmit = (val: string) => {
    if (val.trim()) {
      onSubmit(val.trim())
      setValue('')
    }
  }

  return (
    <Box>
      <Text color="green">You: </Text>
      <TextInput
        label=""
        value={value}
        onChange={setValue}
        onSubmit={handleSubmit}
        placeholder="Type your response..."
        focus={focus}
      />
    </Box>
  )
}

function ProjectNamingView({
  suggestions,
  onSelect,
  menuMode,
  onToggleMenu,
  onShowSettings,
  onCancel,
}: {
  suggestions: ProjectNameSuggestion[]
  onSelect: (name: string, isCustomInput?: boolean) => void
  menuMode: boolean
  onToggleMenu: () => void
  onShowSettings?: () => void
  onCancel: () => void
}) {
  const [selected, setSelected] = useState(0)
  const [customMode, setCustomMode] = useState(false)
  const [customName, setCustomName] = useState('')

  const totalOptions = suggestions.length + 1

  useInput(
    (input, key) => {
      const lower = input.toLowerCase()
      if (key.escape || key.return) {
        onToggleMenu()
        return
      }
      if (lower === 's' && onShowSettings) {
        onShowSettings()
        return
      }
      if (lower === 'b') {
        onCancel()
        return
      }
    },
    { isActive: menuMode },
  )

  useInput(
    (input, key) => {
      if (customMode) {
        if (key.escape) {
          setCustomMode(false)
          setCustomName('')
        }
        return
      }

      if (key.upArrow || input === 'k') {
        setSelected((s) => (s > 0 ? s - 1 : s))
      }
      if (key.downArrow || input === 'j') {
        setSelected((s) => (s < totalOptions - 1 ? s + 1 : s))
      }
      if (key.return) {
        if (selected === suggestions.length) {
          setCustomMode(true)
        } else {
          const suggestion = suggestions[selected]
          if (suggestion) {
            onSelect(suggestion.name)
          }
        }
      }
      if (key.escape) {
        onToggleMenu()
      }
    },
    { isActive: !menuMode && !customMode },
  )

  const handleCustomSubmit = (value: string) => {
    if (value.trim()) {
      onSelect(value.trim(), true)
    }
  }

  if (menuMode) {
    return (
      <Box flexDirection="column">
        <Box flexDirection="column" marginBottom={1}>
          <Text color="cyan" dimColor bold>AI:</Text>
          <Box marginLeft={2}>
            <Text dimColor>Now then, sir—what shall we call this endeavor? I've prepared a few suggestions:</Text>
          </Box>
        </Box>

        {suggestions.map((suggestion, i) => (
          <Box key={i} flexDirection="row" marginLeft={2}>
            <Text dimColor>  </Text>
            <Box flexDirection="column">
              <Text dimColor>{suggestion.name}</Text>
              <Text dimColor>  {suggestion.reasoning}</Text>
            </Box>
          </Box>
        ))}

        <Box flexDirection="row" marginLeft={2} marginTop={1}>
          <Text dimColor>  Or type your own...</Text>
        </Box>

        <Box flexDirection="column" marginTop={1}>
          <Text color="cyan" bold>Menu</Text>
          <Text dimColor>
            {onShowSettings ? '[S] Settings  ' : ''}[B] Back  [ESC/Enter] Resume
          </Text>
        </Box>
      </Box>
    )
  }

  return (
    <Box flexDirection="column">
      <Box flexDirection="column" marginBottom={1}>
        <Text color="cyan" bold>AI:</Text>
        <Box marginLeft={2}>
          <Text wrap="wrap">Now then, sir—what shall we call this endeavor? I've prepared a few suggestions:</Text>
        </Box>
      </Box>

      {suggestions.map((suggestion, i) => (
        <Box key={i} flexDirection="row" marginLeft={2}>
          <Text color={!customMode && i === selected ? 'cyan' : 'gray'}>
            {!customMode && i === selected ? '> ' : '  '}
          </Text>
          <Box flexDirection="column">
            <Text color={!customMode && i === selected ? 'cyan' : undefined} bold={!customMode && i === selected}>
              {suggestion.name}
            </Text>
            <Text dimColor>  {suggestion.reasoning}</Text>
          </Box>
        </Box>
      ))}

      <Box flexDirection="row" marginLeft={2} marginTop={1}>
        {customMode ? (
          <Box>
            <Text color="green">You: </Text>
            <TextInput
              label=""
              value={customName}
              onChange={setCustomName}
              onSubmit={handleCustomSubmit}
              placeholder="Type your project name..."
              focus={true}
            />
          </Box>
        ) : (
          <>
            <Text color={selected === suggestions.length ? 'cyan' : 'gray'}>
              {selected === suggestions.length ? '> ' : '  '}
            </Text>
            <Text color={selected === suggestions.length ? 'cyan' : undefined} italic>
              Or type your own...
            </Text>
          </>
        )}
      </Box>

      <Box marginTop={1}>
        <Text dimColor>
          {customMode ? '[ESC] Back to list' : '[ESC] Menu  [↑↓/jk] Navigate  [Enter] Select'}
        </Text>
      </Box>
    </Box>
  )
}

function RetryHandler({ onRetry }: { onRetry: () => void }) {
  useInput((input, key) => {
    if (!key.escape) {
      onRetry()
    }
  })
  return null
}
