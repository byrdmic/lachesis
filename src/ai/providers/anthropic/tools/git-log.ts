// GitLog tool executor

import * as fs from 'fs'
import * as path from 'path'
import { fetchCommits, formatCommitLog } from '../../../../github/client'
import type { ToolExecutionResult, ToolExecutorContext } from './types'

export type GitLogInput = {
  count?: number
  since?: string
  until?: string
}

type AIConfig = {
  github_repo?: string
}

/**
 * Fetch recent commits from the project's configured GitHub repository.
 */
export async function executeGitLog(
  input: GitLogInput,
  context: ToolExecutorContext,
): Promise<ToolExecutionResult> {
  // Read .ai/config.json to get github_repo
  const configPath = path.join(context.projectPath, '.ai', 'config.json')

  if (!fs.existsSync(configPath)) {
    return {
      success: false,
      output: '',
      error: 'No .ai/config.json found. Configure a GitHub repository in the project settings.',
    }
  }

  let config: AIConfig
  try {
    const configContent = fs.readFileSync(configPath, 'utf-8')
    config = JSON.parse(configContent) as AIConfig
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return {
      success: false,
      output: '',
      error: `Failed to parse .ai/config.json: ${message}`,
    }
  }

  if (!config.github_repo) {
    return {
      success: false,
      output: '',
      error: 'No github_repo configured in .ai/config.json. Add a GitHub repository URL to use GitLog.',
    }
  }

  // Validate and clamp count
  const count = Math.min(Math.max(input.count ?? 30, 1), 100)

  // Fetch commits
  const result = await fetchCommits(config.github_repo, {
    perPage: count,
    since: input.since,
    until: input.until,
    token: context.githubToken,
  })

  if (!result.success) {
    return {
      success: false,
      output: '',
      error: result.error || 'Failed to fetch commits',
    }
  }

  if (result.data.length === 0) {
    return {
      success: true,
      output: 'No commits found for the specified criteria.',
    }
  }

  // Format commit log with dates
  const formattedLog = formatCommitLog(result.data, { includeDate: true })

  return {
    success: true,
    output: `Found ${result.data.length} commit${result.data.length === 1 ? '' : 's'}:\n\n${formattedLog}`,
  }
}
