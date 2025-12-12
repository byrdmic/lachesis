import React, { useState, useEffect, useMemo } from 'react'
import { Box, Text, useInput, useStdout } from 'ink'
import type { ConversationMessage } from '../../ai/client.ts'

type ChatHistoryModalProps = {
  messages: ConversationMessage[]
  initialIndex?: number
  onClose: () => void
}

export function ChatHistoryModal({
  messages,
  initialIndex,
  onClose,
}: ChatHistoryModalProps) {
  const { stdout } = useStdout()
  const terminalHeight = stdout?.rows ?? 24

  // Calculate available height for messages (minus header, footer, borders, padding)
  const headerLines = 2
  const footerLines = 2
  const borderLines = 2
  const paddingLines = 2
  const availableHeight = Math.max(5, terminalHeight - headerLines - footerLines - borderLines - paddingLines)

  const [currentIndex, setCurrentIndex] = useState(initialIndex ?? messages.length - 1)
  const [viewportStart, setViewportStart] = useState(0)

  // Initialize viewport to show the initial message
  useEffect(() => {
    if (messages.length === 0) return
    const targetIndex = initialIndex ?? messages.length - 1
    setCurrentIndex(Math.min(targetIndex, messages.length - 1))
  }, [initialIndex, messages.length])

  // Keep current message in viewport
  useEffect(() => {
    if (currentIndex < viewportStart) {
      setViewportStart(currentIndex)
    } else if (currentIndex >= viewportStart + availableHeight) {
      setViewportStart(currentIndex - availableHeight + 1)
    }
  }, [currentIndex, availableHeight])

  // Handle keyboard navigation
  useInput((input, key) => {
    if (key.escape) {
      onClose()
      return
    }

    if (input === 'j' || key.downArrow) {
      setCurrentIndex((prev) => Math.min(prev + 1, messages.length - 1))
    } else if (input === 'k' || key.upArrow) {
      setCurrentIndex((prev) => Math.max(prev - 1, 0))
    } else if (input === 'g') {
      setCurrentIndex(0)
      setViewportStart(0)
    } else if (input === 'G') {
      setCurrentIndex(messages.length - 1)
      setViewportStart(Math.max(0, messages.length - availableHeight))
    }
  })

  // Calculate which messages to show (simplified: show around current message)
  const visibleMessages = useMemo(() => {
    if (messages.length === 0) return []

    // Each message takes variable lines, but we'll show one message at a time with context
    // For simplicity, show messages around the current index
    const contextBefore = 2
    const contextAfter = 2
    const start = Math.max(0, currentIndex - contextBefore)
    const end = Math.min(messages.length, currentIndex + contextAfter + 1)

    return messages.slice(start, end).map((msg, i) => ({
      message: msg,
      globalIndex: start + i,
      isCurrent: start + i === currentIndex,
    }))
  }, [messages, currentIndex])

  if (messages.length === 0) {
    return (
      <Box
        flexDirection="column"
        borderStyle="double"
        borderColor="cyan"
        padding={1}
        height="100%"
        width="100%"
      >
        <Text color="cyan" bold>
          Full Chat History
        </Text>
        <Text dimColor>No messages yet...</Text>
        <Box marginTop={1}>
          <Text dimColor>[Esc] close</Text>
        </Box>
      </Box>
    )
  }

  return (
    <Box
      flexDirection="column"
      borderStyle="double"
      borderColor="cyan"
      padding={1}
      height="100%"
      width="100%"
    >
      {/* Header */}
      <Box marginBottom={1}>
        <Text color="cyan" bold>
          Full Chat History
        </Text>
        <Text dimColor>
          {' '}
          ({currentIndex + 1}/{messages.length})
        </Text>
      </Box>

      {/* Messages */}
      <Box flexDirection="column" flexGrow={1} minHeight={0}>
        {visibleMessages.map(({ message, globalIndex, isCurrent }) => (
          <Box
            key={`${message.timestamp}-${globalIndex}`}
            flexDirection="column"
            marginBottom={1}
          >
            {/* Message header */}
            <Box>
              <Text color={isCurrent ? 'cyan' : 'gray'}>
                {isCurrent ? '> ' : '  '}
              </Text>
              <Text
                color={message.role === 'assistant' ? 'cyan' : 'green'}
                bold={isCurrent}
              >
                {message.role === 'assistant' ? 'AI:' : 'You:'}
              </Text>
            </Box>
            {/* Message content */}
            <Box paddingLeft={2}>
              <Text
                dimColor={!isCurrent}
                wrap="wrap"
              >
                {message.content}
              </Text>
            </Box>
          </Box>
        ))}
      </Box>

      {/* Footer */}
      <Box marginTop={1} justifyContent="space-between">
        <Text dimColor>
          [j/k] scroll  [g/G] top/bottom  [Esc] close
        </Text>
        {messages.length > 5 && (
          <Text dimColor>
            {currentIndex > 0 ? '...' : ''}
            {currentIndex < messages.length - 1 ? ' more' : ''}
          </Text>
        )}
      </Box>
    </Box>
  )
}
