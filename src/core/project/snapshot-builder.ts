import { readdir, readFile, stat } from 'fs/promises'
import { join } from 'path'
import { parse as parseYaml } from 'yaml'
import {
  EXPECTED_CORE_FILES,
  type ExpectedCoreFile,
  type ProjectSnapshot,
  type ProjectReadinessAssessment,
  type SnapshotFileEntry,
  type SnapshotHealth,
} from './snapshot.ts'
import { evaluateTemplateStatus } from './template-evaluator.ts'
import { debugLog } from '../../debug/logger.ts'

function extractFrontmatter(content: string): Record<string, unknown> {
  const frontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/
  const match = content.match(frontmatterRegex)
  if (!match || !match[1]) return {}
  try {
    const parsed = parseYaml(match[1])
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

function deriveHealth(
  files: Record<ExpectedCoreFile, SnapshotFileEntry>,
): SnapshotHealth {
  const missingFiles: ExpectedCoreFile[] = []
  const thinOrTemplateFiles: SnapshotHealth['thinOrTemplateFiles'] = []

  for (const file of EXPECTED_CORE_FILES) {
    const entry = files[file]
    if (!entry || !entry.exists) {
      missingFiles.push(file)
      continue
    }
    if (entry.templateStatus === 'template_only' || entry.templateStatus === 'thin') {
      thinOrTemplateFiles.push({
        file,
        status: entry.templateStatus,
        reasons: entry.templateFindings,
      })
    }
  }

  return { missingFiles, thinOrTemplateFiles }
}

/**
 * Core file priority order for inspection/remediation.
 * Higher priority files should be addressed first when loading a project.
 */
const CORE_FILE_PRIORITY: ExpectedCoreFile[] = [
  'Overview.md', // Project basis - what is this?
  'Ideas.md', // Project potential - what could it be?
  'Tasks.md', // Action planning - what do we do next?
  'Roadmap.md', // Milestones - where are we going?
  'Log.md', // Reference/history - what happened?
  'Archive.md', // Optional storage - what's done/cut?
]

/**
 * Assess project readiness for workflows.
 * Determines if the project has enough basis for advanced workflows.
 */
function assessReadiness(
  files: Record<ExpectedCoreFile, SnapshotFileEntry>,
  _health: SnapshotHealth,
): ProjectReadinessAssessment {
  const missingBasics: string[] = []
  const prioritizedFiles: ExpectedCoreFile[] = []

  // Check Overview.md (required for project basis)
  const overview = files['Overview.md']
  if (!overview?.exists) {
    missingBasics.push('Overview.md is missing')
    prioritizedFiles.push('Overview.md')
  } else if (overview.templateStatus === 'template_only') {
    missingBasics.push('Overview.md has not been filled in')
    prioritizedFiles.push('Overview.md')
  } else if (overview.templateStatus === 'thin') {
    missingBasics.push('Overview.md needs more content')
    prioritizedFiles.push('Overview.md')
  }

  // Check Tasks.md (required for action planning)
  const tasks = files['Tasks.md']
  if (!tasks?.exists) {
    missingBasics.push('Tasks.md is missing')
    prioritizedFiles.push('Tasks.md')
  } else if (tasks.templateStatus === 'template_only') {
    missingBasics.push('Tasks.md has no actionable items')
    prioritizedFiles.push('Tasks.md')
  }

  // Check Roadmap.md (required for direction)
  const roadmap = files['Roadmap.md']
  if (!roadmap?.exists) {
    missingBasics.push('Roadmap.md is missing')
    prioritizedFiles.push('Roadmap.md')
  } else if (roadmap.templateStatus === 'template_only') {
    missingBasics.push('Roadmap.md has no milestones defined')
    prioritizedFiles.push('Roadmap.md')
  }

  // Add other files that need attention (in priority order)
  for (const file of CORE_FILE_PRIORITY) {
    if (prioritizedFiles.includes(file)) continue
    const entry = files[file]
    if (!entry?.exists || entry.templateStatus !== 'filled') {
      prioritizedFiles.push(file)
    }
  }

  const isReady = missingBasics.length === 0

  // Build gating summary
  let gatingSummary: string
  if (isReady) {
    gatingSummary = 'Project has sufficient basis for workflows.'
  } else if (missingBasics.length === 1) {
    gatingSummary = `Before workflows: ${missingBasics[0]}`
  } else {
    gatingSummary = `Before workflows, address: ${missingBasics.slice(0, 2).join('; ')}${missingBasics.length > 2 ? '...' : ''}`
  }

  return {
    isReady,
    missingBasics,
    prioritizedFiles,
    gatingSummary,
  }
}

function parseGithubRepos(frontmatter: Record<string, unknown>): string[] {
  const raw = frontmatter['github']
  if (raw === undefined || raw === null) return []
  if (typeof raw !== 'string') return []
  const trimmed = raw.trim()
  if (!trimmed || trimmed.toLowerCase() === 'n/a') return []
  return trimmed
    .split(',')
    .map((r) => r.trim())
    .filter((r) => r.length > 0)
}

function buildFileEntry(
  projectFolder: string,
  file: ExpectedCoreFile,
  exists: boolean,
  content: string | null,
  sizeBytes?: number,
  modifiedAt?: string,
): SnapshotFileEntry {
  if (!exists || !content) {
    return {
      path: `${projectFolder}/${file}`,
      exists: false,
      sizeBytes,
      modifiedAt,
      frontmatter: {},
      templateStatus: 'missing',
      templateFindings: ['File missing'],
    }
  }

  const frontmatter = extractFrontmatter(content)
  const { status, reasons } = evaluateTemplateStatus(file, content)

  return {
    path: `${projectFolder}/${file}`,
    exists: true,
    sizeBytes,
    modifiedAt,
    frontmatter,
    templateStatus: status,
    templateFindings: reasons,
  }
}

/**
 * List files in a project directory using native fs
 */
async function listProjectFiles(projectFolder: string): Promise<string[]> {
  try {
    const entries = await readdir(projectFolder, { withFileTypes: true })
    return entries.filter((e) => e.isFile()).map((e) => e.name)
  } catch (err) {
    debugLog.warn('Failed to list project files', {
      projectFolder,
      error: err instanceof Error ? err.message : String(err),
    })
    return []
  }
}

/**
 * Read file contents using native fs
 */
async function readFileContents(
  projectFolder: string,
  file: ExpectedCoreFile,
): Promise<{ content: string | null; size?: number; mtime?: string }> {
  const filePath = join(projectFolder, file)

  try {
    const [content, stats] = await Promise.all([
      readFile(filePath, 'utf-8'),
      stat(filePath),
    ])

    return {
      content,
      size: stats.size,
      mtime: stats.mtime.toISOString(),
    }
  } catch {
    return { content: null }
  }
}

/**
 * Build a deterministic project snapshot using native filesystem operations.
 * This replaces the MCP-based implementation.
 */
export async function buildProjectSnapshot(
  projectFolder: string,
): Promise<ProjectSnapshot> {
  // Normalize project folder (strip trailing slash)
  const projectFolderNorm = projectFolder.replace(/\\/g, '/').replace(/\/+$/, '')

  const capturedAt = new Date().toISOString()
  const projectName = projectFolderNorm.split('/').pop() || projectFolderNorm

  debugLog.info('Building project snapshot', {
    projectFolder: projectFolderNorm,
    projectName,
  })

  const fileList = await listProjectFiles(projectFolderNorm)
  const fileSet = new Set(fileList)

  debugLog.info('Project files found', {
    count: fileList.length,
    files: fileList,
  })

  const files: Record<ExpectedCoreFile, SnapshotFileEntry> = {} as Record<
    ExpectedCoreFile,
    SnapshotFileEntry
  >

  for (const file of EXPECTED_CORE_FILES) {
    const exists = fileSet.has(file)
    const { content, size, mtime } = exists
      ? await readFileContents(projectFolderNorm, file)
      : { content: null, size: undefined, mtime: undefined }

    debugLog.info('Processing core file', {
      file,
      exists,
      contentLength: content?.length,
    })

    files[file] = buildFileEntry(projectFolderNorm, file, exists, content, size, mtime)
  }

  const overviewFrontmatter = files['Overview.md']?.frontmatter ?? {}
  const githubRepos = parseGithubRepos(overviewFrontmatter)

  const health = deriveHealth(files)
  const readiness = assessReadiness(files, health)

  debugLog.info('Snapshot health summary', {
    missing: health.missingFiles,
    thinOrTemplate: health.thinOrTemplateFiles,
    githubRepos,
  })

  debugLog.info('Readiness assessment', {
    isReady: readiness.isReady,
    missingBasics: readiness.missingBasics,
    prioritizedFiles: readiness.prioritizedFiles,
    gatingSummary: readiness.gatingSummary,
  })

  return {
    projectName,
    projectPath: projectFolder,
    capturedAt,
    expectedFiles: [...EXPECTED_CORE_FILES],
    files,
    githubRepos,
    health,
    readiness,
  }
}

// Export alias for backward compatibility
export const buildProjectSnapshotViaMCP = buildProjectSnapshot
