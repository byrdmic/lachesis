// Scoped tool wrappers for MCP operations
// Enforces project folder scope and write mode restrictions

import type { Tool } from 'ai'
import type { MCPConfig } from '../config/types.ts'
import { getMCPTools, getMCPToolNames, isMCPConnected } from './client.ts'
import { debugLog } from '../debug/logger.ts'

// ============================================================================
// Types
// ============================================================================

/**
 * Available MCP tools from mcp-obsidian
 */
export type ObsidianToolName =
  | 'list_files_in_vault'
  | 'list_files_in_dir'
  | 'get_file_contents'
  | 'search'
  | 'patch_content'
  | 'append_content'
  | 'delete_file'

/**
 * Tools that perform write operations
 */
const WRITE_TOOLS: Set<ObsidianToolName> = new Set([
  'patch_content',
  'append_content',
  'delete_file',
])

// ============================================================================
// Path Utilities
// ============================================================================

/**
 * Normalize a path for comparison (lowercase, forward slashes)
 */
function normalizePath(path: string): string {
  return path.toLowerCase().replace(/\\/g, '/')
}

/**
 * Check if a target path is within the project folder
 */
function isWithinProject(targetPath: string, projectPath: string): boolean {
  const normalizedTarget = normalizePath(targetPath)
  const normalizedProject = normalizePath(projectPath)

  // Handle relative paths (which are relative to vault root)
  // The project path should be the project folder name within the vault
  // e.g., targetPath could be "MyProject/Log.md" and projectPath could be "MyProject"
  return (
    normalizedTarget.startsWith(normalizedProject + '/') ||
    normalizedTarget === normalizedProject
  )
}

/**
 * Extract the path parameter from tool arguments
 * Different tools use different parameter names for paths
 */
function extractPathFromArgs(
  toolName: string,
  args: Record<string, unknown>,
): string | null {
  // Common path parameter names used by mcp-obsidian
  const pathParams = ['path', 'filepath', 'file', 'filename', 'heading']

  for (const param of pathParams) {
    const value = args[param]
    if (typeof value === 'string' && value.trim() !== '') {
      return value
    }
  }

  return null
}

// ============================================================================
// Scoped Tools
// ============================================================================

/**
 * Create a scoped tool set that restricts writes to the active project folder
 */
export function createScopedTools(
  projectPath: string,
  config: MCPConfig,
): Record<string, Tool> {
  if (!isMCPConnected()) {
    debugLog.warn('MCP: Cannot create scoped tools - not connected')
    return {}
  }

  const baseTools = getMCPTools()

  if (!config.scopeWritesToProject) {
    // Scoping disabled - return tools as-is (but still respect writeMode)
    if (config.writeMode === 'disabled') {
      return filterOutWriteTools(baseTools)
    }
    return baseTools
  }

  // Create scoped versions of write tools
  const scopedTools: Record<string, Tool> = {}

  for (const [toolName, tool] of Object.entries(baseTools)) {
    if (WRITE_TOOLS.has(toolName as ObsidianToolName)) {
      // Wrap write tools with scope validation
      scopedTools[toolName] = createScopedWriteTool(
        toolName as ObsidianToolName,
        tool,
        projectPath,
        config,
      )
    } else {
      // Non-write tools pass through unchanged
      scopedTools[toolName] = tool
    }
  }

  return scopedTools
}

/**
 * Filter out write tools when write mode is disabled
 */
function filterOutWriteTools(
  tools: Record<string, Tool>,
): Record<string, Tool> {
  const filtered: Record<string, Tool> = {}

  for (const [name, tool] of Object.entries(tools)) {
    if (!WRITE_TOOLS.has(name as ObsidianToolName)) {
      filtered[name] = tool
    }
  }

  return filtered
}

/**
 * Create a scoped version of a write tool
 */
function createScopedWriteTool(
  toolName: ObsidianToolName,
  originalTool: Tool,
  projectPath: string,
  config: MCPConfig,
): Tool {
  // Extract project folder name from path (last segment)
  const projectFolderName = projectPath.split('/').pop() || projectPath

  return {
    ...originalTool,
    // Override the execute function to add validation
    execute: async (args: Record<string, unknown>, options: unknown) => {
      // Check write mode
      if (config.writeMode === 'disabled') {
        throw new Error(
          `MCP write blocked: Writes are disabled in configuration`,
        )
      }

      // Extract and validate path
      const targetPath = extractPathFromArgs(toolName, args)

      if (targetPath) {
        if (!isWithinProject(targetPath, projectFolderName)) {
          debugLog.warn('MCP: Write blocked - outside project scope', {
            tool: toolName,
            targetPath,
            projectPath: projectFolderName,
          })
          throw new Error(
            `MCP write blocked: "${targetPath}" is outside project folder "${projectFolderName}"`,
          )
        }
      }

      debugLog.info('MCP: Executing scoped write', {
        tool: toolName,
        targetPath,
        projectFolder: projectFolderName,
      })

      // Execute the original tool
      return (originalTool as { execute: Function }).execute(args, options)
    },
  } as Tool
}

// ============================================================================
// Tool Helpers
// ============================================================================

/**
 * Get the list of read-only tool names
 */
export function getReadOnlyToolNames(): ObsidianToolName[] {
  const allTools = getMCPToolNames()
  return allTools.filter(
    (name) => !WRITE_TOOLS.has(name as ObsidianToolName),
  ) as ObsidianToolName[]
}

/**
 * Get the list of write tool names
 */
export function getWriteToolNames(): ObsidianToolName[] {
  return Array.from(WRITE_TOOLS)
}

/**
 * Check if a tool is a write tool
 */
export function isWriteTool(toolName: string): boolean {
  return WRITE_TOOLS.has(toolName as ObsidianToolName)
}
