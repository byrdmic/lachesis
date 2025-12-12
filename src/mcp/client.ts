// MCP (Model Context Protocol) client for connecting to Obsidian MCP server

import {
  experimental_createMCPClient as createMCPClient,
  type experimental_MCPClient as MCPClient,
} from '@ai-sdk/mcp'
import { Experimental_StdioMCPTransport } from '@ai-sdk/mcp/mcp-stdio'
import type { Tool } from 'ai'
import type { MCPConfig } from '../config/types.ts'
import { debugLog } from '../debug/logger.ts'

// ============================================================================
// Types
// ============================================================================

export type MCPClientState = {
  client: MCPClient | null
  tools: Record<string, Tool>
  connected: boolean
  error?: string
  toolNames: string[]
}

// ============================================================================
// State
// ============================================================================

let mcpClientState: MCPClientState = {
  client: null,
  tools: {},
  connected: false,
  toolNames: [],
}

// ============================================================================
// Client Lifecycle
// ============================================================================

/**
 * Initialize the MCP client by spawning the mcp-obsidian server process
 */
export async function initializeMCPClient(
  config: MCPConfig,
): Promise<MCPClientState> {
  if (!config.enabled) {
    debugLog.info('MCP: Disabled in config, skipping initialization')
    return { client: null, tools: {}, connected: false, toolNames: [] }
  }

  // Check if already connected
  if (mcpClientState.connected && mcpClientState.client) {
    debugLog.info('MCP: Already connected, reusing existing client')
    return mcpClientState
  }

  try {
    // Validate API key is set
    const apiKey = process.env[config.obsidian.apiKeyEnvVar]
    if (!apiKey) {
      throw new Error(
        `MCP: ${config.obsidian.apiKeyEnvVar} environment variable not set`,
      )
    }

    debugLog.info('MCP: Initializing client', {
      host: config.obsidian.host,
      port: config.obsidian.port,
      apiKeyEnvVar: config.obsidian.apiKeyEnvVar,
    })

    // Create stdio transport for mcp-obsidian
    // The server is spawned as a child process
    const transport = new Experimental_StdioMCPTransport({
      command: 'uvx',
      args: ['mcp-obsidian'],
      env: {
        ...process.env,
        OBSIDIAN_API_KEY: apiKey,
        OBSIDIAN_HOST: config.obsidian.host,
        OBSIDIAN_PORT: String(config.obsidian.port),
      },
    })

    const client = await createMCPClient({
      name: 'lachesis-obsidian',
      transport,
      onUncaughtError: (error) => {
        debugLog.error('MCP: Uncaught error', { error })
      },
    })

    // Get available tools from the server
    const tools = await client.tools()

    const toolNames = Object.keys(tools)
    debugLog.info('MCP: Client initialized successfully', {
      toolCount: toolNames.length,
      toolNames,
    })

    mcpClientState = {
      client,
      tools,
      connected: true,
      toolNames,
    }

    return mcpClientState
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const stack = err instanceof Error ? err.stack : undefined

    debugLog.error('MCP: Failed to initialize', {
      error: message,
      stack,
    })

    mcpClientState = {
      client: null,
      tools: {},
      connected: false,
      error: message,
      toolNames: [],
    }

    return mcpClientState
  }
}

/**
 * Close the MCP client and clean up resources
 */
export async function closeMCPClient(): Promise<void> {
  if (mcpClientState.client) {
    try {
      debugLog.info('MCP: Closing client')
      await mcpClientState.client.close()
      debugLog.info('MCP: Client closed successfully')
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      debugLog.error('MCP: Error closing client', { error: message })
    }
  }

  mcpClientState = {
    client: null,
    tools: {},
    connected: false,
    toolNames: [],
  }
}

// ============================================================================
// Accessors
// ============================================================================

/**
 * Get the current MCP tools
 */
export function getMCPTools(): Record<string, Tool> {
  return mcpClientState.tools
}

/**
 * Get the list of available tool names
 */
export function getMCPToolNames(): string[] {
  return mcpClientState.toolNames
}

/**
 * Check if MCP client is connected
 */
export function isMCPConnected(): boolean {
  return mcpClientState.connected
}

/**
 * Get the full client state
 */
export function getMCPClientState(): MCPClientState {
  return mcpClientState
}

/**
 * Get the last error if any
 */
export function getMCPError(): string | undefined {
  return mcpClientState.error
}
