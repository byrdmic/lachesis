import React, { useState } from 'react'
import { Box, Text, useInput } from 'ink'
import type { LachesisConfig } from '../../config/types.ts'
import type { AIStatusDescriptor } from '../components/StatusBar.tsx'
import { StatusBar } from '../components/index.ts'

type ConfirmNewProjectDialogProps = {
  config: LachesisConfig
  aiStatus: AIStatusDescriptor
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmNewProjectDialog({
  config,
  aiStatus,
  onConfirm,
  onCancel,
}: ConfirmNewProjectDialogProps) {
  const [selected, setSelected] = useState(1) // Default to "No, go back"

  useInput((input, key) => {
    if (key.upArrow || input === 'k') {
      setSelected((s) => Math.max(0, s - 1))
    }
    if (key.downArrow || input === 'j') {
      setSelected((s) => Math.min(1, s + 1))
    }
    if (key.return) {
      if (selected === 0) {
        onConfirm()
      } else {
        onCancel()
      }
    }
    if (key.escape) {
      onCancel()
    }
  })

  return (
    <Box flexDirection="column" width="100%">
      <Box padding={1} flexDirection="column">
        <Box marginBottom={1}>
          <Text bold>Lachesis Project Foundations Studio</Text>
        </Box>

        <Box
          borderStyle="round"
          borderColor="yellow"
          paddingX={2}
          paddingY={1}
          marginBottom={1}
          flexDirection="column"
        >
          <Text color="yellow" bold>⚠ Warning</Text>
          <Text>{'\n'}</Text>
          <Text>You have an existing new project in progress.</Text>
          <Text>Starting a new project will erase all progress on that project.</Text>
        </Box>

        <Text bold>Are you sure you want to start fresh?</Text>
        <Box flexDirection="column" marginTop={1}>
          <Text color={selected === 0 ? 'red' : undefined}>
            {selected === 0 ? '❯ ' : '  '}Yes, discard and start fresh
          </Text>
          <Text color={selected === 1 ? 'cyan' : undefined}>
            {selected === 1 ? '❯ ' : '  '}No, go back to menu
          </Text>
        </Box>

        <Box marginTop={1}>
          <Text dimColor>Use ↑/↓ to choose, Enter to confirm, ESC to cancel</Text>
        </Box>
      </Box>

      <StatusBar config={config} aiStatus={aiStatus} showSettingsHint={false} />
    </Box>
  )
}
