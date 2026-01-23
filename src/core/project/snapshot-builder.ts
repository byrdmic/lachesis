// Project snapshot builder for Obsidian plugin
// Uses Node.js fs directly to avoid Obsidian's caching issues

import * as fs from 'fs'
import * as path from 'path'
import type { Vault, TFile, TFolder } from 'obsidian'
import { parseYaml } from 'obsidian'
import {
  EXPECTED_CORE_FILES,
  type ExpectedCoreFile,
  type ProjectSnapshot,
  type ProjectReadinessAssessment,
  type SnapshotFileEntry,
  type SnapshotHealth,
  type ProjectAIConfig,
} from './snapshot'
import type { ProjectStatus, MilestoneTransitionState, ParsedMilestone } from './status'
import { evaluateTemplateStatus } from './template-evaluator'
import { parseRoadmap, findCurrentMilestone, findActiveSlice } from '../../utils/roadmap-parser'
import { countCurrentSectionTasks } from '../../utils/tasks-counter'

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

/**
 * Read .ai/config.json if it exists.
 */
function readAIConfig(absoluteProjectPath: string): ProjectAIConfig | undefined {
  const configPath = path.join(absoluteProjectPath, '.ai', 'config.json')
  try {
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, 'utf-8')
      return JSON.parse(content) as ProjectAIConfig
    }
  } catch {
    // Config doesn't exist or is invalid - that's fine
  }
  return undefined
}

/**
 * Extract recently completed items from Archive.md.
 * Looks for completed vertical slices and other archived items.
 * Returns up to 10 most recent items.
 */
function extractRecentlyCompleted(archiveContent: string | null): string[] | undefined {
  if (!archiveContent) return undefined

  const completed: string[] = []

  // Look for completed vertical slice headers: ### YYYY-MM-DD — VS# — Name
  const slicePattern = /^### (\d{4}-\d{2}-\d{2}) — (VS\d+) — (.+)$/gm
  let match
  while ((match = slicePattern.exec(archiveContent)) !== null) {
    const [, date, vsId, name] = match
    completed.push(`${date}: ${vsId} — ${name}`)
  }

  // Also look for recently completed task items: - [x] ...
  const completedTaskPattern = /^- \[x\] (.+)$/gm
  while ((match = completedTaskPattern.exec(archiveContent)) !== null) {
    const task = match[1].trim()
    if (task.length > 0 && task.length < 100) {
      completed.push(`Task: ${task}`)
    }
  }

  // Return last 10 items (most recent assumed to be at top of Archive)
  return completed.length > 0 ? completed.slice(0, 10) : undefined
}

function deriveHealth(
  files: Record<ExpectedCoreFile, SnapshotFileEntry>,
  aiConfig?: ProjectAIConfig,
): SnapshotHealth {
  const missingFiles: ExpectedCoreFile[] = []
  const thinOrTemplateFiles: SnapshotHealth['thinOrTemplateFiles'] = []
  const configIssues: string[] = []

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

  // Check for AI config issues
  if (!aiConfig) {
    configIssues.push('.ai/config.json is missing')
  } else if (!aiConfig.github_repo || aiConfig.github_repo.trim() === '') {
    configIssues.push('GitHub repository not configured in .ai/config.json')
  }

  return { missingFiles, thinOrTemplateFiles, configIssues }
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
 * Build a deterministic project snapshot using Node.js fs directly.
 * Bypasses Obsidian's Vault API to avoid caching issues.
 */
export async function buildProjectSnapshot(
  vault: Vault,
  projectPath: string,
): Promise<ProjectSnapshot> {
  // Normalize project folder path
  const projectFolderNorm = projectPath.replace(/\\/g, '/').replace(/\/+$/, '')
  const capturedAt = new Date().toISOString()
  const projectName = projectFolderNorm.split('/').pop() || projectFolderNorm

  // Get the absolute base path from the vault adapter
  const basePath = (vault.adapter as any).getBasePath() as string
  const absoluteProjectPath = path.join(basePath, projectFolderNorm)

  // Check if project folder exists using filesystem
  if (!fs.existsSync(absoluteProjectPath)) {
    // Folder doesn't exist - return snapshot with all files missing
    const files: Record<ExpectedCoreFile, SnapshotFileEntry> = {} as Record<
      ExpectedCoreFile,
      SnapshotFileEntry
    >
    for (const file of EXPECTED_CORE_FILES) {
      files[file] = buildFileEntry(projectFolderNorm, file, false, null)
    }
    // No config possible if folder doesn't exist
    const health = deriveHealth(files, undefined)
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

  // Track archive content for extracting recently completed items
  let archiveContent: string | null = null

  for (const file of EXPECTED_CORE_FILES) {
    const absoluteFilePath = path.join(absoluteProjectPath, file)

    try {
      if (fs.existsSync(absoluteFilePath)) {
        // Read file directly from filesystem (bypasses Obsidian cache)
        const content = fs.readFileSync(absoluteFilePath, 'utf-8')
        const stats = fs.statSync(absoluteFilePath)
        const mtime = stats.mtimeMs
        files[file] = buildFileEntry(projectFolderNorm, file, true, content, mtime)

        // Keep archive content for later extraction
        if (file === 'Archive.md') {
          archiveContent = content
        }
      } else {
        files[file] = buildFileEntry(projectFolderNorm, file, false, null)
      }
    } catch {
      files[file] = buildFileEntry(projectFolderNorm, file, false, null)
    }
  }

  // Read AI config from .ai/config.json (before deriveHealth so we can check it)
  const aiConfig = readAIConfig(absoluteProjectPath)

  const health = deriveHealth(files, aiConfig)
  const readiness = assessReadiness(files, health)

  // Extract recently completed items from Archive.md
  const recentlyCompleted = extractRecentlyCompleted(archiveContent)

  // Build project status (milestone/task tracking)
  const status = await buildProjectStatus(vault, projectPath)
  console.log('[SnapshotBuilder] Built project status:', status)

  return {
    projectName,
    projectPath: projectFolderNorm,
    capturedAt,
    expectedFiles: [...EXPECTED_CORE_FILES],
    files,
    health,
    readiness,
    aiConfig,
    recentlyCompleted,
    status,
  }
}

/**
 * Fetch file contents for a set of files in a project.
 * Uses Node.js fs directly to avoid Obsidian's caching issues.
 * Used to provide actual content to the AI for workflow execution.
 */
export async function fetchProjectFileContents(
  vault: Vault,
  projectPath: string,
  fileNames: string[],
): Promise<Record<string, string | null>> {
  const projectFolderNorm = projectPath.replace(/\\/g, '/').replace(/\/+$/, '')
  const contents: Record<string, string | null> = {}

  // Get the absolute base path from the vault adapter
  const basePath = (vault.adapter as any).getBasePath() as string
  const absoluteProjectPath = path.join(basePath, projectFolderNorm)

  for (const fileName of fileNames) {
    const absoluteFilePath = path.join(absoluteProjectPath, fileName)

    try {
      if (fs.existsSync(absoluteFilePath)) {
        // Read file directly from filesystem (bypasses Obsidian cache)
        const content = fs.readFileSync(absoluteFilePath, 'utf-8')
        contents[fileName] = content
      } else {
        contents[fileName] = null
      }
    } catch {
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

  // AI Config (GitHub repo, etc.)
  if (snapshot.aiConfig) {
    lines.push('')
    lines.push('AI CONFIG (.ai/config.json):')
    if (snapshot.aiConfig.github_repo) {
      lines.push(`- GitHub repo: ${snapshot.aiConfig.github_repo}`)
    } else {
      lines.push('- GitHub repo: NOT CONFIGURED')
      // Include the raw config content so AI can generate accurate diff
      lines.push('- Current file content:')
      lines.push('```json')
      lines.push(JSON.stringify(snapshot.aiConfig, null, 2))
      lines.push('```')
    }
  } else {
    lines.push('')
    lines.push('AI CONFIG: No .ai/config.json found')
    lines.push('  → To enable commit analysis, create .ai/config.json with: { "github_repo": "github.com/user/repo" }')
  }

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

  if (snapshot.health.configIssues.length > 0) {
    lines.push('')
    lines.push('NEEDS ATTENTION (config):')
    for (const issue of snapshot.health.configIssues) {
      lines.push(`- ${issue}`)
    }
    lines.push('  → Ask the user for their GitHub repo URL to configure .ai/config.json')
  }

  // Recently completed items from Archive.md
  if (snapshot.recentlyCompleted && snapshot.recentlyCompleted.length > 0) {
    lines.push('')
    lines.push('RECENTLY COMPLETED (from Archive.md):')
    for (const item of snapshot.recentlyCompleted) {
      lines.push(`- ${item}`)
    }
  }

  return lines.join('\n')
}

/**
 * Find the next planned milestone after the current one.
 * Returns the first milestone with status='planned' that comes after currentId in the list.
 */
function findNextPlannedMilestone(
  milestones: ParsedMilestone[],
  currentId: string
): ParsedMilestone | null {
  const currentIndex = milestones.findIndex((m) => m.id === currentId)
  if (currentIndex === -1) return null

  // Look for first 'planned' milestone after current
  for (let i = currentIndex + 1; i < milestones.length; i++) {
    if (milestones[i].status === 'planned') {
      return milestones[i]
    }
  }
  return null
}

/**
 * Compute the milestone transition state.
 * Detects when a milestone is complete and whether tasks remain.
 */
function computeTransitionState(
  milestones: ParsedMilestone[],
  currentMilestone: ParsedMilestone | null,
  tasksTotal: number,
  tasksCompleted: number
): MilestoneTransitionState {
  // No current milestone - no transition to detect
  if (!currentMilestone) {
    return { status: 'none' }
  }

  // Current milestone is not done - no transition
  if (currentMilestone.status !== 'done') {
    return { status: 'none' }
  }

  // Current milestone is done - check if all milestones are done
  const allDone = milestones.every(
    (m) => m.status === 'done' || m.status === 'cut'
  )

  if (allDone) {
    return { status: 'all_complete' }
  }

  // Find the next planned milestone
  const nextMilestone = findNextPlannedMilestone(milestones, currentMilestone.id)

  // Calculate incomplete tasks
  const incompleteTasks = tasksTotal - tasksCompleted

  return {
    status: 'milestone_complete',
    milestone: currentMilestone,
    hasIncompleteTasks: incompleteTasks > 0,
    incompleteTasks,
    nextMilestone,
  }
}

/**
 * Build project status from Roadmap.md and Tasks.md.
 * Extracts milestone progress, active slice, and task counts.
 */
export async function buildProjectStatus(
  vault: Vault,
  projectPath: string,
): Promise<ProjectStatus> {
  const projectFolderNorm = projectPath.replace(/\\/g, '/').replace(/\/+$/, '')
  const computedAt = new Date().toISOString()

  // Get the absolute base path from the vault adapter
  const basePath = (vault.adapter as any).getBasePath() as string
  const absoluteProjectPath = path.join(basePath, projectFolderNorm)

  // Read Roadmap.md
  let roadmapContent: string | null = null
  const roadmapPath = path.join(absoluteProjectPath, 'Roadmap.md')
  try {
    if (fs.existsSync(roadmapPath)) {
      roadmapContent = fs.readFileSync(roadmapPath, 'utf-8')
    }
  } catch {
    // File doesn't exist or can't be read
  }

  // Read Tasks.md
  let tasksContent: string | null = null
  const tasksPath = path.join(absoluteProjectPath, 'Tasks.md')
  try {
    if (fs.existsSync(tasksPath)) {
      tasksContent = fs.readFileSync(tasksPath, 'utf-8')
    }
  } catch {
    // File doesn't exist or can't be read
  }

  // Parse roadmap
  let milestones: ReturnType<typeof parseRoadmap>['milestones'] = []
  let slices: ReturnType<typeof parseRoadmap>['slices'] = []
  let currentFocusMilestoneId: string | null = null

  if (roadmapContent) {
    const parsed = parseRoadmap(roadmapContent)
    milestones = parsed.milestones
    slices = parsed.slices
    currentFocusMilestoneId = parsed.currentFocusMilestoneId
  }

  // Find current milestone and active slice
  const currentMilestone = findCurrentMilestone(milestones, currentFocusMilestoneId)
  const activeSlice = findActiveSlice(slices, currentMilestone)

  // Count tasks
  let tasksTotal = 0
  let tasksCompleted = 0

  if (tasksContent) {
    const counts = countCurrentSectionTasks(tasksContent)
    tasksTotal = counts.total
    tasksCompleted = counts.completed
  }

  // Compute milestone transition state
  const transitionState = computeTransitionState(
    milestones,
    currentMilestone,
    tasksTotal,
    tasksCompleted
  )

  return {
    currentMilestone,
    activeSlice,
    tasksCompleted,
    tasksTotal,
    milestoneStatus: currentMilestone?.status ?? null,
    allMilestones: milestones,
    allSlices: slices,
    computedAt,
    transitionState,
  }
}
