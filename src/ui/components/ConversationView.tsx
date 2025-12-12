import React from 'react'
import { Box, Text } from 'ink'
import type { ConversationMessage } from '../../ai/client.ts'

type ConversationViewProps = {
  messages: ConversationMessage[]
  maxRecent?: number // How many recent messages to show (default 50)
}

/**
 * Displays conversation history with natural terminal scrolling.
 * All messages are rendered and the terminal handles overflow.
 */
export function ConversationView({
  messages,
  maxRecent = 50,
}: ConversationViewProps) {
  if (messages.length === 0) {
    return null
  }

  // Show recent messages for performance
  const recentMessages = messages.slice(-maxRecent)

  return (
    <Box flexDirection="column" width="100%">
      {recentMessages.map((msg, i) => (
        <MessageBubble key={`${msg.timestamp}-${i}`} message={msg} />
      ))}
    </Box>
  )
}

function MessageBubble({ message }: { message: ConversationMessage }) {
  const isAssistant = message.role === 'assistant'

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text color={isAssistant ? 'cyan' : 'green'} bold>
        {isAssistant ? 'AI:' : 'You:'}
      </Text>
      <Box marginLeft={2}>
        <Text wrap="wrap">{message.content}</Text>
      </Box>
    </Box>
  )
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
          {selected === 0 ? '> ' : '  '}Yes, continue
        </Text>
        <Text color={selected === 1 ? 'cyan' : undefined}>
          {selected === 1 ? '> ' : '  '}No, let me clarify
        </Text>
      </Box>
    </Box>
  )
}
