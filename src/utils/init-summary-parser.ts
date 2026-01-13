/**
 * Init from Summary Parser
 *
 * Types and utilities for the "Initialize from Summary" workflow.
 * Handles parsing AI responses containing multiple file diffs.
 */

import { extractDiffBlocks, type DiffBlock } from './diff'

// ============================================================================
// Types
// ============================================================================

export type InitSummaryFile = 'Overview.md' | 'Roadmap.md' | 'Tasks.md'

export type BatchDiffResult = {
  diffs: Map<InitSummaryFile, DiffBlock>
  hasAllFiles: boolean
  missingFiles: InitSummaryFile[]
  hasQuestions: boolean
  questionContent: string | null
}

export type BatchDiffSummary = {
  fileCount: number
  totalAdditions: number
  totalDeletions: number
  files: Array<{
    name: InitSummaryFile
    additions: number
    deletions: number
  }>
}

// ============================================================================
// Detection
// ============================================================================

/**
 * Check if content contains a batch diff response (diffs for multiple files).
 */
export function containsBatchDiffResponse(content: string): boolean {
  // Check for diffs targeting the expected files
  const hasOverview = content.includes('Overview.md')
  const hasRoadmap = content.includes('Roadmap.md')
  const hasTasks = content.includes('Tasks.md')
  const hasDiffs = content.includes('```diff')

  // At least 2 files with diffs = batch response
  const fileCount = [hasOverview, hasRoadmap, hasTasks].filter(Boolean).length
  return fileCount >= 2 && hasDiffs
}

/**
 * Check if content contains clarifying questions (without diffs).
 */
export function containsClarifyingQuestions(content: string): boolean {
  // Detect question patterns
  const questionPatterns = [
    /\?\s*$/m, // Lines ending with ?
    /could you clarify/i,
    /what is the/i,
    /who are the/i,
    /can you tell me/i,
    /I need to understand/i,
    /before I can generate/i,
    /please provide/i,
    /could you describe/i,
  ]

  // If there are questions but no diffs, it's a clarifying question response
  const hasDiffs = content.includes('```diff')
  const hasQuestions = questionPatterns.some((p) => p.test(content))

  return hasQuestions && !hasDiffs
}

// ============================================================================
// Parsing
// ============================================================================

/**
 * Parse an AI response containing batch diffs for multiple files.
 */
export function parseBatchDiffResponse(content: string): BatchDiffResult {
  const allDiffs = extractDiffBlocks(content)
  const diffs = new Map<InitSummaryFile, DiffBlock>()

  const expectedFiles: InitSummaryFile[] = ['Overview.md', 'Roadmap.md', 'Tasks.md']

  for (const diff of allDiffs) {
    const fileName = diff.fileName as InitSummaryFile
    if (expectedFiles.includes(fileName)) {
      diffs.set(fileName, diff)
    }
  }

  const missingFiles = expectedFiles.filter((f) => !diffs.has(f))

  // Check for question content (text before/after diffs or as standalone)
  let questionContent: string | null = null
  if (containsClarifyingQuestions(content)) {
    // Extract non-diff text as potential questions
    const nonDiffContent = content.replace(/```diff[\s\S]*?```/g, '').trim()
    if (nonDiffContent.length > 50) {
      questionContent = nonDiffContent
    }
  }

  return {
    diffs,
    hasAllFiles: missingFiles.length === 0,
    missingFiles,
    hasQuestions: questionContent !== null || containsClarifyingQuestions(content),
    questionContent,
  }
}

// ============================================================================
// Summary Extraction
// ============================================================================

/**
 * Extract summary statistics from a batch diff response.
 */
export function extractBatchDiffSummary(content: string): BatchDiffSummary | null {
  const result = parseBatchDiffResponse(content)

  if (result.diffs.size === 0) return null

  const files: BatchDiffSummary['files'] = []
  let totalAdditions = 0
  let totalDeletions = 0

  // Process in consistent order
  const fileOrder: InitSummaryFile[] = ['Overview.md', 'Roadmap.md', 'Tasks.md']

  for (const name of fileOrder) {
    const diff = result.diffs.get(name)
    if (!diff) continue

    let additions = 0
    let deletions = 0

    if (diff.parsed) {
      for (const hunk of diff.parsed.hunks) {
        for (const line of hunk.lines) {
          if (line.type === 'add') additions++
          if (line.type === 'remove') deletions++
        }
      }
    }

    files.push({ name, additions, deletions })
    totalAdditions += additions
    totalDeletions += deletions
  }

  return {
    fileCount: result.diffs.size,
    totalAdditions,
    totalDeletions,
    files,
  }
}
