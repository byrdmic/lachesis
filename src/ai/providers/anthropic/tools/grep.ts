// Grep tool executor

import * as fs from 'fs'
import * as path from 'path'
import { walkDirectory, matchGlob } from './utils'
import type { ToolExecutionResult, ToolExecutorContext } from './types'

export type GrepInput = {
  pattern: string
  glob?: string
}

// Default file extensions to search when no glob is provided
const DEFAULT_EXTENSIONS = /\.(md|ts|tsx|js|jsx|json|css|html|yml|yaml|txt)$/

// Maximum number of results to return
const MAX_RESULTS = 100

/**
 * Search for a pattern in files.
 * Returns matching lines with file paths and line numbers.
 */
export async function executeGrep(
  input: GrepInput,
  context: ToolExecutorContext,
): Promise<ToolExecutionResult> {
  try {
    const allFiles = walkDirectory(context.projectPath)

    // Filter files by glob pattern or default extensions
    const filesToSearch = allFiles.filter((f) => {
      const relativePath = path.relative(context.projectPath, f).replace(/\\/g, '/')

      if (input.glob) {
        return matchGlob(relativePath, input.glob)
      }

      return DEFAULT_EXTENSIONS.test(f)
    })

    // Compile the search pattern
    let regex: RegExp
    try {
      regex = new RegExp(input.pattern, 'gi')
    } catch {
      return {
        success: false,
        output: '',
        error: `Invalid regex pattern: ${input.pattern}`,
      }
    }

    const results: string[] = []

    for (const file of filesToSearch) {
      if (results.length >= MAX_RESULTS) {
        break
      }

      try {
        const content = fs.readFileSync(file, 'utf-8')
        const lines = content.split('\n')
        const relativePath = path.relative(context.projectPath, file).replace(/\\/g, '/')

        for (let i = 0; i < lines.length; i++) {
          // Reset regex state for each line (since we use 'g' flag)
          regex.lastIndex = 0

          if (regex.test(lines[i])) {
            const lineNum = i + 1
            const line = lines[i].trim()
            // Truncate long lines
            const displayLine = line.length > 200 ? line.slice(0, 200) + '...' : line
            results.push(`${relativePath}:${lineNum}: ${displayLine}`)

            if (results.length >= MAX_RESULTS) {
              break
            }
          }
        }
      } catch {
        // Skip files that can't be read (binary files, permission issues)
        continue
      }
    }

    if (results.length === 0) {
      return {
        success: true,
        output: `No matches found for pattern: ${input.pattern}`,
      }
    }

    let output = results.join('\n')
    if (results.length >= MAX_RESULTS) {
      output += `\n\n(Results limited to ${MAX_RESULTS} matches)`
    }

    return {
      success: true,
      output,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return {
      success: false,
      output: '',
      error: `Failed to search: ${message}`,
    }
  }
}
