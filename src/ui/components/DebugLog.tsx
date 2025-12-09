import React, { useState, useEffect, useRef } from 'react'
import { Box, Text } from 'ink'
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

function formatData(data: unknown): string {
  if (data === undefined) return ''
  if (typeof data === 'string') return ` ${data}`
  try {
    const str = JSON.stringify(data)
    if (str.length > 50) {
      return ` ${str.slice(0, 50)}...`
    }
    return ` ${str}`
  } catch {
    return ` [Object]`
  }
}

export function DebugLog({ maxLines = 8 }: DebugLogProps) {
  const [logs, setLogs] = useState<LogEntry[]>(() => debugLog.getLogs())
  const scrollRef = useRef(0)

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
    })

    return unsubscribe
  }, [])

  // Show the last maxLines logs
  const visibleLogs = logs.slice(-maxLines)

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
      </Box>

      {visibleLogs.length === 0 ? (
        <Text dimColor>No log entries yet...</Text>
      ) : (
        visibleLogs.map((entry, i) => (
          <Box key={`${entry.timestamp.getTime()}-${i}`}>
            <Text dimColor>{formatTimestamp(entry.timestamp)} </Text>
            <Text color={levelColors[entry.level]}>
              [{levelLabels[entry.level]}]
            </Text>
            <Text> {entry.message}</Text>
            {entry.data !== undefined && (
              <Text dimColor>{formatData(entry.data)}</Text>
            )}
          </Box>
        ))
      )}
    </Box>
  )
}
