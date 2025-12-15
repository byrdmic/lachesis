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
// Transport Factory
// ============================================================================

/**
 * Create the appropriate transport based on config.transportMode
 */
function createTransport(config: MCPConfig, apiKey: string) {
  const baseEnv = {
    OBSIDIAN_API_KEY: apiKey,
    OBSIDIAN_HOST: config.obsidian.host,
    OBSIDIAN_PORT: String(config.obsidian.port),
  }

  // Filter out undefined values from process.env for type safety
  const safeEnv = Object.fromEntries(
    Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)
  )

  switch (config.transportMode) {
    case 'gateway': {
      // Connect to Docker MCP Gateway via stdio transport
      // This spawns `docker mcp gateway run` which handles routing to MCP servers
      // On WSL, we need to use docker.exe to access Docker Desktop's MCP extension
      const isWSL = process.platform === 'linux' && process.env.WSL_DISTRO_NAME
      const dockerCmd = isWSL ? 'docker.exe' : 'docker'
      // Wrap in shell to suppress stderr (OAuth notifications clutter the terminal)
      return new Experimental_StdioMCPTransport({
        command: isWSL ? 'bash' : process.platform === 'win32' ? 'cmd' : 'bash',
        args: isWSL || process.platform !== 'win32'
          ? ['-c', `${dockerCmd} mcp gateway run 2>/dev/null`]
          : ['/c', `${dockerCmd} mcp gateway run 2>NUL`],
        env: safeEnv,
      })
    }

    case 'docker':
      // docker run spawns a fresh container with stdio connected
      return new Experimental_StdioMCPTransport({
        command: 'docker',
        args: [
          'run',
          '-i',
          '--rm',
          '-e',
          `OBSIDIAN_API_KEY=${apiKey}`,
          '-e',
          `OBSIDIAN_HOST=${config.obsidian.host}`,
          '-e',
          `OBSIDIAN_PORT=${config.obsidian.port}`,
          config.docker?.imageName ?? 'mcp/obsidian',
        ],
        env: safeEnv,
      })

    case 'uvx':
    default:
      return new Experimental_StdioMCPTransport({
        command: 'uvx',
        args: ['mcp-obsidian'],
        env: { ...safeEnv, ...baseEnv },
      })
  }
}

// ============================================================================
// Client Lifecycle
// ============================================================================

/**
 * Initialize the MCP client by spawning the mcp-obsidian server process
 * or connecting to an MCP Gateway via SSE
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
    // For gateway mode, API key is optional (gateway handles auth)
    // For stdio modes (uvx, docker), API key is required
    const apiKey = process.env[config.obsidian.apiKeyEnvVar] ?? ''
    if (config.transportMode !== 'gateway' && !apiKey) {
      throw new Error(
        `MCP: ${config.obsidian.apiKeyEnvVar} environment variable not set`,
      )
    }

    debugLog.info('MCP: Initializing client', {
      transportMode: config.transportMode,
      ...(config.transportMode === 'gateway' && {
        gatewayUrl: config.gateway?.url,
      }),
      ...(config.transportMode !== 'gateway' && {
        host: config.obsidian.host,
        port: config.obsidian.port,
        apiKeyEnvVar: config.obsidian.apiKeyEnvVar,
      }),
      ...(config.transportMode === 'docker' && {
        dockerImage: config.docker?.imageName,
      }),
    })

    // Create transport based on configured mode
    const transport = createTransport(config, apiKey)

    // Create MCP client with appropriate transport
    const client = await createMCPClient({
      name: 'lachesis-obsidian',
      transport,
      onUncaughtError: (error) => {
        debugLog.error('MCP: Uncaught error', { error })
      },
    })

    // Get available tools from the server
    const allTools = await client.tools()

    // Filter out Docker MCP Gateway internal tools that have malformed schemas
    // These tools (mcp-*, code-mode) are for dynamic server management and not needed
    const gatewayInternalTools = new Set([
      'mcp-find',
      'mcp-add',
      'mcp-remove',
      'mcp-config-set',
      'mcp-exec',
      'code-mode',
    ])

    const tools: Record<string, Tool> = {}
    for (const [name, tool] of Object.entries(allTools)) {
      if (!gatewayInternalTools.has(name)) {
        tools[name] = tool
      }
    }

    const toolNames = Object.keys(tools)
    debugLog.info('MCP: Client initialized successfully', {
      toolCount: toolNames.length,
      toolNames,
      filtered: Object.keys(allTools).length - toolNames.length,
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

// ============================================================================
// Diagnostics / Testing
// ============================================================================

export type MCPTestResult = {
  success: boolean
  enabled: boolean
  apiKeySet: boolean
  connected: boolean
  toolCount: number
  toolNames: string[]
  error?: string
  transportMode: string
  // For stdio modes (uvx, docker)
  host?: string
  port?: number
  // For gateway mode
  gatewayUrl?: string
}

/**
 * Test MCP connection and return diagnostic information.
 * This is useful for verifying the MCP setup before starting AI conversations.
 * If already connected, returns info from current state. Otherwise attempts a fresh connection.
 */
export async function testMCPConnection(
  config: MCPConfig,
): Promise<MCPTestResult> {
  const isGateway = config.transportMode === 'gateway'

  const baseResult: MCPTestResult = {
    success: false,
    enabled: config.enabled,
    apiKeySet: false,
    connected: false,
    toolCount: 0,
    toolNames: [],
    transportMode: config.transportMode,
    ...(isGateway
      ? { gatewayUrl: config.gateway?.url }
      : { host: config.obsidian.host, port: config.obsidian.port }),
  }

  if (!config.enabled) {
    return {
      ...baseResult,
      error: 'MCP is disabled in configuration',
    }
  }

  // For gateway mode, API key check is optional (gateway handles auth)
  // For stdio modes, API key is required
  const apiKey = process.env[config.obsidian.apiKeyEnvVar]
  if (!isGateway && !apiKey) {
    return {
      ...baseResult,
      error: `Environment variable ${config.obsidian.apiKeyEnvVar} is not set`,
    }
  }
  baseResult.apiKeySet = isGateway || Boolean(apiKey)

  // If already connected, return current state
  if (mcpClientState.connected && mcpClientState.client) {
    return {
      ...baseResult,
      success: true,
      connected: true,
      toolCount: mcpClientState.toolNames.length,
      toolNames: mcpClientState.toolNames,
    }
  }

  // Attempt fresh connection
  try {
    debugLog.info('MCP Test: Attempting connection...', {
      transportMode: config.transportMode,
      ...(isGateway
        ? { gatewayUrl: config.gateway?.url }
        : { host: config.obsidian.host, port: config.obsidian.port }),
    })

    const state = await initializeMCPClient(config)

    if (state.connected) {
      return {
        ...baseResult,
        success: true,
        connected: true,
        toolCount: state.toolNames.length,
        toolNames: state.toolNames,
      }
    } else {
      return {
        ...baseResult,
        error: state.error || 'Failed to connect (unknown error)',
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    debugLog.error('MCP Test: Connection failed', { error: message })
    return {
      ...baseResult,
      error: message,
    }
  }
}
