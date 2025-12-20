import React from 'react'
import { Box, Text } from 'ink'
import Spinner from 'ink-spinner'
import type { LachesisConfig } from '../../config/types.ts'
import { getProviderDisplayName } from '../../config/types.ts'

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

export type MCPStatusState = 'idle' | 'connecting' | 'connected' | 'error'

export type MCPStatusDescriptor = {
  state: MCPStatusState
  toolCount?: number
  error?: string
}

export type ActiveChatInfo = {
  projectName: string
  type: 'new' | 'existing'
}

type StatusBarProps = {
  config: LachesisConfig
  aiStatus?: AIStatusDescriptor
  mcpStatus?: MCPStatusDescriptor
  onSettingsPress?: () => void
  showSettingsHint?: boolean
  /** Currently loaded project name */
  projectName?: string
  /** Active chat info (for main menu - shows reminder of active chat) */
  activeChat?: ActiveChatInfo
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

export function StatusBar({
  config,
  aiStatus = DEFAULT_STATUS,
  mcpStatus,
  onSettingsPress,
  showSettingsHint = true,
  projectName,
  activeChat,
}: StatusBarProps) {
  const status = STATUS_STYLES[aiStatus.state] ?? STATUS_STYLES.idle
  const message = aiStatus.message || status.defaultMessage
  const providerLabel = getProviderDisplayName(config.defaultProvider)
  const modelLabel = config.defaultModel || 'Not set'
  const showSpinner = Boolean(status.spin)

  // Format MCP status display
  const getMCPDisplay = () => {
    if (!mcpStatus || mcpStatus.state === 'idle') {
      return null
    }

    switch (mcpStatus.state) {
      case 'connecting':
        return { icon: '⟳', color: 'cyan', text: 'Connecting...', spin: true }
      case 'connected':
        const tools = mcpStatus.toolCount ?? 0
        return { icon: '●', color: 'green', text: `Connected (${tools} tools)`, spin: false }
      case 'error':
        return { icon: '✖', color: 'red', text: mcpStatus.error || 'Error', spin: false }
      default:
        return null
    }
  }

  const mcpDisplay = getMCPDisplay()

  // Determine border color: activeChat gets yellow, projectName gets cyan, otherwise gray
  const borderColor = activeChat ? 'yellow' : projectName ? 'cyan' : 'gray'

  return (
    <Box
      borderStyle="single"
      borderColor={borderColor}
      paddingX={1}
      justifyContent="space-between"
    >
      <Box flexDirection="column">
        {activeChat && (
          <Box>
            <Text color="yellow" bold>
              Active Chat:{' '}
            </Text>
            <Text color="yellow" bold>
              {activeChat.projectName}
            </Text>
            <Text dimColor>
              {' '}({activeChat.type === 'new' ? 'new project' : 'existing'})
            </Text>
          </Box>
        )}
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
        {mcpDisplay && (
          <Box>
            <Text dimColor>MCP: </Text>
            <Text color={mcpDisplay.color}>
              {mcpDisplay.spin ? (
                <>
                  <Spinner type="dots" /> {mcpDisplay.text}
                </>
              ) : (
                <>
                  {mcpDisplay.icon} {mcpDisplay.text}
                </>
              )}
            </Text>
          </Box>
        )}
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
  const providerLabel = getProviderDisplayName(config.defaultProvider)

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
