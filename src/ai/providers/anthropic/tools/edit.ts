// Edit tool executor

import * as fs from 'fs'
import { parseDiff, applyDiff } from '../../../../utils/diff'
import { validatePath } from './utils'
import type { ToolExecutionResult, ToolExecutorContext } from './types'

export type EditInput = {
  file_path: string
  diff: string
}

/**
 * Apply a unified diff to an existing file.
 * Reuses the robust diff application logic from src/utils/diff.ts.
 */
export async function executeEdit(
  input: EditInput,
  context: ToolExecutorContext,
): Promise<ToolExecutionResult> {
  const absolutePath = validatePath(context.projectPath, input.file_path)

  if (!absolutePath) {
    return {
      success: false,
      output: '',
      error: `Invalid path: "${input.file_path}" - path must be within the project directory`,
    }
  }

  if (!fs.existsSync(absolutePath)) {
    return {
      success: false,
      output: '',
      error: `File not found: ${input.file_path}`,
    }
  }

  try {
    const original = fs.readFileSync(absolutePath, 'utf-8')

    // Wrap the raw diff in proper format for the parser
    // The parser expects --- and +++ headers
    const fullDiff = `--- a/${input.file_path}\n+++ b/${input.file_path}\n${input.diff}`
    const parsed = parseDiff(fullDiff)

    if (!parsed) {
      return {
        success: false,
        output: '',
        error: 'Failed to parse diff. Ensure it includes @@ hunk headers (e.g., @@ -1,5 +1,6 @@).',
      }
    }

    const result = applyDiff(original, parsed)
    fs.writeFileSync(absolutePath, result, 'utf-8')

    return {
      success: true,
      output: `Successfully applied ${parsed.hunks.length} hunk(s) to ${input.file_path}`,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return {
      success: false,
      output: '',
      error: `Failed to apply diff: ${message}`,
    }
  }
}
