// Context builder for loading existing projects
import { existsSync, readdirSync, readFileSync, statSync } from 'fs'
import { join, basename } from 'path'
import { parse as parseYaml } from 'yaml'
import type {
  FileCategory,
  FileHealth,
  ProjectFileInfo,
  ProjectHealthSignals,
  ProjectContextPackage,
} from './context.ts'

/**
 * Expected files for each category
 */
const CATEGORY_FILES: Record<FileCategory, string[]> = {
  overview: ['Overview.md'],
  roadmap: ['Roadmap.md'],
  log: ['Log.md'],
  idea: ['Idea.md'],
  archive: ['Archive.md'],
  advisors: ['Advisors.json'],
  advisor_chat: ['AdvisorChat.md'],
  prompts: ['Prompts/PROMPTS-README.md'],
}

/**
 * Template placeholder markers that indicate weak/unfilled content
 */
const TEMPLATE_MARKERS = [
  '(to be defined)',
  '(to be developed)',
  '(not yet defined)',
  '(none defined yet)',
  '(none identified yet)',
  '(nothing explicitly postponed)',
  '(nothing yet)',
  'YYYY-MM-DD',
]

/**
 * Minimum meaningful content length (chars after frontmatter)
 */
const MIN_MEANINGFUL_CONTENT_LENGTH = 200

/**
 * Number of lines to include in head snippet
 */
const HEAD_SNIPPET_LINES = 20

/**
 * Number of lines to include in tail snippet (for log-like files)
 */
const TAIL_SNIPPET_LINES = 10

/**
 * Determine the category of a file based on its name/path
 */
export function categorizeFile(relativePath: string): FileCategory | 'other' {
  const lower = relativePath.toLowerCase()

  if (lower === 'overview.md') return 'overview'
  if (lower === 'roadmap.md') return 'roadmap'
  if (lower === 'log.md') return 'log'
  if (lower === 'idea.md') return 'idea'
  if (lower === 'archive.md') return 'archive'
  if (lower === 'advisors.json') return 'advisors'
  if (lower === 'advisorchat.md') return 'advisor_chat'
  if (lower.includes('prompts/') || lower.includes('prompts\\')) return 'prompts'

  return 'other'
}

/**
 * Extract YAML frontmatter from markdown content
 */
export function extractFrontmatter(content: string): {
  frontmatter: Record<string, unknown>
  body: string
} {
  const frontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/
  const match = content.match(frontmatterRegex)

  if (!match || !match[1]) {
    return { frontmatter: {}, body: content }
  }

  try {
    const parsed = parseYaml(match[1])
    const frontmatter =
      typeof parsed === 'object' && parsed !== null
        ? (parsed as Record<string, unknown>)
        : {}
    const body = content.slice(match[0].length)
    return { frontmatter, body }
  } catch {
    return { frontmatter: {}, body: content }
  }
}

/**
 * Get head and tail snippets from content
 */
export function getSnippets(
  content: string,
  headLines: number = HEAD_SNIPPET_LINES,
  tailLines: number = TAIL_SNIPPET_LINES,
): { head: string; tail: string } {
  const lines = content.split(/\r?\n/)

  const head = lines.slice(0, headLines).join('\n')
  const tail =
    lines.length > tailLines ? lines.slice(-tailLines).join('\n') : ''

  return { head, tail }
}

/**
 * Analyze the health of a file based on its content
 */
export function analyzeFileHealth(
  category: FileCategory | 'other',
  content: string,
  exists: boolean,
): { health: FileHealth; reason?: string } {
  if (!exists) {
    return { health: 'missing', reason: 'File does not exist' }
  }

  if (category === 'other') {
    return { health: 'present' }
  }

  // For JSON files, just check if they're valid and non-empty
  if (category === 'advisors') {
    try {
      const parsed = JSON.parse(content)
      if (!parsed || (Array.isArray(parsed.advisors) && parsed.advisors.length === 0)) {
        return { health: 'weak', reason: 'No advisors configured' }
      }
      return { health: 'present' }
    } catch {
      return { health: 'weak', reason: 'Invalid JSON' }
    }
  }

  // For markdown files, check content quality
  const { body } = extractFrontmatter(content)
  const trimmedBody = body.trim()

  // Check for template placeholders
  const lowerBody = trimmedBody.toLowerCase()
  const templateMarkerCount = TEMPLATE_MARKERS.filter((marker) =>
    lowerBody.includes(marker.toLowerCase()),
  ).length

  // If more than 3 template markers, likely template-only
  if (templateMarkerCount >= 3) {
    return { health: 'weak', reason: 'Contains mostly template placeholders' }
  }

  // Check for very short content
  if (trimmedBody.length < MIN_MEANINGFUL_CONTENT_LENGTH) {
    return { health: 'weak', reason: 'Very little content' }
  }

  return { health: 'present' }
}

/**
 * Assess overall project health from file info
 */
export function assessProjectHealth(
  files: ProjectFileInfo[],
): ProjectHealthSignals {
  const categories: FileCategory[] = [
    'overview',
    'roadmap',
    'log',
    'idea',
    'archive',
    'advisors',
    'advisor_chat',
    'prompts',
  ]

  const presentCategories = new Set(
    files.filter((f) => f.exists && f.category !== 'other').map((f) => f.category),
  )

  const missingCategories = categories.filter(
    (cat) => !presentCategories.has(cat),
  )

  const weakFiles = files
    .filter((f) => f.health === 'weak' && f.category !== 'other')
    .map((f) => ({
      category: f.category as FileCategory,
      reason: f.healthReason || 'Unknown issue',
    }))

  // Determine overall health
  let overallHealth: 'healthy' | 'needs_attention' | 'incomplete'

  if (missingCategories.length >= 3) {
    overallHealth = 'incomplete'
  } else if (missingCategories.length > 0 || weakFiles.length > 0) {
    overallHealth = 'needs_attention'
  } else {
    overallHealth = 'healthy'
  }

  return {
    missingCategories,
    weakFiles,
    overallHealth,
  }
}

/**
 * Scan a project directory and gather file information
 */
function scanProjectFiles(projectPath: string): ProjectFileInfo[] {
  const files: ProjectFileInfo[] = []

  // Check expected files
  const expectedFiles = [
    'Overview.md',
    'Roadmap.md',
    'Log.md',
    'Idea.md',
    'Archive.md',
    'Advisors.json',
    'AdvisorChat.md',
    'Prompts/PROMPTS-README.md',
  ]

  for (const relativePath of expectedFiles) {
    const fullPath = join(projectPath, relativePath)
    const category = categorizeFile(relativePath)
    const exists = existsSync(fullPath)

    let content = ''
    let sizeBytes = 0
    let modifiedAt = ''
    let frontmatter: Record<string, unknown> | undefined
    let headSnippet: string | undefined
    let tailSnippet: string | undefined

    if (exists) {
      try {
        content = readFileSync(fullPath, 'utf-8')
        const stats = statSync(fullPath)
        sizeBytes = stats.size
        modifiedAt = stats.mtime.toISOString()

        // Extract frontmatter and snippets for markdown files
        if (relativePath.endsWith('.md')) {
          const extracted = extractFrontmatter(content)
          frontmatter = extracted.frontmatter
          const snippets = getSnippets(extracted.body)
          headSnippet = snippets.head

          // Only include tail for log-like files
          if (category === 'log') {
            tailSnippet = snippets.tail
          }
        }
      } catch {
        // File read error - treat as missing
      }
    }

    const { health, reason } = analyzeFileHealth(category, content, exists)

    files.push({
      relativePath,
      category,
      exists,
      sizeBytes,
      modifiedAt,
      frontmatter,
      headSnippet,
      tailSnippet,
      health,
      healthReason: reason,
    })
  }

  // Also scan for any other files in the root directory
  try {
    const entries = readdirSync(projectPath, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isFile() && !expectedFiles.includes(entry.name)) {
        const fullPath = join(projectPath, entry.name)
        try {
          const stats = statSync(fullPath)
          files.push({
            relativePath: entry.name,
            category: 'other',
            exists: true,
            sizeBytes: stats.size,
            modifiedAt: stats.mtime.toISOString(),
            health: 'present',
          })
        } catch {
          // Skip files we can't stat
        }
      }
    }
  } catch {
    // Ignore directory read errors
  }

  return files
}

/**
 * Build a complete context package for a project
 */
export async function buildProjectContext(
  projectPath: string,
): Promise<ProjectContextPackage> {
  const projectName = basename(projectPath)

  // Get project modification time
  let lastModified = ''
  try {
    const stats = statSync(projectPath)
    lastModified = stats.mtime.toISOString()
  } catch {
    lastModified = new Date().toISOString()
  }

  // Scan all files
  const files = scanProjectFiles(projectPath)

  // Assess overall health
  const health = assessProjectHealth(files)

  // Extract metadata from Overview.md frontmatter if available
  const overviewFile = files.find((f) => f.category === 'overview')
  const currentStatus = overviewFile?.frontmatter?.status as string | undefined
  const currentPhase = overviewFile?.frontmatter?.release_phase as
    | string
    | undefined
  const currentMilestone = overviewFile?.frontmatter?.current_milestone as
    | string
    | undefined
  const lastSessionSummary = overviewFile?.frontmatter?.last_session_summary as
    | string
    | undefined

  return {
    projectName,
    projectPath,
    lastModified,
    files,
    health,
    currentStatus,
    currentPhase,
    currentMilestone,
    lastSessionSummary,
  }
}

/**
 * Serialize context package for inclusion in AI prompt
 */
export function serializeContextForPrompt(
  context: ProjectContextPackage,
): string {
  const lines: string[] = []

  lines.push(`PROJECT: ${context.projectName}`)
  lines.push(`PATH: ${context.projectPath}`)
  lines.push(`LAST MODIFIED: ${context.lastModified}`)

  if (context.currentStatus) {
    lines.push(`STATUS: ${context.currentStatus}`)
  }
  if (context.currentPhase) {
    lines.push(`PHASE: ${context.currentPhase}`)
  }
  if (context.currentMilestone) {
    lines.push(`CURRENT MILESTONE: ${context.currentMilestone}`)
  }
  if (context.lastSessionSummary) {
    lines.push(`LAST SESSION: ${context.lastSessionSummary}`)
  }

  lines.push('')
  lines.push('FILE INVENTORY:')

  for (const file of context.files) {
    const healthIcon =
      file.health === 'present' ? '[+]' : file.health === 'weak' ? '[!]' : '[-]'
    const healthNote = file.healthReason ? ` (${file.healthReason})` : ''
    lines.push(`  ${healthIcon} ${file.relativePath}${healthNote}`)

    if (file.headSnippet) {
      const truncated =
        file.headSnippet.length > 500
          ? file.headSnippet.slice(0, 500) + '...'
          : file.headSnippet
      lines.push('    EXCERPT:')
      for (const excerptLine of truncated.split('\n').slice(0, 10)) {
        lines.push(`      ${excerptLine}`)
      }
    }

    if (file.tailSnippet) {
      const truncated =
        file.tailSnippet.length > 300
          ? file.tailSnippet.slice(0, 300) + '...'
          : file.tailSnippet
      lines.push('    RECENT (tail):')
      for (const excerptLine of truncated.split('\n').slice(0, 5)) {
        lines.push(`      ${excerptLine}`)
      }
    }
  }

  lines.push('')
  lines.push('HEALTH SUMMARY:')
  lines.push(`  Overall: ${context.health.overallHealth}`)

  if (context.health.missingCategories.length > 0) {
    lines.push(`  Missing: ${context.health.missingCategories.join(', ')}`)
  }

  if (context.health.weakFiles.length > 0) {
    lines.push('  Needs attention:')
    for (const weak of context.health.weakFiles) {
      lines.push(`    - ${weak.category}: ${weak.reason}`)
    }
  }

  return lines.join('\n')
}
