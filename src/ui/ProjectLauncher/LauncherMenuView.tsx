import React from 'react'
import { Box, Text } from 'ink'
import type { LachesisConfig } from '../../config/types.ts'
import type { AIStatusDescriptor, MCPStatusDescriptor, ActiveChatInfo } from '../components/StatusBar.tsx'
import { Select, StatusBar } from '../components/index.ts'
import {
  getNewProjectInProgress,
  getActiveExistingProject,
} from '../../core/conversation-store.ts'

type LauncherMenuViewProps = {
  config: LachesisConfig
  hasWIP: boolean
  debug: boolean
  aiStatus: AIStatusDescriptor
  mcpStatus: MCPStatusDescriptor
  settingsHotkeyEnabled: boolean
  onMenuSelect: (value: string) => void
}

export function LauncherMenuView({
  config,
  hasWIP,
  debug,
  aiStatus,
  mcpStatus,
  settingsHotkeyEnabled,
  onMenuSelect,
}: LauncherMenuViewProps) {
  const menuOptions = buildMenuOptions(hasWIP)
  const activeChat = getActiveChatInfo()

  return (
    <Box flexDirection="column" width="100%">
      <Box padding={1} flexDirection="column">
        <Box marginBottom={1}>
          <Text bold>Lachesis Project Foundations Studio</Text>
        </Box>
        <Select
          label="What would you like to do?"
          options={menuOptions}
          onSelect={onMenuSelect}
        />
        <Box marginTop={1}>
          <Text dimColor>
            Use ↑/↓ to choose, Enter to confirm. [s] settings{debug ? ' [m] test MCP' : ''}. [ESC]/[Q] quit.
          </Text>
        </Box>
      </Box>
      <StatusBar
        config={config}
        aiStatus={aiStatus}
        mcpStatus={debug ? mcpStatus : undefined}
        showSettingsHint={settingsHotkeyEnabled}
        activeChat={activeChat}
      />
    </Box>
  )
}

function buildMenuOptions(hasWIP: boolean) {
  const options = []

  if (hasWIP) {
    options.push({
      label: '⟳ Resume Project (Work in Progress)',
      value: 'resume',
    })
  }

  options.push(
    { label: 'Start a new project planning session', value: 'new' },
    { label: 'Load an existing project', value: 'existing' },
  )

  return options
}

function getActiveChatInfo(): ActiveChatInfo | undefined {
  const newProjectWIP = getNewProjectInProgress()
  const activeExisting = getActiveExistingProject()

  if (newProjectWIP?.projectName) {
    return {
      projectName: newProjectWIP.projectName,
      type: 'new',
    }
  }

  if (activeExisting) {
    return {
      projectName: activeExisting.name,
      type: 'existing',
    }
  }

  return undefined
}
