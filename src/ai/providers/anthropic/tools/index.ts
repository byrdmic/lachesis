// Tool executor barrel and dispatcher

import { executeRead } from './read'
import { executeWrite } from './write'
import { executeEdit } from './edit'
import { executeGlob } from './glob'
import { executeGrep } from './grep'
import type { ToolName } from './definitions'
import type { ToolInput, ToolExecutionResult, ToolExecutorContext } from './types'

/**
 * Execute a tool by name with the given input.
 */
export async function executeTool(
  toolName: string,
  input: ToolInput,
  context: ToolExecutorContext,
): Promise<ToolExecutionResult> {
  switch (toolName as ToolName) {
    case 'Read':
      return executeRead(input as { file_path: string }, context)
    case 'Write':
      return executeWrite(input as { file_path: string; content: string }, context)
    case 'Edit':
      return executeEdit(input as { file_path: string; diff: string }, context)
    case 'Glob':
      return executeGlob(input as { pattern: string }, context)
    case 'Grep':
      return executeGrep(input as { pattern: string; glob?: string }, context)
    default:
      return {
        success: false,
        output: '',
        error: `Unknown tool: ${toolName}`,
      }
  }
}

// Re-export types and definitions
export * from './types'
export * from './definitions'
