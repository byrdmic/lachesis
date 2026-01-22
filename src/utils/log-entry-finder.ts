/**
 * Utility for finding log entries at cursor position.
 * Used by the "Title Current Entry" context menu feature.
 */

import type { Editor } from 'obsidian'
import { parseLogEntries, type LogEntry } from './log-parser'

/**
 * Information about a log entry at the cursor position.
 */
export type LogEntryAtCursor = {
  /** The parsed log entry */
  entry: LogEntry
  /** The date header this entry falls under, if any */
  dateHeader: string | null
  /** The full content of the entry (including all lines) */
  entryContent: string
}

/**
 * Find the log entry at the given cursor position.
 * Returns null if the cursor is not within any log entry.
 */
export function findLogEntryAtCursor(
  editor: Editor,
  cursorLine: number
): LogEntryAtCursor | null {
  const content = editor.getValue()
  const parsed = parseLogEntries(content)

  // Find entry containing cursor
  const entry = parsed.entries.find(e =>
    e.startLine <= cursorLine && cursorLine < e.endLine
  )

  if (!entry) return null

  // Extract entry content
  const lines = content.split('\n')
  const entryLines = lines.slice(entry.startLine, entry.endLine)

  return {
    entry,
    dateHeader: entry.dateHeader,
    entryContent: entryLines.join('\n')
  }
}
