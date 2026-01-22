// Chat Sidebar Component
// Manages chat history listing, loading, and file watching

import * as fs from 'fs'
import * as path from 'path'
import type { App, Vault } from 'obsidian'
import type { ConversationMessage } from '../../ai/providers/types'
import { listChatLogs, loadChatLog, saveChatLog, type ChatLogMetadata } from '../../core/chat'
import type { ChatMode } from '../../ai/prompts/types'

// ============================================================================
// Types
// ============================================================================

export type ChatSidebarCallbacks = {
  /** Called when user clicks "New Chat" */
  onNewChat: () => void
  /** Called when user selects a chat from history */
  onLoadChat: (filename: string, messages: ConversationMessage[]) => void
}

// ============================================================================
// Chat Sidebar Component
// ============================================================================

export class ChatSidebar {
  private app: App
  private projectPath: string
  private callbacks: ChatSidebarCallbacks

  // State
  private chatLogs: ChatLogMetadata[] = []
  private currentChatFilename: string | null = null

  // DOM Elements
  private containerEl: HTMLElement | null = null
  private chatListEl: HTMLElement | null = null

  // Filesystem watcher
  private fsWatcher: fs.FSWatcher | null = null

  constructor(app: App, projectPath: string, callbacks: ChatSidebarCallbacks) {
    this.app = app
    this.projectPath = projectPath
    this.callbacks = callbacks
  }

  /**
   * Initialize the sidebar: load chat history and set up file watching.
   */
  async initialize(): Promise<void> {
    await this.loadChatHistory()
    this.setupFileWatcher()
  }

  /**
   * Clean up resources (file watcher, etc.)
   */
  cleanup(): void {
    this.cleanupFileWatcher()
    this.containerEl = null
    this.chatListEl = null
  }

  /**
   * Render the sidebar into the provided container.
   */
  render(container: HTMLElement): void {
    this.containerEl = container
    container.empty()

    // Sidebar header
    const header = container.createDiv({ cls: 'lachesis-sidebar-header' })
    header.createSpan({ text: 'Chat History' })

    // New Chat button
    const newChatBtn = container.createEl('button', {
      text: '+ New Chat',
      cls: 'lachesis-new-chat-button',
    })
    newChatBtn.addEventListener('click', () => this.callbacks.onNewChat())

    // Chat list container
    this.chatListEl = container.createDiv({ cls: 'lachesis-chat-list' })

    this.renderChatList()
  }

  /**
   * Render the chat list items.
   */
  private renderChatList(): void {
    if (!this.chatListEl) return

    this.chatListEl.empty()

    if (this.chatLogs.length === 0) {
      this.chatListEl.createDiv({
        text: 'No previous chats',
        cls: 'lachesis-chat-empty',
      })
    } else {
      for (const log of this.chatLogs) {
        this.renderChatItem(log)
      }
    }
  }

  /**
   * Render a single chat item in the list.
   */
  private renderChatItem(log: ChatLogMetadata): void {
    if (!this.chatListEl) return

    const isActive = log.filename === this.currentChatFilename
    const item = this.chatListEl.createDiv({
      cls: `lachesis-chat-item ${isActive ? 'active' : ''}`,
    })

    item.createEl('span', { text: log.displayDate, cls: 'lachesis-chat-date' })
    item.createEl('span', { text: log.preview, cls: 'lachesis-chat-preview' })

    item.addEventListener('click', async () => {
      if (log.filename !== this.currentChatFilename) {
        await this.loadChat(log.filename)
      }
    })
  }

  /**
   * Load chat history from disk.
   */
  private async loadChatHistory(): Promise<void> {
    try {
      this.chatLogs = await listChatLogs(this.app.vault, this.projectPath)
    } catch (err) {
      console.warn('Failed to load chat history:', err)
      this.chatLogs = []
    }
  }

  /**
   * Load a specific chat from file.
   */
  private async loadChat(filename: string): Promise<void> {
    const chatLog = await loadChatLog(this.app.vault, this.projectPath, filename)
    if (chatLog) {
      this.currentChatFilename = filename
      this.callbacks.onLoadChat(filename, chatLog.messages)
      this.highlightCurrentChat()
    }
  }

  /**
   * Save the current chat to disk.
   * Called by the parent modal after each message.
   */
  async saveChat(messages: ConversationMessage[], chatMode?: ChatMode): Promise<string | null> {
    if (messages.length === 0) return null

    const wasNewChat = !this.currentChatFilename

    const result = await saveChatLog(
      this.app.vault,
      this.projectPath,
      messages,
      this.currentChatFilename,
      chatMode
    )

    if (result.success) {
      if (wasNewChat) {
        this.currentChatFilename = result.filename
      }
      // Note: Sidebar refresh is handled by file watcher
      return result.filename
    }

    return null
  }

  /**
   * Start a new chat (clear current selection).
   */
  startNewChat(): void {
    this.currentChatFilename = null
    this.highlightCurrentChat()
  }

  /**
   * Set the current chat filename (used when loading a chat).
   */
  setCurrentChatFilename(filename: string | null): void {
    this.currentChatFilename = filename
    this.highlightCurrentChat()
  }

  /**
   * Get the current chat filename.
   */
  getCurrentChatFilename(): string | null {
    return this.currentChatFilename
  }

  /**
   * Highlight the current chat in the list.
   */
  highlightCurrentChat(): void {
    if (!this.chatListEl) return

    const items = this.chatListEl.querySelectorAll('.lachesis-chat-item')
    items.forEach((el, idx) => {
      const isActive = this.chatLogs[idx]?.filename === this.currentChatFilename
      el.toggleClass('active', isActive)
    })
  }

  /**
   * Set up filesystem watcher for changes in the .ai/logs folder.
   */
  private setupFileWatcher(): void {
    // Get absolute path to the logs folder
    const basePath = (this.app.vault.adapter as any).getBasePath()
    const logsPath = path.join(basePath, this.projectPath, '.ai', 'logs')

    // Ensure the directory exists before watching
    if (!fs.existsSync(logsPath)) {
      try {
        fs.mkdirSync(logsPath, { recursive: true })
      } catch (err) {
        console.warn('Could not create logs directory for watching:', err)
        return
      }
    }

    try {
      // Watch the logs directory for any changes
      this.fsWatcher = fs.watch(logsPath, { persistent: false }, async (eventType, filename) => {
        // Only react to .md file changes
        if (filename && filename.endsWith('.md')) {
          console.log(`File system change detected: ${eventType} ${filename}`)
          await this.loadChatHistory()
          this.renderChatList()
          this.highlightCurrentChat()
        }
      })

      this.fsWatcher.on('error', (err) => {
        console.warn('File watcher error:', err)
      })

      console.log(`Watching for chat log changes: ${logsPath}`)
    } catch (err) {
      console.warn('Could not set up file watcher:', err)
    }
  }

  /**
   * Clean up filesystem watcher.
   */
  private cleanupFileWatcher(): void {
    if (this.fsWatcher) {
      this.fsWatcher.close()
      this.fsWatcher = null
    }
  }
}
