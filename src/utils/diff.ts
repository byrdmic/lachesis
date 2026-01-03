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
 * Uses multiple strategies to handle AI-generated diffs which often have
 * imperfect "old" content:
 * 1. Try exact pattern matching first
 * 2. Fall back to anchor-based matching (find first unique line)
 * 3. Fall back to context-only matching for pure additions
 */
export function applyDiff(original: string, diff: ParsedDiff): string {
  const lines = original.split('\n')

  // Process hunks in reverse order to preserve line numbers
  const sortedHunks = [...diff.hunks].sort((a, b) => b.oldStart - a.oldStart)

  for (const hunk of sortedHunks) {
    const result = applyHunk(lines, hunk)
    if (!result.success) {
      throw new Error(result.error)
    }
  }

  return lines.join('\n')
}

/**
 * Apply a single hunk to the file lines (mutates the array).
 * Returns success status and any error message.
 */
function applyHunk(
  fileLines: string[],
  hunk: DiffHunk,
): { success: boolean; error?: string } {
  // Separate lines by type
  const contextLines = hunk.lines.filter((l) => l.type === 'context').map((l) => l.content)
  const removeLines = hunk.lines.filter((l) => l.type === 'remove').map((l) => l.content)
  const addLines = hunk.lines.filter((l) => l.type === 'add').map((l) => l.content)

  // Build the "old" pattern (context + remove) and "new" content (context + add)
  const oldPattern = hunk.lines
    .filter((l) => l.type === 'context' || l.type === 'remove')
    .map((l) => l.content)
  const newContent = hunk.lines
    .filter((l) => l.type === 'context' || l.type === 'add')
    .map((l) => l.content)

  // Strategy 1: Try exact pattern matching
  let matchIdx = findPatternInLines(fileLines, oldPattern, hunk.oldStart - 1)

  if (matchIdx !== -1) {
    fileLines.splice(matchIdx, oldPattern.length, ...newContent)
    return { success: true }
  }

  // Strategy 2: Anchor-based matching using context lines only
  // This handles cases where AI generated wrong "remove" lines
  if (contextLines.length > 0) {
    const anchorLine = contextLines.find((l) => l.trim() !== '')
    if (anchorLine) {
      matchIdx = findSingleLineInFile(fileLines, anchorLine, hunk.oldStart - 1)
      if (matchIdx !== -1) {
        // Find the position of anchor within the old pattern
        const anchorOffsetInPattern = oldPattern.findIndex(
          (l) => l.trim() === anchorLine.trim()
        )
        const startPos = matchIdx - anchorOffsetInPattern

        if (startPos >= 0) {
          // Count how many old lines actually exist at this position
          const actualOldCount = countMatchingLinesFromPosition(
            fileLines,
            oldPattern,
            startPos
          )
          fileLines.splice(startPos, actualOldCount, ...newContent)
          return { success: true }
        }
      }
    }
  }

  // Strategy 3: For changes with remove lines, try to find just the first remove line
  // and apply the transformation there
  if (removeLines.length > 0) {
    const firstRemoveLine = removeLines.find((l) => l.trim() !== '')
    if (firstRemoveLine) {
      // Try to find something similar (prefix match for timestamp lines)
      matchIdx = findSimilarLineInFile(fileLines, firstRemoveLine, hunk.oldStart - 1)
      if (matchIdx !== -1) {
        // Figure out how many lines to actually remove based on what exists
        const actualRemoveCount = countActualLinesToRemove(fileLines, matchIdx, oldPattern)
        fileLines.splice(matchIdx, actualRemoveCount, ...newContent)
        return { success: true }
      }
    }
  }

  // Strategy 4: Pure addition - just find where to insert based on context
  if (removeLines.length === 0 && addLines.length > 0 && contextLines.length > 0) {
    const lastContextLine = [...contextLines].reverse().find((l) => l.trim() !== '')
    if (lastContextLine) {
      matchIdx = findSingleLineInFile(fileLines, lastContextLine, hunk.oldStart - 1)
      if (matchIdx !== -1) {
        // Insert after the last matching context line
        const insertPos = matchIdx + 1
        fileLines.splice(insertPos, 0, ...addLines)
        return { success: true }
      }
    }
  }

  // Strategy 5: Last resort - use line number hint if it's reasonable
  const hintPos = hunk.oldStart - 1
  if (hintPos >= 0 && hintPos <= fileLines.length) {
    // Just apply the new content at the hinted position
    // Remove count is 0 if we couldn't find what to remove
    const guessRemoveCount = Math.min(removeLines.length, fileLines.length - hintPos)
    fileLines.splice(hintPos, guessRemoveCount, ...newContent)
    return { success: true }
  }

  // All strategies failed
  const firstSearchLine = oldPattern.find((l) => l.trim() !== '')
  return {
    success: false,
    error:
      `Could not find where to apply changes.\n` +
      `Looking for: "${firstSearchLine || '(empty lines)'}"\n` +
      `The file structure may have changed significantly.`,
  }
}

/**
 * Find where a pattern of lines occurs in the file.
 * Returns the starting index, or -1 if not found.
 */
function findPatternInLines(
  fileLines: string[],
  searchLines: string[],
  hintPosition: number,
): number {
  if (searchLines.length === 0) {
    return Math.min(hintPosition, fileLines.length)
  }

  // First, try the exact hint position
  if (matchesAtPosition(fileLines, searchLines, hintPosition)) {
    return hintPosition
  }

  // Search outward from hint position
  const maxOffset = 50
  for (let offset = 1; offset <= maxOffset; offset++) {
    const beforeIdx = hintPosition - offset
    if (beforeIdx >= 0 && matchesAtPosition(fileLines, searchLines, beforeIdx)) {
      return beforeIdx
    }

    const afterIdx = hintPosition + offset
    if (afterIdx <= fileLines.length - searchLines.length && matchesAtPosition(fileLines, searchLines, afterIdx)) {
      return afterIdx
    }
  }

  // Full scan
  for (let i = 0; i <= fileLines.length - searchLines.length; i++) {
    if (matchesAtPosition(fileLines, searchLines, i)) {
      return i
    }
  }

  return -1
}

/**
 * Find a single line in the file (exact match after trimming).
 */
function findSingleLineInFile(
  fileLines: string[],
  searchLine: string,
  hintPosition: number,
): number {
  const searchTrimmed = searchLine.trim()
  if (!searchTrimmed) return -1

  // Try hint position first
  if (hintPosition >= 0 && hintPosition < fileLines.length) {
    if (fileLines[hintPosition].trim() === searchTrimmed) {
      return hintPosition
    }
  }

  // Search outward
  const maxOffset = 100
  for (let offset = 1; offset <= maxOffset; offset++) {
    const beforeIdx = hintPosition - offset
    if (beforeIdx >= 0 && fileLines[beforeIdx].trim() === searchTrimmed) {
      return beforeIdx
    }

    const afterIdx = hintPosition + offset
    if (afterIdx < fileLines.length && fileLines[afterIdx].trim() === searchTrimmed) {
      return afterIdx
    }
  }

  return -1
}

/**
 * Find a line that starts similarly (for timestamp matching).
 * Handles cases where AI included a title but file doesn't have one.
 * E.g., searching for "11:48am - Title" should match "11:48am"
 */
function findSimilarLineInFile(
  fileLines: string[],
  searchLine: string,
  hintPosition: number,
): number {
  const searchTrimmed = searchLine.trim()
  if (!searchTrimmed) return -1

  // Extract the prefix before " - " (handles timestamp lines)
  const dashIndex = searchTrimmed.indexOf(' - ')
  const prefix = dashIndex > 0 ? searchTrimmed.slice(0, dashIndex).trim() : null

  // Search outward from hint
  const maxOffset = 100
  for (let offset = 0; offset <= maxOffset; offset++) {
    for (const idx of [hintPosition - offset, hintPosition + offset]) {
      if (idx < 0 || idx >= fileLines.length) continue
      if (offset === 0 && idx !== hintPosition) continue // avoid duplicate check at offset 0

      const fileLine = fileLines[idx].trim()

      // Exact match
      if (fileLine === searchTrimmed) return idx

      // Prefix match (file has "11:48am", searching for "11:48am - Title")
      if (prefix && fileLine === prefix) return idx

      // File line starts with the search line (file has more than we're looking for)
      if (fileLine.startsWith(searchTrimmed)) return idx

      // Search line starts with file line (we're looking for more than file has)
      if (searchTrimmed.startsWith(fileLine) && fileLine.length > 3) return idx
    }
  }

  return -1
}

/**
 * Count how many lines from the pattern actually match at the given position.
 */
function countMatchingLinesFromPosition(
  fileLines: string[],
  pattern: string[],
  startPos: number,
): number {
  let count = 0
  for (let i = 0; i < pattern.length && startPos + i < fileLines.length; i++) {
    const patternLine = pattern[i].trim()
    const fileLine = fileLines[startPos + i].trim()

    // Empty pattern lines or matching lines count
    if (patternLine === '' || patternLine === fileLine) {
      count++
    } else {
      // Check for partial match (timestamp without title vs with title)
      const patternDash = patternLine.indexOf(' - ')
      const fileDash = fileLine.indexOf(' - ')

      if (patternDash > 0 && fileDash === -1) {
        // Pattern has " - " but file doesn't - check prefix
        if (fileLine === patternLine.slice(0, patternDash)) {
          count++
          continue
        }
      }
      break
    }
  }
  return Math.max(count, 1) // At least remove 1 line
}

/**
 * Determine how many actual lines to remove based on what exists.
 */
function countActualLinesToRemove(
  fileLines: string[],
  startPos: number,
  oldPattern: string[],
): number {
  // Count non-empty lines in the old pattern that are marked for removal
  let expectedRemoveCount = 0
  for (const line of oldPattern) {
    if (line.trim() !== '') expectedRemoveCount++
  }

  // But we can only remove what actually exists and somewhat matches
  let actualCount = 0
  for (let i = 0; i < oldPattern.length && startPos + i < fileLines.length; i++) {
    const patternLine = oldPattern[i].trim()
    const fileLine = fileLines[startPos + i].trim()

    // Check if this looks like it could be part of the same block
    if (patternLine === '' && fileLine === '') {
      actualCount++
    } else if (patternLine === fileLine) {
      actualCount++
    } else if (linesAreSimilar(patternLine, fileLine)) {
      actualCount++
    } else if (i > 0) {
      // Stop if we hit something that doesn't match at all
      break
    } else {
      // First line - count it even if not exact match
      actualCount++
    }
  }

  return actualCount
}

/**
 * Check if two lines are similar enough to be considered the same.
 */
function linesAreSimilar(a: string, b: string): boolean {
  if (a === b) return true

  // Check timestamp prefix match
  const aMatch = a.match(/^(\d{1,2}:\d{2}(?:am|pm)?)/i)
  const bMatch = b.match(/^(\d{1,2}:\d{2}(?:am|pm)?)/i)

  if (aMatch && bMatch && aMatch[1].toLowerCase() === bMatch[1].toLowerCase()) {
    return true
  }

  // Check if one is a prefix of the other (after trimming)
  if (a.startsWith(b) || b.startsWith(a)) {
    return true
  }

  return false
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

    if (searchLine.trim() === '') {
      continue
    }

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
