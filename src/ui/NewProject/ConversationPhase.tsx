import React, { useState, useEffect, useCallback } from 'react'
import { Box, Text, useInput } from 'ink'
import Spinner from 'ink-spinner'
import type { LachesisConfig } from '../../config/types.ts'
import type { PlanningLevel } from '../../core/project/types.ts'
import type {
  ConversationMessage,
  ExtractedProjectData,
} from '../../ai/client.ts'
import {
  generateSummary,
  extractProjectData,
  shouldContinueConversation,
  streamNextQuestion,
} from '../../ai/client.ts'
import {
  buildCoachingPrompt,
} from '../../ai/prompts.ts'
import { TextInput } from '../components/TextInput.tsx'
import { ConversationView } from '../components/ConversationView.tsx'
import { debugLog } from '../../debug/logger.ts'
import type { AIStatusDescriptor } from '../components/StatusBar.tsx'

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
  onInputModeChange?: (typing: boolean) => void
  onAIStatusChange?: (status: AIStatusDescriptor) => void
  onDebugHotkeysChange?: (enabled: boolean) => void
  onComplete: (
    extractedData: ExtractedProjectData,
    conversationLog: ConversationMessage[],
  ) => void
  onCancel: () => void
}

type ConversationStep =
  | 'generating_question'
  | 'waiting_for_answer'
  | 'generating_summary'
  | 'showing_summary'
  | 'extracting_data'
  | 'error'

type ConversationState = {
  step: ConversationStep
  messages: ConversationMessage[]
  coveredTopics: string[]
  summary: string | null
  error: string | null
  errorDetails: string | null
}

export function ConversationPhase({
  config,
  planningLevel,
  projectName,
  oneLiner,
  debug = false,
  sessionKind = 'new',
  projectContext,
  onInputModeChange,
  onAIStatusChange,
  onDebugHotkeysChange,
  onComplete,
  onCancel,
}: ConversationPhaseProps) {
  const [state, setState] = useState<ConversationState>({
    step: 'generating_question',
    messages: [],
    coveredTopics: [],
    summary: null,
    error: null,
    errorDetails: null,
  })
  const [interactionMode, setInteractionMode] = useState<'text' | 'menu'>('text')
  const [historyAnchor, setHistoryAnchor] = useState<number | null>(null)
  const [menuMessage, setMenuMessage] = useState<string | null>(null)

  const effectiveProjectName = projectName.trim() || 'Untitled Project'
  const effectiveOneLiner = oneLiner.trim() || 'Not provided yet'

  const typing =
    state.step === 'waiting_for_answer' && interactionMode === 'text'
  useEffect(() => {
    onInputModeChange?.(typing)
    return () => onInputModeChange?.(false)
  }, [typing, onInputModeChange])

  // Only allow debug hotkeys (DebugLog nav) in menu mode
  useEffect(() => {
    onDebugHotkeysChange?.(
      state.step === 'waiting_for_answer' && interactionMode === 'menu',
    )
    return () => onDebugHotkeysChange?.(false)
  }, [interactionMode, onDebugHotkeysChange, state.step])

  // Reset browsing state when returning to text mode
  useEffect(() => {
    if (interactionMode === 'text') {
      setHistoryAnchor(null)
      setMenuMessage(null)
    }
  }, [interactionMode])

  // Keep history anchor in bounds as messages stream in/out
  useEffect(() => {
    if (historyAnchor === null) return
    if (state.messages.length === 0) {
      setHistoryAnchor(null)
      return
    }

    const maxIndex = state.messages.length - 1
    if (historyAnchor > maxIndex) {
      setHistoryAnchor(maxIndex)
    }
  }, [historyAnchor, state.messages.length])

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
      case 'generating_summary':
        onAIStatusChange({
          state: 'processing',
          message: 'Summarizing the conversation',
        })
        break
      case 'showing_summary':
        onAIStatusChange({
          state: 'idle',
          message: 'Review the summary',
        })
        break
      case 'extracting_data':
        onAIStatusChange({
          state: 'processing',
          message: 'Structuring your project notes',
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

  // Generate first question on mount
  useEffect(() => {
    generateFirstQuestion()
  }, [])

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

      const prompt = buildCoachingPrompt(
        effectiveProjectName,
        effectiveOneLiner,
        planningLevel,
        context.coveredTopics,
        {
          collectSetupQuestions: sessionKind === 'new',
          mode: sessionKind === 'existing' ? 'building' : 'planning',
          projectStage: sessionKind,
          existingContext: sessionKind === 'existing' ? projectContext : undefined,
        },
      )

      debugLog.debug('Conversation: coaching prompt built', {
        promptPreview: prompt.slice(0, 200),
      })

      const streamId = new Date().toISOString()
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
        debugLog.debug('Conversation: streaming partial question', {
          streamId,
          length: partial.length,
          preview: partial.slice(0, 120),
        })
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
    debugLog.info('Conversation: starting first question')
    await streamQuestion({
      planningLevel,
      projectName: effectiveProjectName,
      oneLiner: effectiveOneLiner,
      messages: [],
      coveredTopics: [],
    })
  }

  const handleUserAnswer = useCallback(
    async (answer: string) => {
      debugLog.info('Conversation: user answer received', {
        length: answer.length,
        preview: answer.slice(0, 200),
      })

      // Check for "take the wheel" trigger
      const takeWheelTriggers = [
        'take the wheel',
        'write it for me',
        'you decide',
        'summarize',
      ]
      const isWrapUp = takeWheelTriggers.some((t) =>
        answer.toLowerCase().includes(t),
      )

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

      // Check if we should wrap up
      const context = {
        planningLevel,
        projectName,
        oneLiner,
        messages: newMessages,
        coveredTopics: state.coveredTopics,
      }

      const shouldContinue = await shouldContinueConversation(context, config)
      debugLog.info('Conversation: should continue result', {
        isWrapUp,
        continue: shouldContinue.continue,
        reason: shouldContinue.reason,
      })

      if (isWrapUp || !shouldContinue.continue) {
        // Generate summary
        setState((s) => ({ ...s, step: 'generating_summary' }))

        const summaryResult = await generateSummary(context, config)
        debugLog.info('Conversation: summary result', {
          success: summaryResult.success,
          length: summaryResult.content?.length,
          preview: summaryResult.content?.slice(0, 200),
          error: summaryResult.error,
        })

        if (summaryResult.success && summaryResult.content) {
          setState((s) => ({
            ...s,
            step: 'showing_summary',
            summary: summaryResult.content ?? null,
          }))
        } else {
          // Proceed without summary
          await finishConversation(newMessages)
        }
        return
      }

      // Generate next question (streaming)
      await streamQuestion(context)

      // Try to detect topic from question (simple heuristic) using latest assistant message
      setState((s) => {
        const lastAssistant = [...s.messages].reverse().find((m) => m.role === 'assistant')
        const finalContent = lastAssistant?.content ?? ''
        const newTopics = detectTopics(finalContent, s.coveredTopics)
        return {
          ...s,
          coveredTopics: newTopics,
        }
      })
    },
    [
      state.messages,
      state.coveredTopics,
      config,
      planningLevel,
      projectName,
      oneLiner,
    ],
  )

  const handleSummaryConfirm = useCallback(async () => {
    await finishConversation(state.messages)
  }, [state.messages])

  const handleSummaryRevise = useCallback(async () => {
    // Add a message asking for clarification and continue
    const assistantMessage: ConversationMessage = {
      role: 'assistant',
      content: 'What would you like to clarify or add?',
      timestamp: new Date().toISOString(),
    }

    setState((s) => ({
      ...s,
      step: 'waiting_for_answer',
      messages: [...s.messages, assistantMessage],
      summary: null,
    }))
  }, [])

  const finishConversation = async (messages: ConversationMessage[]) => {
    setState((s) => ({ ...s, step: 'extracting_data' }))

    const context = {
      planningLevel,
      projectName: effectiveProjectName,
      oneLiner: effectiveOneLiner,
      messages,
      coveredTopics: state.coveredTopics,
    }

    const result = await extractProjectData(context, config)
    debugLog.info('Conversation: extract project data result', {
      success: result.success,
      error: result.error,
      keys: result.data ? Object.keys(result.data) : undefined,
    })

    if (result.success && result.data) {
      onComplete(result.data, messages)
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
      onComplete(fallbackData, messages)
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

  const messageCount = state.messages.length

  const bumpHistoryAnchor = useCallback(
    (delta: number) => {
      if (messageCount === 0) {
        setHistoryAnchor(null)
        return
      }
      setHistoryAnchor((current) => {
        const latestIndex = messageCount - 1
        const base = current ?? latestIndex
        const next = Math.min(Math.max(base + delta, 0), latestIndex)
        return next === latestIndex ? null : next
      })
    },
    [messageCount],
  )

  // Vim-like mode handling while the user is answering
  useInput(
    (input, key) => {
      if (state.step !== 'waiting_for_answer') return

      if (interactionMode === 'text') {
        if (key.escape) {
          setInteractionMode('menu')
          setMenuMessage(null)
          onDebugHotkeysChange?.(true)
        }
        return
      }

      // Menu mode
      if (key.escape) {
        onDebugHotkeysChange?.(false)
        onCancel()
        return
      }

      if (key.return) {
        setInteractionMode('text')
        onDebugHotkeysChange?.(false)
        return
      }

      if (input === 'j' || key.downArrow) {
        bumpHistoryAnchor(1)
      } else if (input === 'k' || key.upArrow) {
        bumpHistoryAnchor(-1)
      } else if (input?.toLowerCase() === 's') {
        setMenuMessage(
          'Settings live in your config file - tweak and relaunch to apply.',
        )
      }
    },
    { isActive: state.step === 'waiting_for_answer' },
  )

  // Handle escape to cancel
  useInput(
    (input, key) => {
      if (key.escape) {
        onCancel()
      }
    },
    { isActive: state.step !== 'waiting_for_answer' },
  )

  // Render based on step
  if (state.step === 'error') {
    return (
      <Box flexDirection="column" padding={1}>
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
    )
  }

  if (
    state.step === 'generating_question' ||
    state.step === 'extracting_data'
  ) {
    return (
      <Box flexDirection="column" padding={1}>
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

  if (state.step === 'generating_summary') {
    return (
      <Box flexDirection="column" padding={1}>
        <ConversationView messages={state.messages} />
        <Box marginTop={1}>
          <Text color="cyan">
            <Spinner type="dots" />
          </Text>
          <Text> Generating summary...</Text>
        </Box>
      </Box>
    )
  }

  if (state.step === 'showing_summary' && state.summary) {
    return (
      <Box flexDirection="column" padding={1}>
        <SummaryConfirmation
          summary={state.summary}
          onConfirm={handleSummaryConfirm}
          onRevise={handleSummaryRevise}
        />
      </Box>
    )
  }

  // waiting_for_answer
  const latestIndex = state.messages.length
    ? state.messages.length - 1
    : null
  const anchorIndex =
    interactionMode === 'menu' && historyAnchor !== null
      ? historyAnchor
      : latestIndex
  const modeLabel =
    interactionMode === 'text'
      ? 'Text Mode | [ESC] open menu'
      : 'Menu Mode | [j/k] scroll chat | [s] Settings | [ESC] quit | [Enter] back to Text Mode'
  const historyLabel =
    interactionMode === 'menu' && anchorIndex !== null
      ? ` | Viewing ${anchorIndex + 1}/${state.messages.length}`
      : ''

  return (
    <Box flexDirection="column" padding={1}>
      <ConversationView messages={state.messages} anchorIndex={anchorIndex} />
      <Box marginTop={1}>
        <ChatInput
          onSubmit={handleUserAnswer}
          isFocused={interactionMode === 'text'}
        />
      </Box>
      <Box marginTop={1}>
        <Text dimColor>{modeLabel + historyLabel}</Text>
        {menuMessage && (
          <Text dimColor>
            {menuMessage} (press Enter to jump back into Text Mode)
          </Text>
        )}
      </Box>
    </Box>
  )
}

// ============================================================================
// Sub-components
// ============================================================================

function ChatInput({
  onSubmit,
  isFocused,
}: {
  onSubmit: (value: string) => void
  isFocused: boolean
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
        focus={isFocused}
      />
    </Box>
  )
}

function SummaryConfirmation({
  summary,
  onConfirm,
  onRevise,
}: {
  summary: string
  onConfirm: () => void
  onRevise: () => void
}) {
  const [selected, setSelected] = useState(0)

  useInput((input, key) => {
    if (key.upArrow || key.downArrow) {
      setSelected((s) => (s === 0 ? 1 : 0))
    }
    if (key.return) {
      if (selected === 0) onConfirm()
      else onRevise()
    }
  })

  return (
    <Box flexDirection="column">
      <Text bold color="cyan">
        Summary of what we discussed:
      </Text>
      <Box marginY={1} paddingLeft={2} flexDirection="column">
        {summary.split('\n').map((line, i) => (
          <Text key={i}>{line}</Text>
        ))}
      </Box>
      <Text>{'\n'}</Text>
      <Text>Does this capture what you're building?</Text>
      <Box flexDirection="column" marginTop={1}>
        <Text color={selected === 0 ? 'cyan' : undefined}>
          {selected === 0 ? '❯ ' : '  '}Yes, continue
        </Text>
        <Text color={selected === 1 ? 'cyan' : undefined}>
          {selected === 1 ? '❯ ' : '  '}No, let me clarify
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
 * Simple topic detection from question text
 */
function detectTopics(
  questionText: string,
  existingTopics: string[],
): string[] {
  const topicKeywords: Record<string, string[]> = {
    core_purpose: ['what does', 'what will', 'main purpose', 'core function'],
    target_users: ['who will', 'who is', 'target', 'audience', 'users'],
    problem_solved: ['problem', 'pain point', 'solve', 'address', 'issue'],
    constraints: ['constraint', 'limitation', 'budget', 'time', 'resource'],
    success_criteria: ['success', 'measure', 'know if', 'goal', 'achieve'],
    anti_goals: ['not', 'avoid', "shouldn't", 'anti-goal', 'scope creep'],
    first_move: ['first step', 'start', 'begin', 'initial'],
    tech_considerations: ['technology', 'stack', 'platform', 'framework'],
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
