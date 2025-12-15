#!/usr/bin/env bun
/**
 * Test script for MCP connection
 * Run with: bun run src/scripts/test-mcp.ts
 */

import { loadConfig } from '../config/config.ts'
import { DEFAULT_MCP_CONFIG } from '../config/types.ts'
import { testMCPConnection, closeMCPClient } from '../mcp/client.ts'

async function main() {
  console.log('🔌 MCP Connection Test\n')

  // Load config
  const result = loadConfig()
  if (result.status === 'error') {
    console.error('❌ Failed to load config:', result.error)
    process.exit(1)
  }

  const config = result.config
  const mcpConfig = config.mcp ?? DEFAULT_MCP_CONFIG

  console.log('📋 Configuration:')
  console.log(`   Enabled: ${mcpConfig.enabled}`)
  console.log(`   Transport: ${mcpConfig.transportMode}`)
  if (mcpConfig.transportMode === 'gateway') {
    const isWSL = process.platform === 'linux' && process.env.WSL_DISTRO_NAME
    console.log(`   Command: ${isWSL ? 'docker.exe' : 'docker'} mcp gateway run`)
  }
  console.log('')

  if (!mcpConfig.enabled) {
    console.log('⚠️  MCP is disabled in config. Enable it in settings or edit ~/.lachesis/config.json')
    process.exit(0)
  }

  console.log('🔄 Testing connection...\n')

  try {
    const testResult = await testMCPConnection(mcpConfig)

    if (testResult.success) {
      console.log('✅ Connection successful!\n')
      console.log(`📦 Found ${testResult.toolCount} tools:`)
      for (const toolName of testResult.toolNames) {
        console.log(`   • ${toolName}`)
      }

      // Test actual Obsidian connection by calling a tool
      console.log('\n🔄 Testing Obsidian API connection...')
      try {
        const { getMCPTools } = await import('../mcp/client.ts')
        const tools = getMCPTools()
        const listVaultTool = tools['obsidian_list_files_in_vault']
        if (listVaultTool && 'execute' in listVaultTool) {
          const result = await listVaultTool.execute({}, { abortSignal: AbortSignal.timeout(10000) })
          console.log('✅ Obsidian API connection works!')
          if (result && 'content' in result && Array.isArray(result.content)) {
            const textContent = result.content.find((c: any) => c.type === 'text')
            if (textContent && 'text' in textContent) {
              const lines = textContent.text.split('\n').slice(0, 5)
              console.log(`   First few vault items:`)
              for (const line of lines) {
                if (line.trim()) console.log(`   • ${line.trim()}`)
              }
            }
          }
        }
      } catch (err) {
        console.log('❌ Obsidian API connection failed!')
        console.log(`   Error: ${err instanceof Error ? err.message : err}`)
      }
    } else {
      console.log('❌ Connection failed!')
      console.log(`   Error: ${testResult.error}`)
    }

    // Clean up
    await closeMCPClient()
  } catch (err) {
    console.error('❌ Error:', err instanceof Error ? err.message : err)
    process.exit(1)
  }
}

main()
