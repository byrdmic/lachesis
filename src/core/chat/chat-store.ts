// Chat Store - File-based persistence for chat history

import { TFile, TFolder, Vault } from 'obsidian'
import type { ConversationMessage } from '../../ai/providers/types'
import type { ChatLog, ChatLogMetadata } from './types'

// ============================================================================
// Constants
// ============================================================================

const AI_FOLDER = '.ai'
const LOGS_FOLDER = 'logs'
const PREVIEW_LENGTH = 50

// ============================================================================
// Public API
// ============================================================================

/**
 * Ensure the .ai/logs/ folder exists for a project.
 * Creates both .ai and .ai/logs if they don't exist.
 */
export async function ensureChatLogsFolder(
  vault: Vault,
  projectPath: string
): Promise<string> {
  const aiPath = `${projectPath}/${AI_FOLDER}`
  const logsPath = `${aiPath}/${LOGS_FOLDER}`

  // Use adapter to check filesystem directly (avoids vault cache issues)
  const aiExists = await vault.adapter.exists(aiPath)
  if (!aiExists) {
    await vault.adapter.mkdir(aiPath)
  }

  const logsExists = await vault.adapter.exists(logsPath)
  if (!logsExists) {
    await vault.adapter.mkdir(logsPath)
  }

  return logsPath
}

/**
 * Generate a filename for a new chat log based on current timestamp.
 * Format: YYYY-MM-DDTHH-MM-SS.md (colons replaced with hyphens for Windows compatibility)
 */
export function generateChatFilename(): string {
  const now = new Date()
  const iso = now.toISOString()
  // Replace colons and remove milliseconds: 2025-01-02T10:30:00.000Z -> 2025-01-02T10-30-00
  const safe = iso.slice(0, 19).replace(/:/g, '-')
  return `${safe}.md`
}

/**
 * List all chat logs for a project, sorted by date (newest first).
 */
export async function listChatLogs(
  vault: Vault,
  projectPath: string
): Promise<ChatLogMetadata[]> {
  const logsPath = `${projectPath}/${AI_FOLDER}/${LOGS_FOLDER}`
  const folder = vault.getAbstractFileByPath(logsPath)

  if (!folder || !(folder instanceof TFolder)) {
    return []
  }

  const logs: ChatLogMetadata[] = []

  for (const child of folder.children) {
    if (child instanceof TFile && child.extension === 'md') {
      try {
        const content = await vault.read(child)
        const metadata = parseMetadataFromContent(content, child.name)
        if (metadata) {
          logs.push(metadata)
        }
      } catch (err) {
        console.warn(`Failed to read chat log ${child.path}:`, err)
      }
    }
  }

  // Sort by created date, newest first
  logs.sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime())

  return logs
}

/**
 * Load a specific chat log by filename.
 */
export async function loadChatLog(
  vault: Vault,
  projectPath: string,
  filename: string
): Promise<ChatLog | null> {
  const filePath = `${projectPath}/${AI_FOLDER}/${LOGS_FOLDER}/${filename}`
  const file = vault.getAbstractFileByPath(filePath)

  if (!file || !(file instanceof TFile)) {
    return null
  }

  try {
    const content = await vault.read(file)
    return parseChatLogContent(content, filename)
  } catch (err) {
    console.error(`Failed to load chat log ${filePath}:`, err)
    return null
  }
}

/**
 * Save messages to a chat log file.
 * Creates new file if filename is null, otherwise updates existing.
 * Returns the filename used (important for new files).
 */
export async function saveChatLog(
  vault: Vault,
  projectPath: string,
  messages: ConversationMessage[],
  filename: string | null
): Promise<{ filename: string; success: boolean }> {
  try {
    // Ensure folder exists
    await ensureChatLogsFolder(vault, projectPath)

    // Generate filename if new
    const actualFilename = filename ?? generateChatFilename()
    const filePath = `${projectPath}/${AI_FOLDER}/${LOGS_FOLDER}/${actualFilename}`

    // Serialize messages to markdown
    const content = serializeChatLog(messages, projectPath)

    // Always use adapter.write to avoid vault cache timing issues
    // This works for both creating new files and updating existing ones
    await vault.adapter.write(filePath, content)

    console.log(`Chat log saved: ${filePath} (${messages.length} messages)`)
    return { filename: actualFilename, success: true }
  } catch (err) {
    console.error('Failed to save chat log:', err)
    return { filename: filename ?? '', success: false }
  }
}

/**
 * Delete a chat log file.
 */
export async function deleteChatLog(
  vault: Vault,
  projectPath: string,
  filename: string
): Promise<boolean> {
  const filePath = `${projectPath}/${AI_FOLDER}/${LOGS_FOLDER}/${filename}`
  const file = vault.getAbstractFileByPath(filePath)

  if (!file || !(file instanceof TFile)) {
    return false
  }

  try {
    await vault.delete(file)
    return true
  } catch (err) {
    console.error(`Failed to delete chat log ${filePath}:`, err)
    return false
  }
}

// ============================================================================
// Internal Helpers
// ============================================================================

/**
 * Serialize messages to markdown format with frontmatter.
 */
function serializeChatLog(messages: ConversationMessage[], projectPath: string): string {
  const now = new Date().toISOString()
  const firstTimestamp = messages[0]?.timestamp || now

  const lines: string[] = [
    '---',
    `created: ${firstTimestamp}`,
    `updated: ${now}`,
    `messageCount: ${messages.length}`,
    `projectPath: ${projectPath}`,
    '---',
    '',
    '# Chat Log',
    '',
  ]

  for (const msg of messages) {
    const time = msg.timestamp
      ? new Date(msg.timestamp).toTimeString().slice(0, 5)
      : new Date().toTimeString().slice(0, 5)

    lines.push(`## ${time} - ${msg.role}`)
    lines.push(msg.content)
    lines.push('')
    lines.push('---')
    lines.push('')
  }

  return lines.join('\n')
}

/**
 * Parse metadata from chat log content (for listing).
 */
function parseMetadataFromContent(content: string, filename: string): ChatLogMetadata | null {
  const frontmatter = parseFrontmatter(content)
  const created = frontmatter.created as string | undefined
  if (!created) {
    return null
  }

  const updated = (frontmatter.updated as string | undefined) || created
  const messageCount = (frontmatter.messageCount as number | undefined) || 0

  // Extract preview from first assistant message
  const preview = extractPreview(content)

  // Format display date
  const displayDate = formatDisplayDate(created)

  return {
    filename,
    created,
    updated,
    messageCount,
    displayDate,
    preview,
  }
}

/**
 * Parse full chat log content into ChatLog object.
 */
function parseChatLogContent(content: string, filename: string): ChatLog | null {
  const frontmatter = parseFrontmatter(content)
  const created = frontmatter.created as string | undefined
  if (!created) {
    return null
  }

  const updated = (frontmatter.updated as string | undefined) || created

  // Parse messages from body
  const messages = parseMessages(content)

  const metadata: ChatLogMetadata = {
    filename,
    created,
    updated,
    messageCount: messages.length,
    displayDate: formatDisplayDate(created),
    preview: extractPreview(content),
  }

  return { metadata, messages }
}

/**
 * Parse YAML frontmatter from markdown content.
 */
function parseFrontmatter(content: string): Record<string, unknown> {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!match) {
    return {}
  }

  const yaml = match[1]
  const result: Record<string, unknown> = {}

  for (const line of yaml.split('\n')) {
    const colonIdx = line.indexOf(':')
    if (colonIdx > 0) {
      const key = line.slice(0, colonIdx).trim()
      let value: unknown = line.slice(colonIdx + 1).trim()

      // Parse numbers
      if (/^\d+$/.test(value as string)) {
        value = parseInt(value as string, 10)
      }

      result[key] = value
    }
  }

  return result
}

/**
 * Parse messages from chat log body.
 */
function parseMessages(content: string): ConversationMessage[] {
  const messages: ConversationMessage[] = []

  // Remove frontmatter
  const body = content.replace(/^---[\s\S]*?---\r?\n/, '')

  // Split by message headers: ## HH:MM - role
  const messageRegex = /## (\d{2}:\d{2}) - (assistant|user)\r?\n([\s\S]*?)(?=\r?\n---|\r?\n## \d{2}:\d{2} - |$)/g
  let match: RegExpExecArray | null

  while ((match = messageRegex.exec(body)) !== null) {
    const [, , role, messageContent] = match
    messages.push({
      role: role as 'assistant' | 'user',
      content: messageContent.trim(),
    })
  }

  return messages
}

/**
 * Extract preview text from first assistant message.
 */
function extractPreview(content: string): string {
  const match = content.match(/## \d{2}:\d{2} - assistant\r?\n([\s\S]*?)(?:\r?\n---|$)/)
  if (!match) {
    return ''
  }

  const text = match[1].trim()
  if (text.length <= PREVIEW_LENGTH) {
    return text
  }

  return text.slice(0, PREVIEW_LENGTH).trim() + '...'
}

/**
 * Format ISO timestamp as human-readable display date.
 */
function formatDisplayDate(isoString: string): string {
  try {
    const date = new Date(isoString)
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    })
  } catch {
    return isoString
  }
}
