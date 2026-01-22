// Anthropic-compatible tool schemas for the custom agent loop

import type Anthropic from '@anthropic-ai/sdk'

export type ToolName = 'Glob' | 'Grep' | 'Read' | 'Edit' | 'Write'

export const TOOL_DEFINITIONS: Anthropic.Tool[] = [
  {
    name: 'Read',
    description: 'Read the contents of a file. Use this to understand file content before making changes.',
    input_schema: {
      type: 'object' as const,
      properties: {
        file_path: {
          type: 'string',
          description: 'Path to the file relative to the project root',
        },
      },
      required: ['file_path'],
    },
  },
  {
    name: 'Write',
    description:
      'Write content to a file, creating it if it does not exist. Use this for creating new files or completely replacing file content.',
    input_schema: {
      type: 'object' as const,
      properties: {
        file_path: {
          type: 'string',
          description: 'Path to the file relative to the project root',
        },
        content: {
          type: 'string',
          description: 'The content to write to the file',
        },
      },
      required: ['file_path', 'content'],
    },
  },
  {
    name: 'Edit',
    description:
      'Apply a unified diff to modify an existing file. The diff should be in standard unified diff format with @@ hunk headers.',
    input_schema: {
      type: 'object' as const,
      properties: {
        file_path: {
          type: 'string',
          description: 'Path to the file relative to the project root',
        },
        diff: {
          type: 'string',
          description:
            'The unified diff to apply. Must include @@ hunk headers (e.g., @@ -1,5 +1,6 @@) followed by context lines (starting with space), removed lines (starting with -), and added lines (starting with +).',
        },
      },
      required: ['file_path', 'diff'],
    },
  },
  {
    name: 'Glob',
    description:
      'Find files matching a glob pattern. Supports * (any characters except /) and ** (any characters including /). Returns a list of matching file paths.',
    input_schema: {
      type: 'object' as const,
      properties: {
        pattern: {
          type: 'string',
          description: 'The glob pattern to match files against (e.g., "*.md", "**/*.ts", "src/**/*.json")',
        },
      },
      required: ['pattern'],
    },
  },
  {
    name: 'Grep',
    description:
      'Search for a pattern in files. Returns matching lines with file paths and line numbers. Useful for finding code patterns or text.',
    input_schema: {
      type: 'object' as const,
      properties: {
        pattern: {
          type: 'string',
          description: 'Regular expression pattern to search for',
        },
        glob: {
          type: 'string',
          description:
            'Optional glob pattern to filter which files to search. If not provided, searches common text files (md, ts, js, json).',
        },
      },
      required: ['pattern'],
    },
  },
]
