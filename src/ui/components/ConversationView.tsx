import React from 'react'
import { Box, Text } from 'ink'
import type { ConversationMessage } from '../../ai/client.ts'

type ConversationViewProps = {
  messages: ConversationMessage[]
  maxVisible?: number // How many recent exchanges to show (default 3)
  /**
   * Optional index (0-based) of the message to anchor the view on.
   * When provided, the view will show a window ending at this message,
   * letting callers implement simple scrolling/browsing behavior.
   */
  anchorIndex?: number | null
}

/**
 * Displays conversation history with a hybrid approach:
 * - Shows last N exchanges in dimmed/compact format for context
 * - Current question is prominently displayed
 */
export function ConversationView({
  messages,
  maxVisible = 3,
  anchorIndex = null,
}: ConversationViewProps) {
  if (messages.length === 0) {
    return null
  }

  const totalMessages = messages.length

  // Determine which message to end the window on (defaults to the newest)
  const anchor = Math.min(
    Math.max(anchorIndex ?? totalMessages - 1, 0),
    totalMessages - 1,
  )

  // Calculate how many messages to show
  // We want to show pairs (assistant + user), but the last message might be unpaired
  const visibleWindow = maxVisible * 2
  const windowStart = Math.max(0, anchor - visibleWindow + 1)
  const visibleMessages = messages.slice(windowStart, anchor + 1)

  // Split into context (older) and current (newest assistant message)
  const lastMessage = visibleMessages[visibleMessages.length - 1]
  const contextMessages = visibleMessages.slice(0, -1)
  const isBrowsingHistory = anchor < totalMessages - 1

  return (
    <Box flexDirection="column">
      {isBrowsingHistory && (
        <Box flexDirection="column" marginBottom={1}>
          <Text dimColor>
            Viewing chat {anchor + 1}/{totalMessages} - j/k to move, Enter to
            resume typing
          </Text>
        </Box>
      )}

      {/* Context: older messages shown in dimmed format */}
      {contextMessages.length > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          {contextMessages.map((msg, i) => (
            <ContextMessage key={i} message={msg} />
          ))}
        </Box>
      )}

      {/* Current: latest message shown prominently */}
      {lastMessage && <CurrentMessage message={lastMessage} />}
    </Box>
  )
}

function ContextMessage({ message }: { message: ConversationMessage }) {
  const isAssistant = message.role === 'assistant'
  const prefix = isAssistant ? 'Q:' : 'A:'
  const truncated = truncateText(message.content, 100)

  return (
    <Box marginBottom={0}>
      <Text dimColor>
        {prefix} {truncated}
      </Text>
    </Box>
  )
}

function CurrentMessage({ message }: { message: ConversationMessage }) {
  const isAssistant = message.role === 'assistant'

  if (isAssistant) {
    return (
      <Box flexDirection="column" marginBottom={1}>
        <Text color="cyan" bold>
          AI:
        </Text>
        <Box marginLeft={2}>
          <Text>{message.content}</Text>
        </Box>
      </Box>
    )
  }

  // User's last response (should be rare - usually we show AI question as "current")
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text dimColor>You:</Text>
      <Box marginLeft={2}>
        <Text dimColor>{message.content}</Text>
      </Box>
    </Box>
  )
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength - 3) + '...'
}

/**
 * Simple generating indicator
 */
export function GeneratingIndicator() {
  return (
    <Box>
      <Text color="cyan">Thinking...</Text>
    </Box>
  )
}

/**
 * Summary display for confirmation
 */
export function SummaryDisplay({
  summary,
  onConfirm,
  onRevise,
}: {
  summary: string
  onConfirm: () => void
  onRevise: () => void
}) {
  const [selected, setSelected] = React.useState(0)

  React.useEffect(() => {
    const handleKeypress = (ch: string, key: any) => {
      if (key.upArrow || key.downArrow) {
        setSelected((s) => (s === 0 ? 1 : 0))
      }
      if (key.return) {
        if (selected === 0) onConfirm()
        else onRevise()
      }
    }

    process.stdin.on('keypress', handleKeypress)
    return () => {
      process.stdin.off('keypress', handleKeypress)
    }
  }, [selected, onConfirm, onRevise])

  return (
    <Box flexDirection="column">
      <Text bold color="cyan">
        Summary of what we discussed:
      </Text>
      <Box marginY={1} paddingX={2}>
        <Text>{summary}</Text>
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
