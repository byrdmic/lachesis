// Path utilities for resolving absolute paths from Obsidian vault paths

import type { Vault, FileSystemAdapter } from 'obsidian'
import * as path from 'path'

// Hardcoded fallback for Windows environments where adapter.getBasePath() returns undefined
// This is injected at build time from .env, but we also have a hardcoded fallback
const FALLBACK_PROJECT_PATH = process.env.PROJECT_PATH || 'G:/My Drive/Nexus/Projects'

/**
 * Get the absolute filesystem path for a vault-relative path.
 * Handles Windows/Unix path normalization.
 *
 * @param vault - Obsidian vault instance
 * @param vaultPath - Path relative to vault root (e.g., "Projects/MyProject")
 * @returns Absolute filesystem path
 */
export function resolveAbsoluteProjectPath(vault: Vault, vaultPath: string): string {
  // Normalize the vault path (replace backslashes with forward slashes)
  const normalized = vaultPath.replace(/\\/g, '/')

  // Try to get vault's base path (filesystem root)
  const adapter = vault.adapter as FileSystemAdapter
  let basePath: string | undefined

  try {
    basePath = adapter?.getBasePath?.()
  } catch {
    // getBasePath may not exist on all adapters
    basePath = undefined
  }

  // If basePath is a valid non-empty string, use it
  if (basePath && typeof basePath === 'string' && basePath.length > 0) {
    return path.join(basePath, normalized)
  }

  // Fallback: Use PROJECT_PATH (build-time injected or hardcoded)
  // PROJECT_PATH points to the projects folder, so extract just the project name
  // vaultPath might be "Projects/MyProject" - we want just "MyProject"
  const projectName = path.basename(normalized)
  const result = path.join(FALLBACK_PROJECT_PATH, projectName)

  console.log('[Lachesis] Path resolution fallback used:', {
    vaultPath,
    projectName,
    FALLBACK_PROJECT_PATH,
    result,
  })

  return result
}

/**
 * Check if an absolute path exists and is a directory.
 * Uses Node.js fs module (available in Electron/Obsidian environment).
 *
 * @param absolutePath - Absolute filesystem path to check
 * @returns true if path exists and is a directory
 */
export function isValidProjectPath(absolutePath: string): boolean {
  try {
    // Note: In Obsidian's Electron environment, we have access to Node.js fs
    const fs = require('fs')
    const stats = fs.statSync(absolutePath)
    return stats.isDirectory()
  } catch {
    return false
  }
}

/**
 * Normalize a path for consistent comparison.
 * Converts backslashes to forward slashes and removes trailing slashes.
 *
 * @param inputPath - Path to normalize
 * @returns Normalized path
 */
export function normalizePath(inputPath: string): string {
  return inputPath.replace(/\\/g, '/').replace(/\/+$/, '')
}
