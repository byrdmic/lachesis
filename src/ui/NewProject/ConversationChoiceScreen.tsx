import React, { useState } from 'react'
import { Box, Text, useInput } from 'ink'

type ConversationChoice = 'conversation' | 'quick_capture'

type ConversationChoiceScreenProps = {
  projectName: string
  onChoice: (choice: ConversationChoice) => void
}

const CHOICE_OPTIONS = [
  {
    label: 'AI-guided planning chat',
    value: 'conversation' as const,
    description: 'Have a conversation to explore and plan your idea',
  },
  {
    label: 'Quick capture',
    value: 'quick_capture' as const,
    description: 'Fill in key fields directly',
  },
]

export function ConversationChoiceScreen({
  projectName,
  onChoice,
}: ConversationChoiceScreenProps) {
  const [selectedIndex, setSelectedIndex] = useState(0)

  useInput((input, key) => {
    if (key.upArrow || input === 'k') {
      setSelectedIndex((i) => Math.max(0, i - 1))
    }
    if (key.downArrow || input === 'j') {
      setSelectedIndex((i) => Math.min(CHOICE_OPTIONS.length - 1, i + 1))
    }
    if (key.return) {
      const option = CHOICE_OPTIONS[selectedIndex]
      if (option) {
        onChoice(option.value)
      }
    }
  })

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold>You have a well-defined idea for "{projectName}"</Text>
      <Text dimColor>How would you like to proceed?</Text>
      <Text>{'\n'}</Text>

      {CHOICE_OPTIONS.map((option, index) => (
        <Box key={option.value} flexDirection="column" marginBottom={1}>
          <Text color={index === selectedIndex ? 'cyan' : undefined}>
            {index === selectedIndex ? '❯ ' : '  '}
            {option.label}
          </Text>
          <Text dimColor>  {option.description}</Text>
        </Box>
      ))}
    </Box>
  )
}
