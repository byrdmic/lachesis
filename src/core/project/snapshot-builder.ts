// Project snapshot builder for Obsidian plugin
// Uses Obsidian's Vault API instead of Node.js fs

import type { Vault, TFile, TFolder } from 'obsidian'
import { parseYaml } from 'obsidian'
import {
  EXPECTED_CORE_FILES,
  type ExpectedCoreFile,
  type ProjectSnapshot,
  type ProjectReadinessAssessment,
  type SnapshotFileEntry,
  type SnapshotHealth,
} from './snapshot'
import { evaluateTemplateStatus } from './template-evaluator'

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

function buildFileEntry(
  projectFolder: string,
  file: ExpectedCoreFile,
  exists: boolean,
  content: string | null,
  mtime?: number,
): SnapshotFileEntry {
  if (!exists || !content) {
    return {
      path: `${projectFolder}/${file}`,
      exists: false,
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
    sizeBytes: content.length,
    modifiedAt: mtime ? new Date(mtime).toISOString() : undefined,
    frontmatter,
    templateStatus: status,
    templateFindings: reasons,
  }
}

/**
 * Build a deterministic project snapshot using Obsidian's Vault API.
 */
export async function buildProjectSnapshot(
  vault: Vault,
  projectPath: string,
): Promise<ProjectSnapshot> {
  // Normalize project folder path
  const projectFolderNorm = projectPath.replace(/\\/g, '/').replace(/\/+$/, '')
  const capturedAt = new Date().toISOString()
  const projectName = projectFolderNorm.split('/').pop() || projectFolderNorm

  // Get the project folder
  const folder = vault.getAbstractFileByPath(projectFolderNorm)
  if (!folder || !(folder instanceof Object && 'children' in folder)) {
    // Folder doesn't exist - return snapshot with all files missing
    const files: Record<ExpectedCoreFile, SnapshotFileEntry> = {} as Record<
      ExpectedCoreFile,
      SnapshotFileEntry
    >
    for (const file of EXPECTED_CORE_FILES) {
      files[file] = buildFileEntry(projectFolderNorm, file, false, null)
    }
    const health = deriveHealth(files)
    const readiness = assessReadiness(files, health)
    return {
      projectName,
      projectPath: projectFolderNorm,
      capturedAt,
      expectedFiles: [...EXPECTED_CORE_FILES],
      files,
      health,
      readiness,
    }
  }

  const files: Record<ExpectedCoreFile, SnapshotFileEntry> = {} as Record<
    ExpectedCoreFile,
    SnapshotFileEntry
  >

  for (const file of EXPECTED_CORE_FILES) {
    const filePath = `${projectFolderNorm}/${file}`
    const abstractFile = vault.getAbstractFileByPath(filePath)

    if (abstractFile && 'extension' in abstractFile) {
      // It's a TFile
      const tfile = abstractFile as TFile
      try {
        const content = await vault.read(tfile)
        const mtime = tfile.stat.mtime
        files[file] = buildFileEntry(projectFolderNorm, file, true, content, mtime)
      } catch {
        files[file] = buildFileEntry(projectFolderNorm, file, false, null)
      }
    } else {
      files[file] = buildFileEntry(projectFolderNorm, file, false, null)
    }
  }

  const health = deriveHealth(files)
  const readiness = assessReadiness(files, health)

  return {
    projectName,
    projectPath: projectFolderNorm,
    capturedAt,
    expectedFiles: [...EXPECTED_CORE_FILES],
    files,
    health,
    readiness,
  }
}

/**
 * Fetch file contents for a set of files in a project.
 * Used to provide actual content to the AI for workflow execution.
 */
export async function fetchProjectFileContents(
  vault: Vault,
  projectPath: string,
  fileNames: string[],
): Promise<Record<string, string | null>> {
  const projectFolderNorm = projectPath.replace(/\\/g, '/').replace(/\/+$/, '')
  const contents: Record<string, string | null> = {}

  for (const fileName of fileNames) {
    const filePath = `${projectFolderNorm}/${fileName}`
    const abstractFile = vault.getAbstractFileByPath(filePath)

    if (abstractFile && 'extension' in abstractFile) {
      try {
        const content = await vault.read(abstractFile as TFile)
        contents[fileName] = content
      } catch {
        contents[fileName] = null
      }
    } else {
      contents[fileName] = null
    }
  }

  return contents
}

/**
 * Format file contents for inclusion in the AI system prompt.
 */
export function formatFileContentsForModel(
  fileContents: Record<string, string | null>,
): string {
  const lines: string[] = []

  for (const [fileName, content] of Object.entries(fileContents)) {
    lines.push(`═══════════════════════════════════════════════════════════════════════════════`)
    lines.push(`FILE: ${fileName}`)
    lines.push(`═══════════════════════════════════════════════════════════════════════════════`)
    if (content === null) {
      lines.push('[File does not exist or could not be read]')
    } else if (content.trim() === '') {
      lines.push('[File is empty]')
    } else {
      lines.push(content)
    }
    lines.push('')
  }

  return lines.join('\n')
}

/**
 * Format a snapshot for display to the AI model.
 */
export function formatProjectSnapshotForModel(snapshot: ProjectSnapshot): string {
  const lines: string[] = []
  lines.push(`PROJECT: ${snapshot.projectName}`)
  lines.push(`PATH: ${snapshot.projectPath}`)
  lines.push(`CAPTURED: ${snapshot.capturedAt}`)

  // Readiness assessment (for workflow gating)
  lines.push('')
  lines.push(`READINESS: ${snapshot.readiness.isReady ? 'READY for workflows' : 'NOT READY - basics needed'}`)
  if (!snapshot.readiness.isReady) {
    lines.push(`GATING: ${snapshot.readiness.gatingSummary}`)
    if (snapshot.readiness.prioritizedFiles.length > 0) {
      lines.push(`PRIORITY ORDER: ${snapshot.readiness.prioritizedFiles.join(' → ')}`)
    }
  }

  lines.push('')
  lines.push('CORE FILES:')
  for (const file of snapshot.expectedFiles) {
    const entry = snapshot.files[file]
    const status = entry.exists ? entry.templateStatus : 'missing'
    const reasons =
      entry.templateFindings.length > 0 ? ` (${entry.templateFindings.join('; ')})` : ''
    lines.push(`- ${file}: ${status}${reasons}`)
  }

  if (snapshot.health.missingFiles.length > 0) {
    lines.push('')
    lines.push(`MISSING: ${snapshot.health.missingFiles.join(', ')}`)
  }
  if (snapshot.health.thinOrTemplateFiles.length > 0) {
    lines.push('NEEDS FILLING:')
    for (const weak of snapshot.health.thinOrTemplateFiles) {
      lines.push(`- ${weak.file}: ${weak.status} (${weak.reasons.join('; ')})`)
    }
  }

  return lines.join('\n')
}
