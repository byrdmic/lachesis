/**
 * Diff parsing and application utilities for Lachesis.
 *
 * Handles unified diff format extraction from AI responses,
 * parsing into structured data, and applying changes to files.
 */

// ============================================================================
// Types
// ============================================================================

export type DiffLineType = 'context' | 'add' | 'remove'

export type DiffLine = {
  type: DiffLineType
  content: string
}

export type DiffHunk = {
  oldStart: number
  oldCount: number
  newStart: number
  newCount: number
  lines: DiffLine[]
}

export type ParsedDiff = {
  fileName: string
  hunks: DiffHunk[]
}

export type DiffBlock = {
  id: string
  rawDiff: string
  fileName: string
  parsed: ParsedDiff | null
  status: 'pending' | 'accepted' | 'rejected'
  /** Optional reference to the DOM element for UI updates */
  element?: HTMLElement
}

// ============================================================================
// ID Generation
// ============================================================================

let diffIdCounter = 0

function generateDiffId(): string {
  return `diff-${Date.now()}-${++diffIdCounter}`
}

// ============================================================================
// Diff Extraction
// ============================================================================

/**
 * Extract all diff code blocks from text.
 * Looks for ```diff ... ``` fenced code blocks.
 */
export function extractDiffBlocks(text: string): DiffBlock[] {
  const blocks: DiffBlock[] = []

  // Match ```diff ... ``` blocks (with optional language specifier variations)
  const diffBlockRegex = /```diff\n([\s\S]*?)```/g
  let match: RegExpExecArray | null

  while ((match = diffBlockRegex.exec(text)) !== null) {
    const rawDiff = match[1].trim()
    const parsed = parseDiff(rawDiff)

    blocks.push({
      id: generateDiffId(),
      rawDiff,
      fileName: parsed?.fileName || 'Unknown file',
      parsed,
      status: 'pending',
    })
  }

  return blocks
}

// ============================================================================
// Diff Parsing
// ============================================================================

/**
 * Parse a unified diff string into structured data.
 *
 * Expected format:
 * --- filename
 * +++ filename
 * @@ -oldStart,oldCount +newStart,newCount @@
 * context line
 * -removed line
 * +added line
 */
export function parseDiff(diffText: string): ParsedDiff | null {
  const lines = diffText.split('\n')
  if (lines.length < 3) return null

  let fileName = ''
  const hunks: DiffHunk[] = []
  let currentHunk: DiffHunk | null = null

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Parse file header (--- or +++)
    if (line.startsWith('--- ')) {
      // We'll use the +++ line for the filename (destination)
      continue
    }

    if (line.startsWith('+++ ')) {
      fileName = line.slice(4).trim()
      // Remove leading a/ or b/ if present (git format)
      if (fileName.startsWith('b/')) {
        fileName = fileName.slice(2)
      }
      continue
    }

    // Parse hunk header
    const hunkMatch = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/)
    if (hunkMatch) {
      // Save previous hunk if exists
      if (currentHunk) {
        hunks.push(currentHunk)
      }

      currentHunk = {
        oldStart: parseInt(hunkMatch[1], 10),
        oldCount: hunkMatch[2] ? parseInt(hunkMatch[2], 10) : 1,
        newStart: parseInt(hunkMatch[3], 10),
        newCount: hunkMatch[4] ? parseInt(hunkMatch[4], 10) : 1,
        lines: [],
      }
      continue
    }

    // Parse diff lines (only if we're inside a hunk)
    if (currentHunk) {
      if (line.startsWith('+')) {
        currentHunk.lines.push({
          type: 'add',
          content: line.slice(1),
        })
      } else if (line.startsWith('-')) {
        currentHunk.lines.push({
          type: 'remove',
          content: line.slice(1),
        })
      } else if (line.startsWith(' ') || line === '') {
        // Context line (may or may not have leading space)
        currentHunk.lines.push({
          type: 'context',
          content: line.startsWith(' ') ? line.slice(1) : line,
        })
      }
    }
  }

  // Don't forget the last hunk
  if (currentHunk) {
    hunks.push(currentHunk)
  }

  // Need at least a filename to be valid
  if (!fileName) return null

  return { fileName, hunks }
}

// ============================================================================
// Diff Application
// ============================================================================

/**
 * Apply a parsed diff to original content.
 * Returns the modified content.
 *
 * Uses a fuzzy pattern-matching approach to find where to apply changes,
 * rather than relying strictly on line numbers (which may be inaccurate
 * in AI-generated diffs).
 */
export function applyDiff(original: string, diff: ParsedDiff): string {
  const lines = original.split('\n')

  // Process hunks in reverse order to preserve line numbers
  const sortedHunks = [...diff.hunks].sort((a, b) => b.oldStart - a.oldStart)

  for (const hunk of sortedHunks) {
    // Get the lines we need to find (context + remove lines, excluding empty ones)
    const searchLines = hunk.lines
      .filter((l) => l.type === 'context' || l.type === 'remove')
      .map((l) => l.content)

    // Find where this pattern occurs in the file
    const matchIdx = findPatternInLines(lines, searchLines, hunk.oldStart - 1)

    if (matchIdx === -1) {
      // Try to provide helpful error info
      const firstNonEmptySearch = searchLines.find((l) => l.trim() !== '')
      throw new Error(
        `Could not find the expected content in file.\n` +
          `Looking for: "${firstNonEmptySearch || '(empty lines)'}"\n` +
          `The file may have been modified since the diff was generated.`,
      )
    }

    // Calculate how many lines to remove
    const removeCount = searchLines.length

    // Build the new lines (context + add lines)
    const newLines = hunk.lines
      .filter((l) => l.type === 'add' || l.type === 'context')
      .map((l) => l.content)

    // Apply the change
    lines.splice(matchIdx, removeCount, ...newLines)
  }

  return lines.join('\n')
}

/**
 * Find where a pattern of lines occurs in the file.
 * Returns the starting index, or -1 if not found.
 *
 * Searches near the hint position first, then expands outward.
 */
function findPatternInLines(
  fileLines: string[],
  searchLines: string[],
  hintPosition: number,
): number {
  if (searchLines.length === 0) {
    // No lines to match, use hint position
    return Math.min(hintPosition, fileLines.length)
  }

  // First, try the exact hint position
  if (matchesAtPosition(fileLines, searchLines, hintPosition)) {
    return hintPosition
  }

  // Search outward from hint position (within a reasonable range)
  const maxOffset = 50
  for (let offset = 1; offset <= maxOffset; offset++) {
    // Try before hint
    const beforeIdx = hintPosition - offset
    if (beforeIdx >= 0 && matchesAtPosition(fileLines, searchLines, beforeIdx)) {
      return beforeIdx
    }

    // Try after hint
    const afterIdx = hintPosition + offset
    if (afterIdx <= fileLines.length - searchLines.length && matchesAtPosition(fileLines, searchLines, afterIdx)) {
      return afterIdx
    }
  }

  // If not found nearby, do a full scan
  for (let i = 0; i <= fileLines.length - searchLines.length; i++) {
    if (matchesAtPosition(fileLines, searchLines, i)) {
      return i
    }
  }

  return -1
}

/**
 * Check if the search lines match the file at the given position.
 * Uses fuzzy matching (trims whitespace, skips empty search lines).
 */
function matchesAtPosition(
  fileLines: string[],
  searchLines: string[],
  position: number,
): boolean {
  if (position < 0 || position + searchLines.length > fileLines.length) {
    return false
  }

  for (let i = 0; i < searchLines.length; i++) {
    const searchLine = searchLines[i]
    const fileLine = fileLines[position + i]

    // Skip empty search lines (they match anything)
    if (searchLine.trim() === '') {
      continue
    }

    // Fuzzy match: trim whitespace for comparison
    if (searchLine.trim() !== fileLine.trim()) {
      return false
    }
  }

  return true
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Get the marker text for extracting diff blocks from content.
 * Used to split content around diff blocks.
 */
export function getDiffMarker(rawDiff: string): string {
  return '```diff\n' + rawDiff + '\n```'
}

/**
 * Check if text contains any diff blocks.
 */
export function containsDiffBlocks(text: string): boolean {
  return /```diff\n[\s\S]*?```/.test(text)
}
