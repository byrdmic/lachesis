// Debug logging utility for Lachesis
// Captures log messages, emits to subscribers, and writes to session log files

import { existsSync, mkdirSync, appendFileSync } from 'fs'
import { join } from 'path'
import { getConfigDir } from '../config/paths.ts'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export type LogEntry = {
  timestamp: Date
  level: LogLevel
  message: string
  data?: unknown
}

type LogSubscriber = (entry: LogEntry) => void

/**
 * Format a date as a filename-safe timestamp: YYYY-MM-DD_HH-MM-SS
 */
function formatSessionTimestamp(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`
}

/**
 * Format a log entry for file output
 */
function formatLogEntry(entry: LogEntry): string {
  const timestamp = entry.timestamp.toISOString()
  const level = entry.level.toUpperCase().padEnd(5)
  let line = `[${timestamp}] ${level} ${entry.message}`

  if (entry.data !== undefined) {
    try {
      const dataStr = JSON.stringify(entry.data, null, 2)
      // Indent data for readability
      const indentedData = dataStr
        .split('\n')
        .map((l) => `    ${l}`)
        .join('\n')
      line += `\n${indentedData}`
    } catch {
      line += `\n    [Data not serializable]`
    }
  }

  return line
}

class DebugLogger {
  private subscribers: Set<LogSubscriber> = new Set()
  private logs: LogEntry[] = []
  private maxLogs = 100
  private _enabled = false

  // File logging
  private _fileLoggingEnabled = false
  private _sessionStartTime: Date
  private _logFilePath: string | null = null
  private _logsDir: string

  constructor() {
    this._sessionStartTime = new Date()
    this._logsDir = join(getConfigDir(), 'logs')
  }

  get enabled(): boolean {
    return this._enabled
  }

  get fileLoggingEnabled(): boolean {
    return this._fileLoggingEnabled
  }

  get logFilePath(): string | null {
    return this._logFilePath
  }

  get sessionStartTime(): Date {
    return this._sessionStartTime
  }

  setEnabled(enabled: boolean): void {
    this._enabled = enabled
  }

  /**
   * Enable file logging - creates a new session log file
   */
  enableFileLogging(): void {
    if (this._fileLoggingEnabled) return

    try {
      // Ensure logs directory exists
      if (!existsSync(this._logsDir)) {
        mkdirSync(this._logsDir, { recursive: true })
      }

      // Create session log file with timestamp
      const sessionTimestamp = formatSessionTimestamp(this._sessionStartTime)
      this._logFilePath = join(this._logsDir, `session_${sessionTimestamp}.log`)

      // Write session header
      const header = [
        '='.repeat(80),
        `LACHESIS SESSION LOG`,
        `Started: ${this._sessionStartTime.toISOString()}`,
        `Log file: ${this._logFilePath}`,
        '='.repeat(80),
        '',
      ].join('\n')

      appendFileSync(this._logFilePath, header + '\n')
      this._fileLoggingEnabled = true

      // Log that file logging started
      this.info('File logging enabled', { logFile: this._logFilePath })
    } catch (err) {
      // Silently fail if we can't write logs - don't break the app
      console.error('Failed to enable file logging:', err)
    }
  }

  /**
   * Write entry to log file
   */
  private writeToFile(entry: LogEntry): void {
    if (!this._fileLoggingEnabled || !this._logFilePath) return

    try {
      const formatted = formatLogEntry(entry)
      appendFileSync(this._logFilePath, formatted + '\n')
    } catch {
      // Silently fail file writes
    }
  }

  subscribe(callback: LogSubscriber): () => void {
    this.subscribers.add(callback)
    return () => {
      this.subscribers.delete(callback)
    }
  }

  getLogs(): LogEntry[] {
    return [...this.logs]
  }

  clear(): void {
    this.logs = []
  }

  private log(level: LogLevel, message: string, data?: unknown): void {
    const entry: LogEntry = {
      timestamp: new Date(),
      level,
      message,
      data,
    }

    // Always write to file if file logging is enabled
    this.writeToFile(entry)

    // Only keep in memory and notify subscribers if debug display is enabled
    if (!this._enabled) return

    this.logs.push(entry)

    // Keep only the last maxLogs entries
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs)
    }

    // Notify subscribers
    for (const subscriber of this.subscribers) {
      subscriber(entry)
    }
  }

  debug(message: string, data?: unknown): void {
    this.log('debug', message, data)
  }

  info(message: string, data?: unknown): void {
    this.log('info', message, data)
  }

  warn(message: string, data?: unknown): void {
    this.log('warn', message, data)
  }

  error(message: string, data?: unknown): void {
    this.log('error', message, data)
  }
}

// Singleton instance
export const debugLog = new DebugLogger()
