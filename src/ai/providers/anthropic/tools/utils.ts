// Shared utilities for tool executors

import * as path from 'path'
import * as fs from 'fs'

/**
 * Validate a path to prevent directory traversal attacks.
 * Returns the absolute path if valid, null if the path escapes the project.
 */
export function validatePath(projectPath: string, relativePath: string): string | null {
  // Normalize the relative path (handle both / and \ separators)
  const normalizedRelative = relativePath.replace(/\\/g, '/')

  // Resolve to absolute path
  const absolute = path.resolve(projectPath, normalizedRelative)

  // Normalize the project path for comparison
  const normalizedProject = path.resolve(projectPath)

  // Ensure the resolved path is within the project directory
  if (!absolute.startsWith(normalizedProject + path.sep) && absolute !== normalizedProject) {
    return null // Path escape attempt
  }

  return absolute
}

/**
 * Recursively walk a directory and return all file paths.
 * Skips hidden directories (starting with .) except .ai folder.
 */
export function walkDirectory(dirPath: string): string[] {
  const results: string[] = []

  if (!fs.existsSync(dirPath)) {
    return results
  }

  const entries = fs.readdirSync(dirPath, { withFileTypes: true })

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name)

    if (entry.isDirectory()) {
      // Skip hidden directories except .ai
      if (entry.name.startsWith('.') && entry.name !== '.ai') {
        continue
      }
      results.push(...walkDirectory(fullPath))
    } else if (entry.isFile()) {
      results.push(fullPath)
    }
  }

  return results
}

/**
 * Match a file path against a glob pattern.
 * Supports:
 * - * : matches any characters except /
 * - ** : matches any characters including /
 * - ? : matches a single character except /
 */
export function matchGlob(filePath: string, pattern: string): boolean {
  // Normalize separators
  const normalizedPath = filePath.replace(/\\/g, '/')
  const normalizedPattern = pattern.replace(/\\/g, '/')

  // Convert glob pattern to regex
  let regexPattern = normalizedPattern
    // Escape regex special characters (except *, ?, and already escaped)
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    // Handle ** (globstar) - must do before * handling
    .replace(/\\\*\\\*/g, '{{GLOBSTAR}}')
    // Handle * (any except /)
    .replace(/\\\*/g, '[^/]*')
    // Handle ? (single char except /)
    .replace(/\\\?/g, '[^/]')
    // Restore globstar as .* (any characters including /)
    .replace(/{{GLOBSTAR}}/g, '.*')

  // Anchor the pattern
  const regex = new RegExp(`^${regexPattern}$`)
  return regex.test(normalizedPath)
}
