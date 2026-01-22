// Read tool executor

import * as fs from 'fs'
import { validatePath } from './utils'
import type { ToolExecutionResult, ToolExecutorContext } from './types'

export type ReadInput = {
  file_path: string
}

/**
 * Read the contents of a file.
 */
export async function executeRead(
  input: ReadInput,
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
    const stat = fs.statSync(absolutePath)

    if (stat.isDirectory()) {
      return {
        success: false,
        output: '',
        error: `Path is a directory, not a file: ${input.file_path}`,
      }
    }

    const content = fs.readFileSync(absolutePath, 'utf-8')
    return {
      success: true,
      output: content,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return {
      success: false,
      output: '',
      error: `Failed to read file: ${message}`,
    }
  }
}
