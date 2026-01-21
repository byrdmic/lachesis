// Path utilities for resolving absolute paths from Obsidian vault paths

import type { Vault, FileSystemAdapter } from 'obsidian'
import * as path from 'path'

/**
 * Get the absolute filesystem path for a vault-relative path.
 * Handles Windows/Unix path normalization.
 *
 * @param vault - Obsidian vault instance
 * @param vaultPath - Path relative to vault root (e.g., "Projects/MyProject")
 * @returns Absolute filesystem path
 */
export function resolveAbsoluteProjectPath(vault: Vault, vaultPath: string): string {
  // Get the vault's base path (filesystem root)
  const adapter = vault.adapter as FileSystemAdapter
  const basePath = adapter.getBasePath()

  // Normalize the vault path (replace backslashes with forward slashes)
  const normalized = vaultPath.replace(/\\/g, '/')

  // Join and return
  return path.join(basePath, normalized)
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
