import React, { useEffect } from 'react'
import { Box, Text } from 'ink'
import type { LachesisConfig } from '../../config/types.ts'
import type { AIStatusDescriptor } from '../components/StatusBar.tsx'
import { StatusBar } from '../components/index.ts'

type WelcomeScreenProps = {
  config: LachesisConfig
  aiStatus: AIStatusDescriptor
  onStart: () => void
}

export function WelcomeScreen({ config, aiStatus, onStart }: WelcomeScreenProps) {
  // Auto-advance after brief display
  useEffect(() => {
    const timer = setTimeout(onStart, 100)
    return () => clearTimeout(timer)
  }, [onStart])

  return (
    <Box flexDirection="column" width="100%">
      <Box flexDirection="column" padding={1}>
        <Box
          borderStyle="double"
          borderColor="cyan"
          paddingX={3}
          paddingY={1}
          marginBottom={1}
        >
          <Text color="cyan" bold>
            Lachesis Project Foundations Studio
          </Text>
        </Box>
        <Text>Welcome. Let's shape your idea into a structured project.</Text>
      </Box>
      <StatusBar config={config} aiStatus={aiStatus} />
    </Box>
  )
}
