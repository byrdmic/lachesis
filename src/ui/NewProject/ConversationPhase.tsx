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

  const effectiveProjectName = projectName.trim() || 'Untitled Project'
  const effectiveOneLiner = oneLiner.trim() || 'Not provided yet'

  const typing = state.step === 'waiting_for_answer'
  useEffect(() => {
    onInputModeChange?.(typing)
    return () => onInputModeChange?.(false)
  }, [typing, onInputModeChange])

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
      })

      if (result.success && result.content) {
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

      if (isWrapUp || !shouldContinue.continue) {
        // Generate summary
        setState((s) => ({ ...s, step: 'generating_summary' }))

        const summaryResult = await generateSummary(context, config)

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
  return (
    <Box flexDirection="column" padding={1}>
      <ConversationView messages={state.messages} />
      <Box marginTop={1}>
        <ChatInput onSubmit={handleUserAnswer} />
      </Box>
      <Box marginTop={1}>
        <Text dimColor>
          Tip: Say "summarize" when you're ready to wrap up | Esc to cancel
        </Text>
      </Box>
    </Box>
  )
}

// ============================================================================
// Sub-components
// ============================================================================

function ChatInput({ onSubmit }: { onSubmit: (value: string) => void }) {
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
