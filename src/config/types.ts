// Configuration types for Lachesis

export type AIProvider = 'anthropic' | 'openai' | 'vertex' | 'other'

// MCP (Model Context Protocol) configuration
export type MCPWriteMode = 'confirm' | 'auto' | 'disabled'

export type MCPConfig = {
  enabled: boolean
  obsidian: {
    apiKeyEnvVar: string // Env var name for Obsidian REST API key
    host: string // Obsidian REST API host (Windows IP from WSL)
    port: number // Default: 27124
  }
  writeMode: MCPWriteMode
  scopeWritesToProject: boolean // Restrict writes to active project folder
}

export const DEFAULT_MCP_CONFIG: MCPConfig = {
  enabled: false,
  obsidian: {
    apiKeyEnvVar: 'OBSIDIAN_API_KEY',
    host: '127.0.0.1',
    port: 27124,
  },
  writeMode: 'auto',
  scopeWritesToProject: true,
}

export type LachesisConfig = {
  vaultPath: string // Base Obsidian projects path
  // AI configuration
  defaultProvider: AIProvider
  defaultModel: string
  apiKeyEnvVar: string
  // MCP configuration (optional, disabled by default)
  mcp?: MCPConfig
}

export const DEFAULT_CONFIG: LachesisConfig = {
  vaultPath: '', // Will be set based on OS detection
  defaultProvider: 'openai',
  defaultModel: 'gpt-5.2',
  apiKeyEnvVar: 'OPENAI_API_KEY',
}

export const OPENAI_MODELS = [
  'gpt-5.2-pro',
  'gpt-5.2-chat-latest',
  'gpt-5.2',
  'gpt-5.1-codex-mini',
  'gpt-5.1-codex',
  'gpt-5.1',
  'gpt-5-mini',
  'gpt-5-nano',
] as const

export type OpenAIModelId = (typeof OPENAI_MODELS)[number]
