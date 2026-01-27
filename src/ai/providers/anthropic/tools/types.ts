// Shared types for tool executors

export type ToolInput = Record<string, unknown>

export type ToolExecutionResult = {
  success: boolean
  output: string
  error?: string
}

export type ToolExecutorContext = {
  projectPath: string // Absolute path to project directory
  githubToken?: string // Optional GitHub token for private repos
}
