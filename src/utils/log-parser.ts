/**
 * Log file parser for detecting summarized vs unsummarized entries.
 *
 * Log entries follow the format:
 * - Unsummarized: "HH:MMam/pm" (just timestamp, no title)
 * - Summarized: "HH:MMam/pm - Title Here" (timestamp with title after " - ")
 *
 * Entries are typically grouped under date headers like "## 2024-01-15" or "## January 15, 2024"
 */

// Threshold for considering a log file "large" (in characters)
export const LARGE_LOG_THRESHOLD = 15000

// Regex patterns
const TIMESTAMP_PATTERN = /^(\d{1,2}:\d{2}(?:am|pm)?)/i
const SUMMARIZED_PATTERN = /^(\d{1,2}:\d{2}(?:am|pm)?)\s*-\s*.+/i
const DATE_HEADER_PATTERN = /^##\s+(.+)$/

export interface LogEntry {
  /** The full line containing the timestamp */
  timestampLine: string
  /** Line number (0-indexed) where this entry starts */
  startLine: number
  /** Line number (0-indexed) where this entry ends (exclusive) */
  endLine: number
  /** Whether this entry has been summarized (has a title) */
  isSummarized: boolean
  /** The date header this entry falls under, if any */
  dateHeader: string | null
}

export interface ParsedLog {
  /** All entries found in the log */
  entries: LogEntry[]
  /** The frontmatter section (lines before first content) */
  frontmatterEndLine: number
  /** Total line count */
  totalLines: number
}

export interface TrimmedLogResult {
  /** Whether the log was trimmed */
  wasTrimmed: boolean
  /** The content to send to the AI (either full or trimmed) */
  content: string
  /** Summary of what was trimmed, if anything */
  trimSummary: string | null
  /** Number of entries that were already summarized and excluded */
  excludedEntryCount: number
  /** Number of entries included */
  includedEntryCount: number
}

/**
 * Parse a log file to identify all entries and their summarization status.
 */
export function parseLogEntries(content: string): ParsedLog {
  const lines = content.split('\n')
  const entries: LogEntry[] = []
  let frontmatterEndLine = 0
  let currentDateHeader: string | null = null

  // Find end of frontmatter (after the closing ---)
  let inFrontmatter = false
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (i === 0 && line === '---') {
      inFrontmatter = true
      continue
    }
    if (inFrontmatter && line === '---') {
      frontmatterEndLine = i + 1
      break
    }
  }

  // Parse entries
  let currentEntryStart: number | null = null
  let currentTimestampLine: string | null = null
  let currentIsSummarized = false

  for (let i = frontmatterEndLine; i < lines.length; i++) {
    const line = lines[i]
    const trimmedLine = line.trim()

    // Check for date header
    const dateMatch = trimmedLine.match(DATE_HEADER_PATTERN)
    if (dateMatch) {
      // Close previous entry if open
      if (currentEntryStart !== null && currentTimestampLine !== null) {
        entries.push({
          timestampLine: currentTimestampLine,
          startLine: currentEntryStart,
          endLine: i,
          isSummarized: currentIsSummarized,
          dateHeader: currentDateHeader,
        })
        currentEntryStart = null
        currentTimestampLine = null
      }
      currentDateHeader = dateMatch[1].trim()
      continue
    }

    // Check for timestamp entry
    const timestampMatch = trimmedLine.match(TIMESTAMP_PATTERN)
    if (timestampMatch) {
      // Close previous entry if open
      if (currentEntryStart !== null && currentTimestampLine !== null) {
        entries.push({
          timestampLine: currentTimestampLine,
          startLine: currentEntryStart,
          endLine: i,
          isSummarized: currentIsSummarized,
          dateHeader: currentDateHeader,
        })
      }

      // Start new entry
      currentEntryStart = i
      currentTimestampLine = trimmedLine
      currentIsSummarized = SUMMARIZED_PATTERN.test(trimmedLine)
    }
  }

  // Close final entry
  if (currentEntryStart !== null && currentTimestampLine !== null) {
    entries.push({
      timestampLine: currentTimestampLine,
      startLine: currentEntryStart,
      endLine: lines.length,
      isSummarized: currentIsSummarized,
      dateHeader: currentDateHeader,
    })
  }

  return {
    entries,
    frontmatterEndLine,
    totalLines: lines.length,
  }
}

/**
 * Find the cutoff point where summarized entries end and unsummarized begin.
 * Since entries are appended (newest at bottom), we look for the last summarized
 * entry and return everything after it.
 */
export function findUnsummarizedSection(parsedLog: ParsedLog): {
  startLine: number
  lastSummarizedDate: string | null
} {
  const { entries, frontmatterEndLine } = parsedLog

  if (entries.length === 0) {
    return { startLine: frontmatterEndLine, lastSummarizedDate: null }
  }

  // Find the last summarized entry (searching from the end backwards)
  let lastSummarizedIndex = -1
  for (let i = entries.length - 1; i >= 0; i--) {
    if (entries[i].isSummarized) {
      lastSummarizedIndex = i
      break
    }
  }

  // If no summarized entries, return from after frontmatter
  if (lastSummarizedIndex === -1) {
    return { startLine: frontmatterEndLine, lastSummarizedDate: null }
  }

  // If all entries are summarized, return from end (nothing to process)
  if (lastSummarizedIndex === entries.length - 1) {
    const lastEntry = entries[lastSummarizedIndex]
    return {
      startLine: lastEntry.endLine,
      lastSummarizedDate: lastEntry.dateHeader,
    }
  }

  // Return the line after the last summarized entry
  const lastSummarizedEntry = entries[lastSummarizedIndex]
  return {
    startLine: lastSummarizedEntry.endLine,
    lastSummarizedDate: lastSummarizedEntry.dateHeader,
  }
}

/**
 * Get trimmed log content for the refine-log workflow.
 * If the log is large, only returns the unsummarized portion.
 */
export function getTrimmedLogContent(
  content: string,
  threshold: number = LARGE_LOG_THRESHOLD,
): TrimmedLogResult {
  // If file is small, return everything
  if (content.length <= threshold) {
    const parsed = parseLogEntries(content)
    const unsummarizedCount = parsed.entries.filter(e => !e.isSummarized).length
    return {
      wasTrimmed: false,
      content,
      trimSummary: null,
      excludedEntryCount: 0,
      includedEntryCount: unsummarizedCount,
    }
  }

  const parsed = parseLogEntries(content)
  const lines = content.split('\n')

  // Count summarized and unsummarized entries
  const summarizedEntries = parsed.entries.filter(e => e.isSummarized)
  const unsummarizedEntries = parsed.entries.filter(e => !e.isSummarized)

  // If no unsummarized entries, return a minimal response
  if (unsummarizedEntries.length === 0) {
    return {
      wasTrimmed: true,
      content: '[All entries in this log have already been summarized. No action needed.]',
      trimSummary: `All ${summarizedEntries.length} entries are already summarized.`,
      excludedEntryCount: summarizedEntries.length,
      includedEntryCount: 0,
    }
  }

  // Find where unsummarized entries begin
  const { startLine, lastSummarizedDate } = findUnsummarizedSection(parsed)

  // Build the trimmed content
  const trimmedLines: string[] = []

  // Include frontmatter
  for (let i = 0; i < parsed.frontmatterEndLine; i++) {
    trimmedLines.push(lines[i])
  }

  // Add a context header explaining the trim
  trimmedLines.push('')
  trimmedLines.push('<!-- TRIMMED: Earlier entries already have titles and were excluded -->')
  if (lastSummarizedDate) {
    trimmedLines.push(`<!-- Last summarized section: ${lastSummarizedDate} -->`)
  }
  trimmedLines.push(`<!-- Excluded ${summarizedEntries.length} summarized entries -->`)
  trimmedLines.push('')

  // Find the date header for the first unsummarized entry (if any)
  const firstUnsummarized = unsummarizedEntries[0]
  if (firstUnsummarized.dateHeader) {
    // Include the date header
    trimmedLines.push(`## ${firstUnsummarized.dateHeader}`)
    trimmedLines.push('')
  }

  // Include everything from the unsummarized section onward
  for (let i = startLine; i < lines.length; i++) {
    trimmedLines.push(lines[i])
  }

  return {
    wasTrimmed: true,
    content: trimmedLines.join('\n'),
    trimSummary: `Excluded ${summarizedEntries.length} already-summarized entries. Showing ${unsummarizedEntries.length} entries that need titles.`,
    excludedEntryCount: summarizedEntries.length,
    includedEntryCount: unsummarizedEntries.length,
  }
}

/**
 * Check if a log file should be trimmed for the refine-log workflow.
 */
export function shouldTrimLogForWorkflow(
  content: string,
  threshold: number = LARGE_LOG_THRESHOLD,
): boolean {
  return content.length > threshold
}

export interface FilteredLogResult {
  /** The content to send to the AI (only unsummarized entries) */
  content: string
  /** Number of entries that were already summarized and excluded */
  excludedEntryCount: number
  /** Number of unsummarized entries included */
  includedEntryCount: number
  /** Whether all entries are already summarized (nothing to do) */
  allSummarized: boolean
}

/**
 * Filter log content to only include entries that lack titles.
 * This is specifically for the title-entries workflow to ensure
 * the AI only sees entries that actually need titles.
 *
 * Unlike getTrimmedLogContent (which only trims large files),
 * this function ALWAYS filters out summarized entries regardless of file size.
 */
export function getFilteredLogForTitleEntries(content: string): FilteredLogResult {
  const parsed = parseLogEntries(content)
  const lines = content.split('\n')

  const summarizedEntries = parsed.entries.filter((e) => e.isSummarized)
  const unsummarizedEntries = parsed.entries.filter((e) => !e.isSummarized)

  // If no unsummarized entries, return early
  if (unsummarizedEntries.length === 0) {
    return {
      content: '[All entries in this log already have titles. No action needed.]',
      excludedEntryCount: summarizedEntries.length,
      includedEntryCount: 0,
      allSummarized: true,
    }
  }

  // Build filtered content with only unsummarized entries
  const filteredLines: string[] = []

  // Include frontmatter
  for (let i = 0; i < parsed.frontmatterEndLine; i++) {
    filteredLines.push(lines[i])
  }

  // Add context header
  if (summarizedEntries.length > 0) {
    filteredLines.push('')
    filteredLines.push('<!-- NOTE: Entries that already have titles have been excluded -->')
    filteredLines.push(`<!-- ${summarizedEntries.length} titled entries were removed from this view -->`)
    filteredLines.push('')
  }

  // Group unsummarized entries by their date header
  let currentDateHeader: string | null = null

  for (const entry of unsummarizedEntries) {
    // Add date header if this entry is under a different date
    if (entry.dateHeader && entry.dateHeader !== currentDateHeader) {
      if (currentDateHeader !== null) {
        filteredLines.push('') // Add blank line between date sections
      }
      filteredLines.push(`## ${entry.dateHeader}`)
      filteredLines.push('')
      currentDateHeader = entry.dateHeader
    }

    // Include all lines of this entry
    for (let i = entry.startLine; i < entry.endLine; i++) {
      filteredLines.push(lines[i])
    }
  }

  return {
    content: filteredLines.join('\n'),
    excludedEntryCount: summarizedEntries.length,
    includedEntryCount: unsummarizedEntries.length,
    allSummarized: false,
  }
}
