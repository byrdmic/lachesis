// Human-readable descriptions for tool activities
// Used to provide rich feedback to users about what tools are doing

import type { ToolName, EnhancedToolActivity, PersistedToolActivity } from '../../types'

/**
 * Generate a human-readable description for a tool based on its input.
 */
export function generateToolDescription(
  toolName: ToolName,
  input: Record<string, unknown>,
): string {
  switch (toolName) {
    case 'Read': {
      const filePath = input.file_path as string | undefined
      const fileName = filePath ? extractFileName(filePath) : 'file'
      return `Reading ${fileName}`
    }
    case 'Write': {
      const filePath = input.file_path as string | undefined
      const fileName = filePath ? extractFileName(filePath) : 'file'
      return `Writing to ${fileName}`
    }
    case 'Edit': {
      const filePath = input.file_path as string | undefined
      const fileName = filePath ? extractFileName(filePath) : 'file'
      const diff = input.diff as string | undefined
      const lineInfo = extractLineInfo(diff)
      if (lineInfo) {
        return `Editing ${fileName} (${lineInfo})`
      }
      return `Editing ${fileName}`
    }
    case 'Glob': {
      const pattern = input.pattern as string | undefined
      return pattern ? `Finding files matching ${pattern}` : 'Finding files'
    }
    case 'Grep': {
      const pattern = input.pattern as string | undefined
      const glob = input.glob as string | undefined
      if (pattern && glob) {
        return `Searching for '${truncate(pattern, 20)}' in ${glob}`
      }
      if (pattern) {
        return `Searching for '${truncate(pattern, 30)}'`
      }
      return 'Searching files'
    }
    case 'GitLog': {
      const count = input.count as number | undefined
      return `Fetching ${count ?? 30} recent commits`
    }
    default:
      return `Running ${toolName}`
  }
}

/**
 * Generate a summary of what a tool did after completion.
 */
export function generateToolSummary(
  toolName: ToolName,
  input: Record<string, unknown>,
  output: string | undefined,
  error: string | undefined,
): string {
  if (error) {
    return `Failed: ${truncate(error, 50)}`
  }

  switch (toolName) {
    case 'Read': {
      const filePath = input.file_path as string | undefined
      const fileName = filePath ? extractFileName(filePath) : 'file'
      const charCount = output?.length ?? 0
      return `Read ${formatNumber(charCount)} chars from ${fileName}`
    }
    case 'Write': {
      const filePath = input.file_path as string | undefined
      const fileName = filePath ? extractFileName(filePath) : 'file'
      const content = input.content as string | undefined
      const charCount = content?.length ?? 0
      return `Wrote ${formatNumber(charCount)} chars to ${fileName}`
    }
    case 'Edit': {
      const filePath = input.file_path as string | undefined
      const fileName = filePath ? extractFileName(filePath) : 'file'
      const diff = input.diff as string | undefined
      const stats = extractDiffStats(diff)
      if (stats) {
        return `Edited ${fileName}: ${stats}`
      }
      return `Edited ${fileName}`
    }
    case 'Glob': {
      const pattern = input.pattern as string | undefined
      const matchCount = output ? countMatches(output) : 0
      return `Found ${matchCount} file${matchCount === 1 ? '' : 's'} matching ${pattern ?? 'pattern'}`
    }
    case 'Grep': {
      const matchCount = output ? countMatches(output) : 0
      return `Found ${matchCount} match${matchCount === 1 ? '' : 'es'}`
    }
    case 'GitLog': {
      // Extract commit count from output like "Found 30 commits:\n\n..."
      const match = output?.match(/Found (\d+) commits?/)
      const commitCount = match ? parseInt(match[1], 10) : 0
      return `Fetched ${commitCount} commit${commitCount === 1 ? '' : 's'}`
    }
    default:
      return `Completed ${toolName}`
  }
}

/**
 * Convert an EnhancedToolActivity to a PersistedToolActivity for storage.
 */
export function toPersistedActivity(activity: EnhancedToolActivity): PersistedToolActivity {
  const summary = generateToolSummary(
    activity.toolName,
    activity.input,
    activity.output,
    activity.error,
  )

  const result: PersistedToolActivity = {
    id: activity.id,
    toolName: activity.toolName,
    description: activity.description,
    status: activity.status === 'running' ? 'completed' : activity.status,
    durationMs: activity.durationMs ?? 0,
    summary,
  }

  // Add change details for Edit/Write tools
  if (activity.toolName === 'Edit' || activity.toolName === 'Write') {
    const filePath = activity.input.file_path as string | undefined
    if (filePath) {
      result.changeDetails = {
        filePath,
        diffPreview: activity.toolName === 'Edit'
          ? truncateDiff(activity.input.diff as string | undefined)
          : undefined,
      }
    }
  }

  return result
}

/**
 * Generate a unique ID for a tool activity.
 */
export function generateActivityId(): string {
  return `tool-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

// ============================================================================
// Internal Helpers
// ============================================================================

function extractFileName(filePath: string): string {
  const parts = filePath.replace(/\\/g, '/').split('/')
  return parts[parts.length - 1] || filePath
}

function extractLineInfo(diff: string | undefined): string | null {
  if (!diff) return null

  // Look for @@ -start,count +start,count @@ pattern
  const match = diff.match(/@@ -(\d+)/)
  if (match) {
    return `line ${match[1]}`
  }
  return null
}

function extractDiffStats(diff: string | undefined): string | null {
  if (!diff) return null

  const lines = diff.split('\n')
  let added = 0
  let removed = 0

  for (const line of lines) {
    if (line.startsWith('+') && !line.startsWith('+++')) {
      added++
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      removed++
    }
  }

  if (added === 0 && removed === 0) return null
  if (added > 0 && removed > 0) return `+${added}/-${removed} lines`
  if (added > 0) return `+${added} line${added === 1 ? '' : 's'}`
  return `-${removed} line${removed === 1 ? '' : 's'}`
}

function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str
  return str.slice(0, maxLength - 3) + '...'
}

function truncateDiff(diff: string | undefined, maxLines = 10): string | undefined {
  if (!diff) return undefined

  const lines = diff.split('\n')
  if (lines.length <= maxLines) return diff

  return lines.slice(0, maxLines).join('\n') + '\n... (truncated)'
}

function formatNumber(num: number): string {
  if (num >= 1000) {
    return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'k'
  }
  return num.toString()
}

function countMatches(output: string): number {
  // Count non-empty lines
  return output.split('\n').filter((line) => line.trim()).length
}
