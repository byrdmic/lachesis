// Main entry point for building system prompts

import type { SystemPromptOptions } from './types'
import { getTimeGreeting } from './constants'
import { buildExistingProjectPrompt } from './existing-project'
import { buildNewProjectPrompt } from './new-project'

export function buildSystemPrompt(options: SystemPromptOptions): string {
  const {
    sessionType = 'new',
    projectName = '',
    currentHour = new Date().getHours(),
    isFirstMessage = true,
    snapshotSummary = '',
  } = options

  const timeGreeting = getTimeGreeting(currentHour)

  // Handle existing project sessions differently
  if (sessionType === 'existing') {
    return buildExistingProjectPrompt({
      projectName,
      timeGreeting,
      isFirstMessage,
      snapshotSummary,
      activeWorkflow: options.activeWorkflow,
      workflowFileContents: options.workflowFileContents,
      focusedFile: options.focusedFile,
      focusedFileContents: options.focusedFileContents,
      recentCommits: options.recentCommits,
      chatMode: options.chatMode,
    })
  }

  // New project discovery
  return buildNewProjectPrompt(options)
}
