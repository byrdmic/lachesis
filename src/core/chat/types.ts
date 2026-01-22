// Chat History Types

import type { ConversationMessage } from '../../ai/providers/types'
import type { ChatMode } from '../../ai/prompts/types'

/**
 * Metadata for a chat log file (used in sidebar listing).
 */
export type ChatLogMetadata = {
  /** Filename without path (e.g., "2025-01-02T10-30-00.md") */
  filename: string
  /** ISO timestamp when chat was created */
  created: string
  /** ISO timestamp when chat was last updated */
  updated: string
  /** Number of messages in the chat */
  messageCount: number
  /** Human-readable date for display (e.g., "Jan 2, 10:30 AM") */
  displayDate: string
  /** Preview text from first assistant message (~50 chars) */
  preview: string
  /** Chat mode: 'default' or 'planning' */
  chatMode?: ChatMode
}

/**
 * Full chat log with metadata and messages.
 */
export type ChatLog = {
  metadata: ChatLogMetadata
  messages: ConversationMessage[]
}
