// Write tool executor

import * as fs from 'fs'
import * as path from 'path'
import { validatePath } from './utils'
import type { ToolExecutionResult, ToolExecutorContext } from './types'

export type WriteInput = {
  file_path: string
  content: string
}

/**
 * Write content to a file, creating directories if needed.
 */
export async function executeWrite(
  input: WriteInput,
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

  try {
    // Ensure the parent directory exists
    const parentDir = path.dirname(absolutePath)
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true })
    }

    // Write the file
    fs.writeFileSync(absolutePath, input.content, 'utf-8')

    return {
      success: true,
      output: `Successfully wrote ${input.content.length} characters to ${input.file_path}`,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return {
      success: false,
      output: '',
      error: `Failed to write file: ${message}`,
    }
  }
}
