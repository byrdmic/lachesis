// OpenAI-compatible tool definitions using Vercel AI SDK format
// Wraps the existing tool executors from anthropic/tools

import { tool } from 'ai'
import { z } from 'zod'
import { executeTool } from '../anthropic/tools'
import type { ToolExecutorContext } from '../anthropic/tools/types'

// Tool parameter schemas
const ReadSchema = z.object({
  file_path: z.string().describe('Path to the file relative to the project root'),
})

const WriteSchema = z.object({
  file_path: z.string().describe('Path to the file relative to the project root'),
  content: z.string().describe('The content to write to the file'),
})

const EditSchema = z.object({
  file_path: z.string().describe('Path to the file relative to the project root'),
  diff: z
    .string()
    .describe(
      'The unified diff to apply. Must include @@ hunk headers (e.g., @@ -1,5 +1,6 @@) followed by context lines (starting with space), removed lines (starting with -), and added lines (starting with +).',
    ),
})

const GlobSchema = z.object({
  pattern: z
    .string()
    .describe('The glob pattern to match files against (e.g., "*.md", "**/*.ts", "src/**/*.json")'),
})

const GrepSchema = z.object({
  pattern: z.string().describe('Regular expression pattern to search for'),
  glob: z
    .string()
    .optional()
    .describe(
      'Optional glob pattern to filter which files to search. If not provided, searches common text files (md, ts, js, json).',
    ),
})

/**
 * Create Vercel AI SDK tools that wrap our existing tool executors.
 */
export function createTools(context: ToolExecutorContext) {
  return {
    Read: tool({
      description:
        'Read the contents of a file. Use this to understand file content before making changes.',
      inputSchema: ReadSchema,
      execute: async (params) => {
        const result = await executeTool('Read', { file_path: params.file_path }, context)
        if (!result.success) {
          throw new Error(result.error || 'Failed to read file')
        }
        return result.output
      },
    }),

    Write: tool({
      description:
        'Write content to a file, creating it if it does not exist. Use this for creating new files or completely replacing file content.',
      inputSchema: WriteSchema,
      execute: async (params) => {
        const result = await executeTool('Write', { file_path: params.file_path, content: params.content }, context)
        if (!result.success) {
          throw new Error(result.error || 'Failed to write file')
        }
        return result.output
      },
    }),

    Edit: tool({
      description:
        'Apply a unified diff to modify an existing file. The diff should be in standard unified diff format with @@ hunk headers.',
      inputSchema: EditSchema,
      execute: async (params) => {
        const result = await executeTool('Edit', { file_path: params.file_path, diff: params.diff }, context)
        if (!result.success) {
          throw new Error(result.error || 'Failed to edit file')
        }
        return result.output
      },
    }),

    Glob: tool({
      description:
        'Find files matching a glob pattern. Supports * (any characters except /) and ** (any characters including /). Returns a list of matching file paths.',
      inputSchema: GlobSchema,
      execute: async (params) => {
        const result = await executeTool('Glob', { pattern: params.pattern }, context)
        if (!result.success) {
          throw new Error(result.error || 'Failed to glob files')
        }
        return result.output
      },
    }),

    Grep: tool({
      description:
        'Search for a pattern in files. Returns matching lines with file paths and line numbers. Useful for finding code patterns or text.',
      inputSchema: GrepSchema,
      execute: async (params) => {
        const result = await executeTool('Grep', { pattern: params.pattern, glob: params.glob }, context)
        if (!result.success) {
          throw new Error(result.error || 'Failed to grep files')
        }
        return result.output
      },
    }),
  }
}
