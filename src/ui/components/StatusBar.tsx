import React from 'react'
import { Box, Text } from 'ink'
import Spinner from 'ink-spinner'
import type { LachesisConfig, AIProvider } from '../../config/types.ts'

export type AIStatusState =
  | 'idle'
  | 'connecting'
  | 'requesting'
  | 'streaming'
  | 'waiting'
  | 'processing'
  | 'error'

export type AIStatusDescriptor = {
  state: AIStatusState
  message?: string
}

type StatusBarProps = {
  config: LachesisConfig
  aiStatus?: AIStatusDescriptor
  onSettingsPress?: () => void
  showSettingsHint?: boolean
  /** Currently loaded project name */
  projectName?: string
}

const STATUS_STYLES: Record<
  AIStatusState,
  { icon: string; color: string; defaultMessage: string; spin?: boolean }
> = {
  idle: { icon: '●', color: 'green', defaultMessage: 'Ready' },
  connecting: {
    icon: '⟳',
    color: 'cyan',
    defaultMessage: 'Linking to provider',
    spin: true,
  },
  requesting: {
    icon: '⇢',
    color: 'cyan',
    defaultMessage: 'Sending request',
    spin: true,
  },
  streaming: {
    icon: '…',
    color: 'cyan',
    defaultMessage: 'Streaming response',
    spin: true,
  },
  waiting: { icon: '⏳', color: 'yellow', defaultMessage: 'Waiting for input' },
  processing: {
    icon: '⚙',
    color: 'magenta',
    defaultMessage: 'Processing output',
    spin: true,
  },
  error: { icon: '✖', color: 'red', defaultMessage: 'Needs attention' },
}

const DEFAULT_STATUS: AIStatusDescriptor = { state: 'idle', message: 'Ready' }

function formatProviderLabel(provider: AIProvider): string {
  switch (provider) {
    case 'openai':
      return 'OpenAI'
    case 'anthropic':
      return 'Anthropic'
    case 'vertex':
      return 'Vertex AI'
    default:
      return 'Custom'
  }
}

export function StatusBar({
  config,
  aiStatus = DEFAULT_STATUS,
  onSettingsPress,
  showSettingsHint = true,
  projectName,
}: StatusBarProps) {
  const status = STATUS_STYLES[aiStatus.state] ?? STATUS_STYLES.idle
  const message = aiStatus.message || status.defaultMessage
  const providerLabel = formatProviderLabel(config.defaultProvider)
  const modelLabel = config.defaultModel || 'Not set'
  const showSpinner = Boolean(status.spin)

  return (
    <Box
      borderStyle="single"
      borderColor={projectName ? 'cyan' : 'gray'}
      paddingX={1}
      justifyContent="space-between"
    >
      <Box flexDirection="column">
        {projectName && (
          <Box>
            <Text dimColor>Project: </Text>
            <Text color="green" bold>
              {projectName}
            </Text>
          </Box>
        )}
        <Box>
          <Text dimColor>Provider: </Text>
          <Text color="cyan">{providerLabel}</Text>
          <Text>  </Text>
          <Text dimColor>Model: </Text>
          <Text color="cyan">{modelLabel}</Text>
        </Box>
        <Box>
          <Text dimColor>Status: </Text>
          <Text color={status.color}>
            {showSpinner ? (
              <>
                <Spinner type="dots" /> {message}
              </>
            ) : (
              <>
                {status.icon} {message}
              </>
            )}
          </Text>
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
  aiStatus?: AIStatusDescriptor
}

export function AIStatus({ config, aiStatus = DEFAULT_STATUS }: AIStatusProps) {
  const status = STATUS_STYLES[aiStatus.state] ?? STATUS_STYLES.idle
  const message = aiStatus.message || status.defaultMessage
  const providerLabel = formatProviderLabel(config.defaultProvider)

  return (
    <Box>
      <Text dimColor>AI: </Text>
      <Text color={status.color}>
        {status.spin ? <Spinner type="dots" /> : status.icon} {providerLabel} ·{' '}
        {config.defaultModel} — {message}
      </Text>
    </Box>
  )
}
