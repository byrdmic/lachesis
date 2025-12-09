import React, { useState, useEffect } from 'react'
import { Box, Text, useInput } from 'ink'
import { debugLog, type LogEntry, type LogLevel } from '../../debug/logger.ts'

type DebugLogProps = {
  maxLines?: number
}

const levelColors: Record<LogLevel, string> = {
  debug: 'gray',
  info: 'cyan',
  warn: 'yellow',
  error: 'red',
}

const levelLabels: Record<LogLevel, string> = {
  debug: 'DBG',
  info: 'INF',
  warn: 'WRN',
  error: 'ERR',
}

function formatTimestamp(date: Date): string {
  const h = date.getHours().toString().padStart(2, '0')
  const m = date.getMinutes().toString().padStart(2, '0')
  const s = date.getSeconds().toString().padStart(2, '0')
  const ms = date.getMilliseconds().toString().padStart(3, '0')
  return `${h}:${m}:${s}.${ms}`
}

type FormattedData = {
  text: string
  isTruncated: boolean
}

function formatData(data: unknown, isExpanded: boolean): FormattedData {
  if (data === undefined) return { text: '', isTruncated: false }
  if (typeof data === 'string') {
    if (!isExpanded && data.length > 50) {
      return { text: ` ${data.slice(0, 50)}...`, isTruncated: true }
    }
    return { text: ` ${data}`, isTruncated: false }
  }
  try {
    const str = JSON.stringify(data)
    if (!isExpanded && str.length > 50) {
      return { text: ` ${str.slice(0, 50)}...`, isTruncated: true }
    }
    return { text: ` ${str}`, isTruncated: false }
  } catch {
    return { text: ` [Object]`, isTruncated: false }
  }
}

export function DebugLog({ maxLines = 8 }: DebugLogProps) {
  const [logs, setLogs] = useState<LogEntry[]>(() => debugLog.getLogs())
  const [scrollOffset, setScrollOffset] = useState(0)
  // Selected index relative to visible logs (0 = top of visible, maxLines-1 = bottom)
  const [selectedRelativeIndex, setSelectedRelativeIndex] = useState(maxLines - 1)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    const unsubscribe = debugLog.subscribe((entry) => {
      setLogs((prev) => {
        const newLogs = [...prev, entry]
        // Keep more logs in state for scrolling, but only show maxLines
        if (newLogs.length > 200) {
          return newLogs.slice(-200)
        }
        return newLogs
      })
      // Reset scroll to bottom when new log arrives
      setScrollOffset(0)
      // Keep selection at the bottom (most recent)
      setSelectedRelativeIndex(maxLines - 1)
      setExpanded(false)
    })

    return unsubscribe
  }, [maxLines])

  // Calculate visible logs based on scroll offset
  const endIndex = logs.length - scrollOffset
  const startIndex = Math.max(0, endIndex - maxLines)
  const visibleLogs = logs.slice(startIndex, endIndex)

  // Clamp selected index to valid range
  const clampedSelectedIndex = Math.max(0, Math.min(selectedRelativeIndex, visibleLogs.length - 1))

  // Handle keyboard navigation with [ and ] keys
  useInput((input) => {
    if (input === '[') {
      // Move selection up (older entries)
      if (clampedSelectedIndex > 0) {
        setSelectedRelativeIndex(clampedSelectedIndex - 1)
        setExpanded(false)
      } else if (startIndex > 0) {
        // Scroll up if we can
        setScrollOffset((prev) => Math.min(prev + 1, Math.max(0, logs.length - maxLines)))
      }
    } else if (input === ']') {
      // Move selection down (newer entries)
      if (clampedSelectedIndex < visibleLogs.length - 1) {
        setSelectedRelativeIndex(clampedSelectedIndex + 1)
        setExpanded(false)
      } else if (scrollOffset > 0) {
        // Scroll down if we can
        setScrollOffset((prev) => Math.max(prev - 1, 0))
      }
    } else if (input === 'e') {
      // Toggle expansion of selected log
      setExpanded((prev) => !prev)
    }
  })

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor="gray"
      paddingX={1}
    >
      <Box marginBottom={0}>
        <Text bold dimColor>
          Debug Log
        </Text>
        <Text dimColor> ({logs.length} entries)</Text>
        {scrollOffset > 0 && (
          <Text dimColor> [scrolled: -{scrollOffset}]</Text>
        )}
        <Text dimColor>  [/] nav  [e] expand</Text>
      </Box>

      {visibleLogs.length === 0 ? (
        <Text dimColor>No log entries yet...</Text>
      ) : (
        visibleLogs.map((entry, i) => {
          const isSelected = i === clampedSelectedIndex
          const isExpanded = isSelected && expanded
          const formatted = formatData(entry.data, isExpanded)
          const showExpandHint = isSelected && formatted.isTruncated && !expanded

          return (
            <Box key={`${entry.timestamp.getTime()}-${i}`}>
              <Text color={isSelected ? 'white' : 'gray'}>
                {isSelected ? '>' : ' '}
              </Text>
              <Text dimColor={!isSelected}>
                {formatTimestamp(entry.timestamp)}{' '}
              </Text>
              <Text
                color={levelColors[entry.level]}
                dimColor={!isSelected}
              >
                [{levelLabels[entry.level]}]
              </Text>
              <Text dimColor={!isSelected}> {entry.message}</Text>
              {entry.data !== undefined && (
                <Text dimColor>{formatted.text}</Text>
              )}
              {showExpandHint && (
                <Text color="yellow"> [e]</Text>
              )}
            </Box>
          )
        })
      )}
    </Box>
  )
}
