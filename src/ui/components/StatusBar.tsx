import React from 'react'
import { Box, Text } from 'ink'
import type { LachesisConfig } from '../../config/types.ts'

type StatusBarProps = {
  config: LachesisConfig
  onSettingsPress?: () => void
}

export function StatusBar({ config, onSettingsPress }: StatusBarProps) {
  return (
    <Box
      borderStyle="single"
      borderColor="gray"
      paddingX={1}
      justifyContent="space-between"
    >
      <Box>
        <Text dimColor>AI: </Text>
        <Text color="green">Connected ({config.defaultProvider})</Text>
      </Box>
      <Box>
        <Text dimColor>[S] Settings</Text>
      </Box>
    </Box>
  )
}

type AIStatusProps = {
  config: LachesisConfig
}

export function AIStatus({ config }: AIStatusProps) {

  return (
    <Box>
      <Text dimColor>AI: </Text>
      <Text color="green">
        Connected ({config.defaultProvider}/{config.defaultModel})
      </Text>
    </Box>
  )
}
