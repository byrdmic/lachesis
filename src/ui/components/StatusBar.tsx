import React from 'react'
import { Box, Text } from 'ink'
import type { LachesisConfig } from '../../config/types.ts'

type StatusBarProps = {
  config: LachesisConfig
  onSettingsPress?: () => void
  showSettingsHint?: boolean
}

export function StatusBar({
  config,
  onSettingsPress,
  showSettingsHint = true,
}: StatusBarProps) {
  return (
    <Box
      borderStyle="single"
      borderColor="gray"
      paddingX={1}
      justifyContent="space-between"
    >
      <Box flexDirection="column">
        <Box>
          <Text dimColor>AI: </Text>
          <Text color="green">Connected ({config.defaultProvider})</Text>
        </Box>
        <Box>
          <Text dimColor>Vault: </Text>
          <Text color="cyan">{config.vaultPath || 'Not set'}</Text>
        </Box>
      </Box>
      {showSettingsHint && (
        <Box>
          <Text dimColor>[s] Settings</Text>
        </Box>
      )}
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
