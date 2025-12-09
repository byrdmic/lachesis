// Project scaffolder - creates the project directory and files
import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { ProjectDefinition } from '../core/project/types.ts'
import {
  generateOverview,
  generateRoadmap,
  generateLog,
  generateIdea,
  generateArchive,
  generateAdvisorsJson,
  generateAdvisorChat,
  generatePromptsReadme,
} from './templates/index.ts'

export type ScaffoldResult =
  | { success: true; projectPath: string }
  | { success: false; error: string }

/**
 * Scaffold a new project in the vault
 */
export async function scaffoldProject(
  vaultPath: string,
  project: ProjectDefinition,
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
    const projectPath = join(vaultPath, project.slug)

    if (existsSync(projectPath)) {
      return {
        success: false,
        error: `Project directory already exists: ${projectPath}`,
      }
    }

    mkdirSync(projectPath, { recursive: true })

    // Create Prompts subdirectory
    const promptsPath = join(projectPath, 'Prompts')
    mkdirSync(promptsPath, { recursive: true })

    // Generate and write all files
    const files: Array<{ path: string; content: string }> = [
      {
        path: join(projectPath, 'Overview.md'),
        content: generateOverview(project),
      },
      {
        path: join(projectPath, 'Roadmap.md'),
        content: generateRoadmap(project),
      },
      {
        path: join(projectPath, 'Log.md'),
        content: generateLog(project),
      },
      {
        path: join(projectPath, 'Idea.md'),
        content: generateIdea(project),
      },
      {
        path: join(projectPath, 'Archive.md'),
        content: generateArchive(project),
      },
      {
        path: join(projectPath, 'Advisors.json'),
        content: generateAdvisorsJson(project),
      },
      {
        path: join(projectPath, 'AdvisorChat.md'),
        content: generateAdvisorChat(project),
      },
      {
        path: join(promptsPath, 'PROMPTS-README.md'),
        content: generatePromptsReadme(project),
      },
    ]

    // Write all files
    for (const file of files) {
      writeFileSync(file.path, file.content, 'utf-8')
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
