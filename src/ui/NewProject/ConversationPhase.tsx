import React, { useState, useEffect, useCallback } from 'react'
import { Box, Text, useInput } from 'ink'
import Spinner from 'ink-spinner'
import type { LachesisConfig } from '../../config/types.ts'
import type { PlanningLevel } from '../../core/project/types.ts'
import type {
  ConversationMessage,
  ExtractedProjectData,
  ProjectNameSuggestion,
} from '../../ai/client.ts'
import {
  extractProjectData,
  shouldContinueConversation,
  streamNextQuestion,
  streamAgenticConversation,
  generateProjectNameSuggestions,
  extractProjectName,
} from '../../ai/client.ts'
import { buildSystemPrompt } from '../../ai/prompts.ts'
import { TextInput } from '../components/TextInput.tsx'
import { ConversationView } from '../components/ConversationView.tsx'
import { debugLog } from '../../debug/logger.ts'
import type { AIStatusDescriptor } from '../components/StatusBar.tsx'

export type ConversationStep =
  | 'generating_question'
  | 'waiting_for_answer'
  | 'generating_names'
  | 'naming_project'
  | 'extracting_data'
  | 'error'

export type StoredConversationState = {
  messages: ConversationMessage[]
  coveredTopics: string[]
  step: ConversationStep
}

type ConversationState = StoredConversationState & {
  error: string | null
  errorDetails: string | null
  nameSuggestions: ProjectNameSuggestion[] | null
  selectedName: string | null
}

type ConversationPhaseProps = {
  config: LachesisConfig
  planningLevel: PlanningLevel
  projectName: string
  oneLiner: string
  debug?: boolean
  /**
   * Marks whether we're starting something new or working on an existing project.
   * Used to shape the prompt only—code path stays unified.
   */
  sessionKind?: 'new' | 'existing'
  /**
   * Optional contextual note (e.g., existing project summary, goals, blockers).
   */
  projectContext?: string
  /**
   * Initial conversation state to restore (for resuming after settings, etc.)
   */
  initialState?: StoredConversationState
  /**
   * Whether agentic mode is enabled (enables Agent SDK with tool-calling)
   */
  agenticEnabled?: boolean
  /**
   * Project path for scoped file operations (required when agenticEnabled is true)
   */
  projectPath?: string
  onInputModeChange?: (typing: boolean) => void
  onAIStatusChange?: (status: AIStatusDescriptor) => void
  onDebugHotkeysChange?: (enabled: boolean) => void
  onShowSettings?: () => void
  /**
   * Called whenever conversation state changes, for persistence
   */
  onStateChange?: (state: StoredConversationState) => void
  /**
   * Called when user requests to clear/restart the conversation
   */
  onClearConversation?: () => void
  onComplete: (
    extractedData: ExtractedProjectData,
    conversationLog: ConversationMessage[],
    selectedProjectName: string,
  ) => void
  onCancel: () => void
}

export function ConversationPhase({
  config,
  planningLevel,
  projectName,
  oneLiner,
  debug = false,
  sessionKind = 'new',
  projectContext,
  initialState,
  agenticEnabled = false,
  projectPath,
  onInputModeChange,
  onAIStatusChange,
  onDebugHotkeysChange,
  onShowSettings,
  onStateChange,
  onClearConversation,
  onComplete,
  onCancel,
}: ConversationPhaseProps) {
  // Initialize from stored state if provided, otherwise start fresh
  const [state, setState] = useState<ConversationState>(() => {
    if (initialState && initialState.messages.length > 0) {
      return {
        ...initialState,
        error: null,
        errorDetails: null,
        nameSuggestions: null,
        selectedName: null,
      }
    }
    return {
      step: 'generating_question',
      messages: [],
      coveredTopics: [],
      error: null,
      errorDetails: null,
      nameSuggestions: null,
      selectedName: null,
    }
  })

  // Track if we restored from initial state (to skip first question generation)
  const [restoredFromState] = useState(() => Boolean(initialState && initialState.messages.length > 0))

  // Menu mode: when true, text input is paused and menu hotkeys are active
  const [menuMode, setMenuMode] = useState(false)

  // Notify parent of state changes for persistence
  useEffect(() => {
    if (onStateChange) {
      onStateChange({
        messages: state.messages,
        coveredTopics: state.coveredTopics,
        step: state.step,
      })
    }
  }, [state.messages, state.coveredTopics, state.step, onStateChange])

  const effectiveProjectName = projectName.trim() || 'Untitled Project'
  const effectiveOneLiner = oneLiner.trim() || 'Not provided yet'

  // Always lock parent input - ConversationPhase handles its own ESC for menu mode
  // This prevents the parent from catching ESC and cancelling during the conversation
  useEffect(() => {
    onInputModeChange?.(true)
    return () => onInputModeChange?.(false)
  }, [onInputModeChange])

  // Enable debug hotkeys when not actively typing
  useEffect(() => {
    onDebugHotkeysChange?.(state.step !== 'waiting_for_answer')
    return () => onDebugHotkeysChange?.(false)
  }, [onDebugHotkeysChange, state.step])

  // Surface AI activity back to the parent status bar
  useEffect(() => {
    if (!onAIStatusChange) return

    switch (state.step) {
      case 'generating_question':
        onAIStatusChange({
          state: 'streaming',
          message: 'Streaming the next question',
        })
        break
      case 'waiting_for_answer':
        onAIStatusChange({
          state: 'waiting',
          message: 'Waiting for your reply',
        })
        break
      case 'extracting_data':
        onAIStatusChange({
          state: 'processing',
          message: 'Structuring your project notes',
        })
        break
      case 'generating_names':
        onAIStatusChange({
          state: 'processing',
          message: 'Generating name suggestions',
        })
        break
      case 'naming_project':
        onAIStatusChange({
          state: 'idle',
          message: 'Choose a project name',
        })
        break
      case 'error':
        onAIStatusChange({
          state: 'error',
          message: state.error || 'Issue talking to AI',
        })
        break
      default:
        onAIStatusChange({ state: 'idle', message: 'Ready' })
        break
    }
  }, [onAIStatusChange, state.error, state.step])

  // Generate first question on mount (skip if restored from state)
  useEffect(() => {
    if (!restoredFromState) {
      generateFirstQuestion()
    }
  }, [restoredFromState])

  const streamQuestion = useCallback(
    async (context: {
      planningLevel: PlanningLevel
      projectName: string
      oneLiner: string
      messages: ConversationMessage[]
      coveredTopics: string[]
    }) => {
      debugLog.info('Conversation: preparing to stream next question', {
        planningLevel,
        projectName: context.projectName,
        oneLiner: context.oneLiner,
        coveredTopics: context.coveredTopics,
        messageCount: context.messages.length,
      })

      // Determine if this is the first message (for opening greeting)
      const isFirstMessage = context.messages.length === 0

      const prompt = buildSystemPrompt({
        sessionType: sessionKind,
        projectName: effectiveProjectName,
        oneLiner: effectiveOneLiner,
        planningLevel,
        coveredTopics: context.coveredTopics,
        currentHour: new Date().getHours(),
        isFirstMessage,
      })

      debugLog.debug('Conversation: coaching prompt built', {
        promptPreview: prompt.slice(0, 200),
      })

      // Use timestamp + random suffix to avoid collision with user message timestamp
      const streamId = `${new Date().toISOString()}-${Math.random().toString(36).slice(2, 8)}`
      setState((s) => ({ ...s, step: 'generating_question' }))

      const result = await streamNextQuestion(context, prompt, config, (partial) => {
        setState((s) => {
          const messages = [...s.messages]
          const last = messages[messages.length - 1]

          if (
            last &&
            last.role === 'assistant' &&
            last.timestamp === streamId
          ) {
            messages[messages.length - 1] = { ...last, content: partial }
          } else {
            messages.push({
              role: 'assistant',
              content: partial,
              timestamp: streamId,
            })
          }

          return { ...s, messages }
        })
        // debugLog.debug('Conversation: streaming partial question', {
        //   streamId,
        //   length: partial.length,
        //   preview: partial.slice(0, 120),
        // })
      })

      if (result.success && result.content !== undefined) {
        debugLog.info('Conversation: full question received', {
          streamId,
          length: result.content.length,
          preview: result.content.slice(0, 200),
        })
        setState((s) => ({
          ...s,
          step: 'waiting_for_answer',
          messages: s.messages.map((m) =>
            m.timestamp === streamId ? { ...m, content: result.content! } : m,
          ),
        }))
      } else {
        console.error('Failed to generate question', { result: JSON.stringify(result) })
        debugLog.error('Failed to generate question', { result: JSON.stringify(result) })
        setState((s) => ({
          ...s,
          step: 'error',
          error: result.error || 'Failed to generate question',
          errorDetails: debug ? result.debugDetails || null : null,
        }))
      }
    },
    [
      config,
      debug,
      effectiveOneLiner,
      effectiveProjectName,
      planningLevel,
      projectContext,
      sessionKind,
    ],
  )

  const generateFirstQuestion = async () => {
    debugLog.info('Conversation: starting first question', {
      sessionKind,
      agenticEnabled,
      projectPath,
    })

    // For existing projects with agentic mode, use the agentic path with tools
    // so the AI can read files and provide a substantive opening
    if (sessionKind === 'existing' && agenticEnabled && projectPath) {
      debugLog.info('Conversation: using agentic mode for first message')

      const qaPrompt = buildSystemPrompt({
        sessionType: 'existing',
        projectName: effectiveProjectName,
        snapshotSummary: projectContext ?? '',
        toolsAvailable: ['Read', 'Write', 'Edit', 'Glob', 'Grep'],
        currentHour: new Date().getHours(),
        isFirstMessage: true,
      })

      const streamId = `${new Date().toISOString()}-${Math.random().toString(36).slice(2, 8)}`
      setState((s) => ({ ...s, step: 'generating_question' }))

      const result = await streamAgenticConversation(config, {
        systemPrompt: qaPrompt,
        messages: [], // No messages yet - this is the first one
        projectPath,
        maxToolCalls: 10,
        onToolCall: (toolName, args) => {
          debugLog.info('Conversation: Agent SDK tool called (first message)', { toolName, args })
        },
        onToolResult: (toolName, resultData) => {
          debugLog.info('Conversation: Agent SDK tool result (first message)', { toolName, result: resultData })
        },
        onTextUpdate: (partial) => {
          setState((s) => {
            const messages = [...s.messages]
            const last = messages[messages.length - 1]

            if (last && last.role === 'assistant' && last.timestamp === streamId) {
              messages[messages.length - 1] = { ...last, content: partial }
            } else {
              messages.push({
                role: 'assistant',
                content: partial,
                timestamp: streamId,
              })
            }

            return { ...s, messages }
          })
        },
      })

      if (result.success && result.response) {
        setState((s) => ({
          ...s,
          step: 'waiting_for_answer',
          messages: s.messages.map((m) =>
            m.timestamp === streamId ? { ...m, content: result.response! } : m,
          ),
        }))

        debugLog.info('Conversation: first agentic message complete', {
          responseLength: result.response.length,
          toolCallCount: result.toolCalls?.length ?? 0,
        })
      } else {
        debugLog.error('Conversation: first agentic message failed', {
          error: result.error,
        })
        setState((s) => ({
          ...s,
          step: 'error',
          error: result.error || 'Failed to generate opening message',
          errorDetails: debug ? result.debugDetails || null : null,
        }))
      }
    } else {
      // For new projects or non-agentic mode, use the coaching prompt
      await streamQuestion({
        planningLevel,
        projectName: effectiveProjectName,
        oneLiner: effectiveOneLiner,
        messages: [],
        coveredTopics: [],
      })
    }
  }

  // Phrase that signals the AI is ready to transition to naming phase
  const TRANSITION_PHRASE = 'very well, sir. let us proceed'

  // Check if AI response contains the transition phrase
  const checkForTransition = useCallback((responseText: string, messages: ConversationMessage[]) => {
    if (responseText.toLowerCase().includes(TRANSITION_PHRASE)) {
      debugLog.info('Conversation: transition phrase detected, moving to naming')
      generateNamesAndProceed(messages)
      return true
    }
    return false
  }, [])

  const handleUserAnswer = useCallback(
    async (answer: string) => {
      debugLog.info('Conversation: user answer received', {
        length: answer.length,
        preview: answer.slice(0, 200),
      })

      // Add user message
      const userMessage: ConversationMessage = {
        role: 'user',
        content: answer,
        timestamp: new Date().toISOString(),
      }

      const newMessages = [...state.messages, userMessage]

      setState((s) => ({
        ...s,
        messages: newMessages,
        step: 'generating_question',
      }))

      const context = {
        planningLevel,
        projectName,
        oneLiner,
        messages: newMessages,
        coveredTopics: state.coveredTopics,
      }

      // Generate next response - use agentic mode with Agent SDK tools if enabled
      if (agenticEnabled && projectPath) {
        // Use streaming agentic conversation with Agent SDK tools
        debugLog.info('Conversation: using streaming agentic mode with Agent SDK tools', {
          projectPath,
        })

        const qaPrompt = buildSystemPrompt({
          sessionType: 'existing',
          projectName: effectiveProjectName,
          snapshotSummary: projectContext ?? '',
          toolsAvailable: ['Read', 'Write', 'Edit', 'Glob', 'Grep'],
          currentHour: new Date().getHours(),
          isFirstMessage: false, // This is a follow-up message
        })

        // Use timestamp + random suffix to avoid collision
        const streamId = `${new Date().toISOString()}-${Math.random().toString(36).slice(2, 8)}`

        const result = await streamAgenticConversation(config, {
          systemPrompt: qaPrompt,
          messages: newMessages,
          projectPath,
          maxToolCalls: 10,
          onToolCall: (toolName, args) => {
            debugLog.info('Conversation: Agent SDK tool called', { toolName, args })
          },
          onToolResult: (toolName, resultData) => {
            debugLog.info('Conversation: Agent SDK tool result', { toolName, result: resultData })
          },
          onTextUpdate: (partial) => {
            // Update messages with streaming content
            setState((s) => {
              const messages = [...s.messages]
              const last = messages[messages.length - 1]

              if (
                last &&
                last.role === 'assistant' &&
                last.timestamp === streamId
              ) {
                messages[messages.length - 1] = { ...last, content: partial }
              } else {
                messages.push({
                  role: 'assistant',
                  content: partial,
                  timestamp: streamId,
                })
              }

              return { ...s, messages }
            })
          },
        })

        if (result.success && result.response) {
          // Finalize the message with complete content
          const updatedMessages = newMessages.concat({
            role: 'assistant' as const,
            content: result.response,
            timestamp: streamId,
          })

          // Check if the AI wants to transition to naming
          if (checkForTransition(result.response, updatedMessages)) {
            // Update state with final message before transitioning
            setState((s) => ({
              ...s,
              messages: updatedMessages,
            }))
            return
          }

          setState((s) => ({
            ...s,
            step: 'waiting_for_answer',
            messages: s.messages.map((m) =>
              m.timestamp === streamId ? { ...m, content: result.response! } : m,
            ),
          }))

          debugLog.info('Conversation: agentic response received', {
            responseLength: result.response.length,
            toolCallCount: result.toolCalls?.length ?? 0,
          })
        } else {
          debugLog.error('Conversation: agentic mode failed', {
            error: result.error,
          })
          setState((s) => ({
            ...s,
            step: 'error',
            error: result.error || 'Failed to generate response',
            errorDetails: debug ? result.debugDetails || null : null,
          }))
        }
      } else {
        // Use streaming mode (non-agentic)
        await streamQuestion(context)

        // After streaming completes, check current state for transition and topics
        setState((s) => {
          const lastAssistant = [...s.messages].reverse().find((m) => m.role === 'assistant')
          const finalContent = lastAssistant?.content ?? ''

          // Check for transition phrase - if found, generateNamesAndProceed will be called
          if (finalContent.toLowerCase().includes(TRANSITION_PHRASE)) {
            debugLog.info('Conversation: transition phrase detected in streaming response')
            // We need to trigger naming after state update, use setTimeout
            setTimeout(() => generateNamesAndProceed(s.messages), 0)
            return s // Don't update topics, we're transitioning
          }

          // Otherwise, detect topics and continue
          const newTopics = detectTopics(finalContent, s.coveredTopics)
          return {
            ...s,
            coveredTopics: newTopics,
          }
        })
      }
    },
    [
      state.messages,
      state.coveredTopics,
      config,
      planningLevel,
      projectName,
      oneLiner,
      agenticEnabled,
      projectPath,
      projectContext,
      debug,
      checkForTransition,
    ],
  )

  const finishConversation = async (messages: ConversationMessage[], selectedName: string) => {
    setState((s) => ({ ...s, step: 'extracting_data' }))

    const context = {
      planningLevel,
      projectName: selectedName,
      oneLiner: effectiveOneLiner,
      messages,
      coveredTopics: state.coveredTopics,
    }

    const result = await extractProjectData(context, config)
    debugLog.info('Conversation: extract project data result', {
      success: result.success,
      error: result.error,
      keys: result.data ? Object.keys(result.data) : undefined,
      selectedName,
    })

    if (result.success && result.data) {
      onComplete(result.data, messages, selectedName)
    } else {
      // Create minimal data if extraction fails
      const fallbackData: ExtractedProjectData = {
        vision: {
          oneLinePitch: effectiveOneLiner,
          description: effectiveOneLiner,
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
      onComplete(fallbackData, messages, selectedName)
    }
  }

  // Handle name selection and proceed to finish
  const handleNameSelected = useCallback(async (name: string, isCustomInput: boolean = false) => {
    debugLog.info('Project name selected', { name, isCustomInput })

    let finalName = name

    // For custom input, use AI to extract the actual project name
    // (e.g., "let's go with Kerbal Capcom" → "Kerbal Capcom")
    if (isCustomInput) {
      setState((s) => ({ ...s, step: 'extracting_data' })) // Show processing state

      const result = await extractProjectName(name, config)
      if (result.success && result.name) {
        finalName = result.name
        debugLog.info('Extracted project name from custom input', {
          original: name,
          extracted: finalName,
        })
      } else {
        // If extraction fails, fall back to the raw input
        debugLog.warn('Failed to extract project name, using raw input', {
          original: name,
          error: result.error,
        })
      }
    }

    // Add user's selection as a message in the conversation
    const userSelectionMessage: ConversationMessage = {
      role: 'user',
      content: name, // Keep original input in the log
      timestamp: new Date().toISOString(),
    }
    const messagesWithSelection = [...state.messages, userSelectionMessage]

    setState((s) => ({
      ...s,
      selectedName: finalName,
      messages: messagesWithSelection,
    }))
    await finishConversation(messagesWithSelection, finalName)
  }, [state.messages, config])

  // Helper to generate names and show selection (used when skipping summary)
  const generateNamesAndProceed = async (messages: ConversationMessage[]) => {
    setState((s) => ({ ...s, step: 'generating_names' }))

    const context = {
      planningLevel,
      projectName: effectiveProjectName,
      oneLiner: effectiveOneLiner,
      messages,
      coveredTopics: state.coveredTopics,
    }

    const result = await generateProjectNameSuggestions(context, config)
    debugLog.info('Name suggestions result (no summary path)', {
      success: result.success,
      count: result.suggestions?.length,
      error: result.error,
    })

    if (result.success && result.suggestions && result.suggestions.length > 0) {
      setState((s) => ({
        ...s,
        step: 'naming_project',
        nameSuggestions: result.suggestions ?? null,
        messages, // Update messages in state
      }))
    } else {
      // If name generation fails, proceed with default name
      debugLog.warn('Name generation failed (no summary path), proceeding with default name')
      await finishConversation(messages, effectiveProjectName)
    }
  }

  const handleRetry = useCallback(() => {
    setState((s) => ({
      ...s,
      step: 'generating_question',
      error: null,
      errorDetails: null,
    }))
    generateFirstQuestion()
  }, [])

  // Handle clearing conversation and restarting
  const handleClearConversation = useCallback(() => {
    if (onClearConversation) {
      onClearConversation()
    }
    // Reset state and regenerate first question
    setState({
      step: 'generating_question',
      messages: [],
      coveredTopics: [],
      error: null,
      errorDetails: null,
      nameSuggestions: null,
      selectedName: null,
    })
    setMenuMode(false)
    // Trigger new first question
    setTimeout(() => generateFirstQuestion(), 0)
  }, [onClearConversation])

  // Handle menu mode toggle and menu hotkeys
  useInput(
    (input, key) => {
      const lower = input.toLowerCase()

      if (menuMode) {
        // In menu mode: handle menu hotkeys
        if (key.escape || key.return) {
          // Return to chat mode
          setMenuMode(false)
          return
        }
        if (lower === 's' && onShowSettings) {
          onShowSettings()
          return
        }
        if (lower === 'c') {
          // Clear/restart conversation
          handleClearConversation()
          return
        }
        if (lower === 'b') {
          onCancel()
          return
        }
      } else {
        // In chat mode: ESC toggles to menu mode
        if (key.escape) {
          setMenuMode(true)
          return
        }
      }
    },
    { isActive: true },
  )

  // Render based on step
  if (state.step === 'error') {
    return (
      <Box flexDirection="column" paddingX={1}>
        <ConversationView messages={state.messages} />
        <Box flexDirection="column" marginTop={1}>
          <Text color="red">Error: {state.error}</Text>
          {debug && state.errorDetails && (
            <>
              <Text>{'\n'}</Text>
              <Text dimColor>{state.errorDetails}</Text>
            </>
          )}
          <Text>{'\n'}</Text>
          <Text dimColor>Press any key to retry, or Esc to cancel</Text>
          <RetryHandler onRetry={handleRetry} />
        </Box>
      </Box>
    )
  }

  if (
    state.step === 'generating_question' ||
    state.step === 'extracting_data'
  ) {
    return (
      <Box flexDirection="column" paddingX={1}>
        <ConversationView messages={state.messages} />
        <Box marginTop={1}>
          <Text color="cyan">
            <Spinner type="dots" />
          </Text>
          <Text>
            {' '}
            {state.step === 'extracting_data' ? 'Processing...' : 'Thinking...'}
          </Text>
        </Box>
      </Box>
    )
  }

  if (state.step === 'generating_names') {
    return (
      <Box flexDirection="column" paddingX={1}>
        <ConversationView messages={state.messages} />
        <Box marginTop={1}>
          <Text color="cyan">
            <Spinner type="dots" />
          </Text>
          <Text> Generating name suggestions...</Text>
        </Box>
      </Box>
    )
  }

  if (state.step === 'naming_project' && state.nameSuggestions) {
    return (
      <Box flexDirection="column" paddingX={1}>
        <ConversationView messages={state.messages} />
        <Box flexDirection="column" marginTop={1}>
          <ProjectNamingView
            suggestions={state.nameSuggestions}
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

  // waiting_for_answer
  return (
    <Box flexDirection="column" paddingX={1}>
      <ConversationView messages={state.messages} />
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
  // Options: all suggestions + custom option
  const [selected, setSelected] = useState(0)
  const [customMode, setCustomMode] = useState(false)
  const [customName, setCustomName] = useState('')

  const totalOptions = suggestions.length + 1 // +1 for custom option

  // Handle menu mode hotkeys
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

  // Handle selection mode
  useInput(
    (input, key) => {
      if (customMode) {
        // In custom mode, Escape goes back to selection
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
          // Custom option selected
          setCustomMode(true)
        } else {
          // Select a suggestion
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
      onSelect(value.trim(), true) // Mark as custom input for AI extraction
    }
  }

  // Show menu overlay
  if (menuMode) {
    return (
      <Box flexDirection="column">
        {/* Assistant-style prompt (dimmed in menu mode) */}
        <Box flexDirection="column" marginBottom={1}>
          <Text color="cyan" dimColor bold>AI:</Text>
          <Box marginLeft={2}>
            <Text dimColor>Now then, sir—what shall we call this endeavor? I've prepared a few suggestions:</Text>
          </Box>
        </Box>

        {/* Name options (dimmed) */}
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

        {/* Menu */}
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
      {/* Assistant-style prompt */}
      <Box flexDirection="column" marginBottom={1}>
        <Text color="cyan" bold>AI:</Text>
        <Box marginLeft={2}>
          <Text wrap="wrap">Now then, sir—what shall we call this endeavor? I've prepared a few suggestions:</Text>
        </Box>
      </Box>

      {/* Name options */}
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

      {/* Custom option */}
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

// ============================================================================
// Helpers
// ============================================================================

/**
 * Topic detection from question text.
 * Topics map to Overview.md template sections.
 */
function detectTopics(
  questionText: string,
  existingTopics: string[],
): string[] {
  const topicKeywords: Record<string, string[]> = {
    elevator_pitch: ['what are you building', 'what is this', 'describe', 'one sentence', 'elevator'],
    problem_statement: ['problem', 'pain', 'hurts', 'solve', 'why build', 'consequence'],
    target_users: ['who will', 'who is', 'target', 'audience', 'users', 'customer', 'context'],
    value_proposition: ['benefit', 'value', 'alternative', 'different', 'why this'],
    scope_and_antigoals: ['scope', 'in scope', 'out of scope', 'anti-goal', 'avoid', "shouldn't", 'not become'],
    constraints: ['constraint', 'limitation', 'budget', 'time', 'deadline', 'tech stack', 'money'],
  }

  const lowerQuestion = questionText.toLowerCase()
  const newTopics = new Set(existingTopics)

  for (const [topic, keywords] of Object.entries(topicKeywords)) {
    if (keywords.some((kw) => lowerQuestion.includes(kw))) {
      newTopics.add(topic)
    }
  }

  return Array.from(newTopics)
}
