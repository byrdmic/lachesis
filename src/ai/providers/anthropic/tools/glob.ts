// Glob tool executor

import * as path from 'path'
import { walkDirectory, matchGlob } from './utils'
import type { ToolExecutionResult, ToolExecutorContext } from './types'

export type GlobInput = {
  pattern: string
}

/**
 * Find files matching a glob pattern.
 */
export async function executeGlob(
  input: GlobInput,
  context: ToolExecutorContext,
): Promise<ToolExecutionResult> {
  try {
    const files = walkDirectory(context.projectPath)

    // Convert to relative paths with forward slashes
    const relativePaths = files.map((f) =>
      path.relative(context.projectPath, f).replace(/\\/g, '/'),
    )

    // Filter by glob pattern
    const matched = relativePaths.filter((f) => matchGlob(f, input.pattern))

    // Sort alphabetically for consistent output
    matched.sort()

    if (matched.length === 0) {
      return {
        success: true,
        output: `No files matched pattern: ${input.pattern}`,
      }
    }

    return {
      success: true,
      output: matched.join('\n'),
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return {
      success: false,
      output: '',
      error: `Failed to search files: ${message}`,
    }
  }
}
