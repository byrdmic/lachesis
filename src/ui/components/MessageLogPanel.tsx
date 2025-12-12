import React, { useEffect, useState, useMemo } from 'react'
import { Box, Text, useInput } from 'ink'
import type { ConversationMessage } from '../../ai/client.ts'

type MessageLogPanelProps = {
  messages: ConversationMessage[]
  width?: number
  selectedIndex: number | null
  isActive: boolean
  onSelectChange: (index: number) => void
  onOpenFullChat: () => void
}

function truncateText(text: string, maxLength: number): string {
  const singleLine = text.replace(/\n/g, ' ').trim()
  if (singleLine.length <= maxLength) return singleLine
  return singleLine.slice(0, maxLength - 3) + '...'
}

export function MessageLogPanel({
  messages,
  width = 35,
  selectedIndex,
  isActive,
  onSelectChange,
  onOpenFullChat,
}: MessageLogPanelProps) {
  // Calculate visible area - leave room for header (2 lines) and footer (1 line)
  const maxVisibleMessages = 15
  const [viewportStart, setViewportStart] = useState(0)

  // Keep viewport scrolled to show selected message
  useEffect(() => {
    if (selectedIndex === null) {
      // When not in selection mode, scroll to bottom
      const newStart = Math.max(0, messages.length - maxVisibleMessages)
      setViewportStart(newStart)
      return
    }

    // Ensure selected message is visible
    if (selectedIndex < viewportStart) {
      setViewportStart(selectedIndex)
    } else if (selectedIndex >= viewportStart + maxVisibleMessages) {
      setViewportStart(selectedIndex - maxVisibleMessages + 1)
    }
  }, [selectedIndex, messages.length, maxVisibleMessages])

  // Handle keyboard navigation
  useInput(
    (input, key) => {
      if (!isActive || selectedIndex === null) return

      if (input === 'j' || key.downArrow) {
        const newIndex = Math.min(selectedIndex + 1, messages.length - 1)
        onSelectChange(newIndex)
      } else if (input === 'k' || key.upArrow) {
        const newIndex = Math.max(selectedIndex - 1, 0)
        onSelectChange(newIndex)
      } else if (input === 'h') {
        onOpenFullChat()
      }
    },
    { isActive },
  )

  // Calculate visible messages
  const visibleMessages = useMemo(() => {
    const end = Math.min(viewportStart + maxVisibleMessages, messages.length)
    return messages.slice(viewportStart, end).map((msg, i) => ({
      message: msg,
      globalIndex: viewportStart + i,
    }))
  }, [messages, viewportStart, maxVisibleMessages])

  // Calculate max content width (width minus border, padding, prefix)
  const contentWidth = width - 4 // 2 for border, 2 for padding
  const prefixWidth = 5 // "AI: " or "You: "
  const textWidth = contentWidth - prefixWidth - 1 // -1 for selection indicator

  return (
    <Box
      flexDirection="column"
      width={width}
      borderStyle="single"
      borderColor="gray"
      paddingX={1}
      flexShrink={0}
    >
      {/* Header */}
      <Box marginBottom={0}>
        <Text bold dimColor>
          Chat Log
        </Text>
        <Text dimColor> ({messages.length})</Text>
      </Box>

      {/* Messages */}
      {messages.length === 0 ? (
        <Text dimColor>No messages yet...</Text>
      ) : (
        visibleMessages.map(({ message, globalIndex }) => {
          const isSelected = globalIndex === selectedIndex
          const prefix = message.role === 'assistant' ? 'AI: ' : 'You:'
          const prefixColor = message.role === 'assistant' ? 'cyan' : 'green'
          const truncated = truncateText(message.content, textWidth)

          return (
            <Box key={`${message.timestamp}-${globalIndex}`}>
              <Text color={isSelected ? 'cyan' : undefined}>
                {isSelected ? '>' : ' '}
              </Text>
              <Text
                color={isSelected ? prefixColor : undefined}
                dimColor={!isSelected}
              >
                {prefix}
              </Text>
              <Text dimColor={!isSelected}>{truncated}</Text>
            </Box>
          )
        })
      )}

      {/* Scroll indicator */}
      {messages.length > maxVisibleMessages && (
        <Text dimColor>
          {viewportStart > 0 ? '...' : '   '}
          {viewportStart + maxVisibleMessages < messages.length ? ' more below' : ''}
        </Text>
      )}

      {/* Footer with hints */}
      <Box marginTop={0}>
        <Text dimColor>
          {isActive ? '[j/k] nav [h] full' : ''}
        </Text>
      </Box>
    </Box>
  )
}
