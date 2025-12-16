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

/**
 * Parse hint markers from message content
 * Returns { content: string, hint: string | null }
 *
 * STRICT parsing: only accepts exactly {{hint}}...{{/hint}}
 * Malformed hints are stripped entirely rather than shown broken
 */
function parseHint(content: string): { content: string; hint: string | null } {
  // Strict regex: exactly {{hint}} and {{/hint}} with no typos
  const strictMatch = content.match(/\{\{hint\}\}([\s\S]*?)\{\{\/hint\}\}/)

  if (strictMatch && strictMatch[1]) {
    const hint = strictMatch[1].trim()
    const cleanContent = content.replace(/\{\{hint\}\}[\s\S]*?\{\{\/hint\}\}/g, '').trim()
    return { content: cleanContent, hint: hint || null }
  }

  // If there's a malformed hint marker, strip it entirely (don't show broken hints)
  // This catches typos like {/{hint}}, {{hint}...{/hint}}, etc.
  const hasMalformedHint = /\{+\/?hint\}+/i.test(content)
  if (hasMalformedHint) {
    // Strip anything that looks like a hint block attempt
    const cleanContent = content
      .replace(/\{+hint\}+[\s\S]*?\{+\/?hint\}+/gi, '')
      .replace(/\{+\/?hint\}+/gi, '')
      .trim()
    return { content: cleanContent, hint: null }
  }

  return { content, hint: null }
}

function MessageBubble({ message }: { message: ConversationMessage }) {
  const isAssistant = message.role === 'assistant'

  // Parse hints from assistant messages
  const { content, hint } = isAssistant
    ? parseHint(message.content)
    : { content: message.content, hint: null }

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text color={isAssistant ? 'cyan' : 'green'} bold>
        {isAssistant ? 'AI:' : 'You:'}
      </Text>
      <Box marginLeft={2} flexDirection="column">
        <Text wrap="wrap">{content}</Text>
        {hint && (
          <Box marginTop={1}>
            <Text dimColor wrap="wrap">({hint})</Text>
          </Box>
        )}
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
