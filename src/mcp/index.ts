// MCP (Model Context Protocol) module exports

// Client lifecycle and state
export {
  initializeMCPClient,
  closeMCPClient,
  getMCPTools,
  getMCPToolNames,
  isMCPConnected,
  getMCPClientState,
  getMCPError,
  testMCPConnection,
  type MCPClientState,
  type MCPTestResult,
} from './client.ts'

// Scoped tools and utilities
export {
  createScopedTools,
  getReadOnlyToolNames,
  getWriteToolNames,
  isWriteTool,
  type ObsidianToolName,
} from './tools.ts'
