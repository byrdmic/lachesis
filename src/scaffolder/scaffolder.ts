// Project scaffolder for Obsidian plugin
// Uses Obsidian Vault API instead of Node.js fs

import type { Vault } from 'obsidian'
import { TEMPLATES, type TemplateName } from './templates'
import type { ConversationMessage, ExtractedProjectData } from '../ai/client'

// ============================================================================
// Types
// ============================================================================

export type ScaffoldResult =
  | { success: true; projectPath: string }
  | { success: false; error: string }

export type InterviewTranscript = {
  messages: ConversationMessage[]
  planningLevel?: string
  createdAt: string
}

export type ScaffoldProjectData = {
  projectName: string
  projectSlug: string
  oneLiner?: string
  extracted?: ExtractedProjectData
  interviewTranscript?: InterviewTranscript
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Serialize interview transcript to markdown format for storage.
 */
function serializeTranscript(transcript: InterviewTranscript): string {
  const { messages, planningLevel, createdAt } = transcript

  // Build frontmatter
  const frontmatter = [
    '---',
    `created: ${createdAt}`,
    planningLevel ? `planningLevel: "${planningLevel}"` : null,
    `messageCount: ${messages.length}`,
    '---',
  ]
    .filter(Boolean)
    .join('\n')

  // Build message content
  const messageContent = messages
    .map((msg) => {
      const time = msg.timestamp
        ? new Date(msg.timestamp).toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          })
        : '??:??'
      return `## ${time} — ${msg.role}\n${msg.content}`
    })
    .join('\n\n---\n\n')

  return `${frontmatter}\n\n# Interview Transcript\n\n${messageContent}\n`
}

/**
 * Get template content for a file.
 * Templates are now static - no processing needed.
 */
export function getTemplateForFile(template: TemplateName): string {
  return TEMPLATES[template]
}

// ============================================================================
// Scaffolder
// ============================================================================

export async function scaffoldProject(
  vault: Vault,
  projectsFolder: string,
  projectSlug: string,
  projectData?: ScaffoldProjectData,
): Promise<ScaffoldResult> {
  try {
    // Validate projects folder
    if (!projectsFolder || projectsFolder.trim() === '') {
      return {
        success: false,
        error: 'Projects folder is not configured. Please update plugin settings.',
      }
    }

    // Normalize folder path
    const normalizedFolder = projectsFolder.replace(/^\/+|\/+$/g, '')

    // Create projects folder if it doesn't exist
    const projectsFolderExists = vault.getAbstractFileByPath(normalizedFolder)
    if (!projectsFolderExists) {
      await vault.createFolder(normalizedFolder)
    }

    // Create project directory path
    const projectPath = `${normalizedFolder}/${projectSlug}`

    // Check if project already exists
    const existingProject = vault.getAbstractFileByPath(projectPath)
    if (existingProject) {
      return {
        success: false,
        error: `Project directory already exists: ${projectPath}`,
      }
    }

    // Create project folder
    await vault.createFolder(projectPath)

    // Create .ai folder for AI config
    const aiConfigFolder = `${projectPath}/.ai`
    await vault.createFolder(aiConfigFolder)

    // Default project data if not provided
    const data: ScaffoldProjectData = projectData ?? {
      projectName: projectSlug,
      projectSlug,
    }

    // Create .ai/config.json with GitHub repo if provided
    const githubRepo = data.extracted?.config?.githubRepo || ''
    const aiConfig: Record<string, unknown> = {
      $schema: 'https://lachesis.dev/schemas/ai-config.json',
      github_repo: githubRepo,
    }
    // Only add notes if repo is not configured
    if (!githubRepo) {
      aiConfig.notes =
        'Add your GitHub repo URL (e.g., "github.com/user/repo") to enable commit analysis for task tracking.'
    }
    await vault.create(`${aiConfigFolder}/config.json`, JSON.stringify(aiConfig, null, 2))

    // Create interview transcript if provided
    if (data.interviewTranscript && data.interviewTranscript.messages.length > 0) {
      const transcriptContent = serializeTranscript(data.interviewTranscript)
      await vault.create(`${aiConfigFolder}/interview-transcript.md`, transcriptContent)
    }

    // Create all template files - templates are static, just write them as-is
    const files: Array<{ path: string; template: TemplateName }> = [
      { path: `${projectPath}/Overview.md`, template: 'overview' },
      { path: `${projectPath}/Roadmap.md`, template: 'roadmap' },
      { path: `${projectPath}/Tasks.md`, template: 'tasks' },
      { path: `${projectPath}/Log.md`, template: 'log' },
      { path: `${projectPath}/Ideas.md`, template: 'ideas' },
      { path: `${projectPath}/Archive.md`, template: 'archive' },
    ]

    // Write all files
    for (const file of files) {
      const content = TEMPLATES[file.template]
      await vault.create(file.path, content)
    }

    return { success: true, projectPath }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    return { success: false, error }
  }
}

export async function projectExists(
  vault: Vault,
  projectsFolder: string,
  slug: string,
): Promise<boolean> {
  const normalizedFolder = projectsFolder.replace(/^\/+|\/+$/g, '')
  const projectPath = `${normalizedFolder}/${slug}`
  return vault.getAbstractFileByPath(projectPath) !== null
}
