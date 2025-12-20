// Check if Claude Code CLI is available and user is logged in

import { spawn } from 'bun'
import { debugLog } from '../../../debug/logger.ts'

// Cache availability result for performance
let cachedAvailability: boolean | null = null
let cacheTimestamp = 0
const CACHE_TTL_MS = 60000 // 1 minute cache

/**
 * Check if the claude CLI is available in PATH
 */
export async function checkClaudeInPath(): Promise<boolean> {
  try {
    // Use 'which' on Unix, 'where' on Windows
    const isWindows = process.platform === 'win32'
    const command = isWindows ? 'where' : 'which'

    const proc = spawn([command, 'claude'], {
      stdout: 'pipe',
      stderr: 'pipe',
    })

    const exitCode = await proc.exited
    return exitCode === 0
  } catch {
    return false
  }
}

/**
 * Check if Claude Code CLI is available and user is logged in
 */
export async function checkClaudeAvailability(): Promise<boolean> {
  // Check cache
  const now = Date.now()
  if (cachedAvailability !== null && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedAvailability
  }

  try {
    // First check if claude is in PATH
    const inPath = await checkClaudeInPath()
    if (!inPath) {
      debugLog.info('Claude Code CLI not found in PATH')
      cachedAvailability = false
      cacheTimestamp = now
      return false
    }

    // Try a minimal command to check if logged in
    // Using --version as a safe, quick check
    const proc = spawn(['claude', '--version'], {
      stdout: 'pipe',
      stderr: 'pipe',
    })

    const exitCode = await proc.exited

    if (exitCode !== 0) {
      debugLog.info('Claude Code CLI check failed', { exitCode })
      cachedAvailability = false
      cacheTimestamp = now
      return false
    }

    debugLog.info('Claude Code CLI is available')
    cachedAvailability = true
    cacheTimestamp = now
    return true
  } catch (err) {
    debugLog.error('Claude Code availability check failed', {
      error: err instanceof Error ? err.message : String(err),
    })
    cachedAvailability = false
    cacheTimestamp = now
    return false
  }
}

/**
 * Clear the availability cache
 */
export function clearAvailabilityCache(): void {
  cachedAvailability = null
  cacheTimestamp = 0
}
