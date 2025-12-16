// Project scaffolder - creates the project directory and files
import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { readTemplate } from './templates/index.ts'

export type ScaffoldResult =
  | { success: true; projectPath: string }
  | { success: false; error: string }

/**
 * Scaffold a new project in the vault
 */
export async function scaffoldProject(
  vaultPath: string,
  projectSlug: string,
): Promise<ScaffoldResult> {
  try {
    // Validate vault path
    if (!vaultPath || vaultPath.trim() === '') {
      return {
        success: false,
        error:
          'Vault path is not configured. Please update ~/.lachesis/config.json',
      }
    }

    // Create vault path if it doesn't exist
    if (!existsSync(vaultPath)) {
      mkdirSync(vaultPath, { recursive: true })
    }

    // Create project directory
    const projectPath = join(vaultPath, projectSlug)

    if (existsSync(projectPath)) {
      return {
        success: false,
        error: `Project directory already exists: ${projectPath}`,
      }
    }

    mkdirSync(projectPath, { recursive: true })

    // Copy all static templates
    const files = [
      { dest: join(projectPath, 'Overview.md'), template: 'overview' as const },
      { dest: join(projectPath, 'Roadmap.md'), template: 'roadmap' as const },
      { dest: join(projectPath, 'Tasks.md'), template: 'tasks' as const },
      { dest: join(projectPath, 'Log.md'), template: 'log' as const },
      { dest: join(projectPath, 'Ideas.md'), template: 'ideas' as const },
      { dest: join(projectPath, 'Archive.md'), template: 'archive' as const },
    ]

    // Write all files
    for (const file of files) {
      writeFileSync(file.dest, readTemplate(file.template), 'utf-8')
    }

    return { success: true, projectPath }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    return { success: false, error }
  }
}

/**
 * Check if a project with the given slug already exists
 */
export function projectExists(vaultPath: string, slug: string): boolean {
  const projectPath = join(vaultPath, slug)
  return existsSync(projectPath)
}
