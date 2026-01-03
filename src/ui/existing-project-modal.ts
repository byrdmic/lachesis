// Existing Project Modal - Chat interface for continuing work on existing projects

import { App, Modal, Notice, TFile, TFolder, EventRef } from 'obsidian'
import type LachesisPlugin from '../main'
import type { ProjectSnapshot } from '../core/project/snapshot'
import { buildProjectSnapshot, formatProjectSnapshotForModel, fetchProjectFileContents, formatFileContentsForModel } from '../core/project/snapshot-builder'
import { getProvider } from '../ai/providers/factory'
import { isProviderAvailable } from '../ai/providers/factory'
import type { AIProvider, ConversationMessage } from '../ai/providers/types'
import { buildSystemPrompt } from '../ai/prompts'
import { getAllWorkflows, getWorkflowDefinition, WORKFLOW_DEFINITIONS } from '../core/workflows/definitions'
import type { WorkflowDefinition, WorkflowName } from '../core/workflows/types'
import { extractDiffBlocks, applyDiff, containsDiffBlocks, type DiffBlock } from '../utils/diff'
import { getTrimmedLogContent, type TrimmedLogResult } from '../utils/log-parser'
import { DiffViewerModal, type DiffAction } from './diff-viewer-modal'
import { listChatLogs, loadChatLog, saveChatLog, type ChatLogMetadata } from '../core/chat'

// ============================================================================
// Types
// ============================================================================

type ModalPhase = 'loading' | 'chat' | 'error'

// ============================================================================
// Existing Project Modal
// ============================================================================

export class ExistingProjectModal extends Modal {
  private plugin: LachesisPlugin
  private projectPath: string
  private snapshot: ProjectSnapshot
  private provider: AIProvider | null = null

  // UI State
  private phase: ModalPhase = 'loading'
  private messages: ConversationMessage[] = []
  private isProcessing = false
  private streamingText = ''
  private activeWorkflow: WorkflowDefinition | null = null
  private pendingDiffs: DiffBlock[] = []

  // DOM Elements
  private messagesContainer: HTMLElement | null = null
  private inputEl: HTMLInputElement | null = null
  private statusEl: HTMLElement | null = null

  // Chat History State
  private chatLogs: ChatLogMetadata[] = []
  private currentChatFilename: string | null = null
  private sidebarEl: HTMLElement | null = null
  private chatListEl: HTMLElement | null = null

  // Vault event listeners for real-time updates
  private vaultCreateRef: EventRef | null = null
  private vaultModifyRef: EventRef | null = null
  private vaultDeleteRef: EventRef | null = null

  constructor(
    app: App,
    plugin: LachesisPlugin,
    projectPath: string,
    snapshot: ProjectSnapshot,
  ) {
    super(app)
    this.plugin = plugin
    this.projectPath = projectPath
    this.snapshot = snapshot
  }

  async onOpen() {
    const { contentEl } = this
    contentEl.empty()
    // Style hook: Obsidian sizes modals via the root `.modal` element
    this.modalEl.addClass('lachesis-modal-root')
    contentEl.addClass('lachesis-modal')

    // Check if provider is configured
    if (!isProviderAvailable(this.plugin.settings.provider, this.plugin.settings)) {
      this.renderApiKeyMissing()
      return
    }

    // Create provider
    this.provider = getProvider(this.plugin.settings)

    // Load chat history
    await this.loadChatHistory()

    // Set up vault event listeners for real-time sidebar updates
    this.setupVaultListeners()

    // Render chat interface
    this.phase = 'chat'
    this.renderChatPhase()

    // Opening message is now triggered by the "Start Chat" button
    // This allows users to immediately click workflow buttons like "Refine Log"
  }

  onClose() {
    // Clean up vault event listeners
    this.cleanupVaultListeners()

    const { contentEl } = this
    contentEl.empty()
    this.provider = null
    this.messages = []
    this.chatLogs = []
    this.currentChatFilename = null
  }

  private renderApiKeyMissing() {
    const { contentEl } = this

    contentEl.createEl('h2', { text: 'Lachesis' })
    contentEl.createEl('p', {
      text: 'Please configure your AI provider API key in the plugin settings.',
      cls: 'lachesis-message-text',
    })

    const buttonContainer = contentEl.createDiv({ cls: 'lachesis-button-container' })
    const button = buttonContainer.createEl('button', {
      text: 'Open Settings',
      cls: 'mod-cta',
    })
    button.addEventListener('click', () => {
      this.close()
      // @ts-expect-error - accessing internal Obsidian API
      const settingTab = this.app.setting
      if (settingTab) {
        settingTab.open()
        settingTab.openTabById('lachesis')
      }
    })
  }

  private renderChatPhase() {
    const { contentEl } = this
    contentEl.empty()

    // Two-column layout container
    const layoutEl = contentEl.createDiv({ cls: 'lachesis-modal-layout' })

    // Left sidebar with chat history
    this.sidebarEl = layoutEl.createDiv({ cls: 'lachesis-sidebar' })
    this.renderSidebar(this.sidebarEl)

    // Main content area
    const mainEl = layoutEl.createDiv({ cls: 'lachesis-main-content' })

    // Header with project name
    const header = mainEl.createDiv({ cls: 'lachesis-header' })
    header.createEl('h2', { text: this.snapshot.projectName })

    // Status badge
    const statusBadge = header.createEl('span', {
      cls: `lachesis-status-badge ${this.snapshot.readiness.isReady ? 'ready' : 'needs-work'}`,
    })
    statusBadge.setText(this.snapshot.readiness.isReady ? 'Ready' : 'Needs attention')

    // Workflow buttons bar
    const workflowBar = mainEl.createDiv({ cls: 'lachesis-workflow-bar' })

    // Start Chat button - triggers the opening message
    const startChatBtn = workflowBar.createEl('button', {
      text: 'Start Chat',
      cls: 'lachesis-workflow-button lachesis-start-chat-button',
    })
    startChatBtn.addEventListener('click', () => {
      if (!this.isProcessing && this.messages.length === 0) {
        this.generateOpeningMessage()
      }
    })

    for (const workflow of getAllWorkflows()) {
      const btn = workflowBar.createEl('button', {
        text: workflow.displayName,
        cls: 'lachesis-workflow-button',
      })
      btn.addEventListener('click', () => {
        if (!this.isProcessing) {
          this.triggerWorkflow(workflow.displayName)
        }
      })
    }

    // Messages container
    this.messagesContainer = mainEl.createDiv({ cls: 'lachesis-messages' })

    // Render existing messages
    if (this.messages.length === 0) {
      this.renderEmptyState()
    } else {
      for (const msg of this.messages) {
        this.addMessageToUI(msg.role, msg.content)
      }
    }

    // Input area
    const inputContainer = mainEl.createDiv({ cls: 'lachesis-input-area' })

    this.inputEl = inputContainer.createEl('input', {
      type: 'text',
      placeholder: 'Ask about the project or request changes...',
      cls: 'lachesis-input',
    })

    this.inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !this.isProcessing) {
        e.preventDefault()
        this.handleUserInput()
      }
    })

    const sendButton = inputContainer.createEl('button', {
      text: 'Send',
      cls: 'lachesis-send-button',
    })
    sendButton.addEventListener('click', () => {
      if (!this.isProcessing) {
        this.handleUserInput()
      }
    })

    // Status bar
    this.statusEl = mainEl.createDiv({ cls: 'lachesis-status' })
    this.updateStatus('Ready')
  }

  private addMessageToUI(role: 'assistant' | 'user', content: string, isStreaming = false) {
    if (!this.messagesContainer) return

    // Remove empty state if present
    const emptyState = this.messagesContainer.querySelector('.lachesis-empty-state-wrapper')
    if (emptyState) {
      emptyState.remove()
    }

    const messageEl = this.messagesContainer.createDiv({
      cls: `lachesis-message ${role} ${isStreaming ? 'streaming' : ''}`,
    })

    // Parse hint tags and render them specially
    const hintMatch = content.match(/\{\{hint\}\}([\s\S]*?)\{\{\/hint\}\}/)
    if (hintMatch) {
      const mainContent = content.replace(/\{\{hint\}\}[\s\S]*?\{\{\/hint\}\}/, '').trim()
      messageEl.setText(mainContent)

      // Add hint as a separate styled element
      const hintEl = messageEl.createDiv({ cls: 'lachesis-hint' })
      hintEl.setText(hintMatch[1].trim())
    } else {
      messageEl.setText(content)
    }

    // Scroll to bottom
    this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight

    return messageEl
  }

  private updateStreamingMessage(content: string) {
    if (!this.messagesContainer) return

    const streamingEl = this.messagesContainer.querySelector('.lachesis-message.streaming')
    if (streamingEl) {
      // Parse hint tags for display
      const hintMatch = content.match(/\{\{hint\}\}([\s\S]*?)\{\{\/hint\}\}/)
      if (hintMatch) {
        const mainContent = content.replace(/\{\{hint\}\}[\s\S]*?\{\{\/hint\}\}/, '').trim()
        streamingEl.textContent = mainContent
      } else {
        streamingEl.textContent = content
      }
      this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight
    }
  }

  private finalizeStreamingMessage() {
    if (!this.messagesContainer) return

    const streamingEl = this.messagesContainer.querySelector('.lachesis-message.streaming') as HTMLElement | null
    if (streamingEl) {
      streamingEl.removeClass('streaming')

      // Check if content contains diffs
      if (containsDiffBlocks(this.streamingText)) {
        // Clear and re-render with diff blocks
        streamingEl.empty()
        this.renderMessageWithDiffs(streamingEl, this.streamingText)
      } else {
        // Re-render with hint styling (existing behavior)
        const hintMatch = this.streamingText.match(/\{\{hint\}\}([\s\S]*?)\{\{\/hint\}\}/)
        if (hintMatch) {
          const mainContent = this.streamingText.replace(/\{\{hint\}\}[\s\S]*?\{\{\/hint\}\}/, '').trim()
          streamingEl.textContent = mainContent

          const hintEl = streamingEl.createDiv({ cls: 'lachesis-hint' })
          hintEl.setText(hintMatch[1].trim())
        }
      }
    }
  }

  /**
   * Render a message that contains diff blocks.
   * Shows a summary with clickable file links that open the diff viewer modal.
   */
  private renderMessageWithDiffs(container: HTMLElement, content: string) {
    const diffBlocks = extractDiffBlocks(content)

    if (diffBlocks.length === 0) {
      // No diffs found, render as plain text
      container.setText(content)
      return
    }

    // Store pending diffs
    this.pendingDiffs = diffBlocks

    // Extract text before first diff block
    const firstDiffMarker = '```diff\n' + diffBlocks[0].rawDiff + '\n```'
    const firstIdx = content.indexOf(firstDiffMarker)
    if (firstIdx > 0) {
      const textBefore = content.slice(0, firstIdx).trim()
      if (textBefore) {
        const textEl = container.createEl('p', { cls: 'lachesis-diff-text' })
        textEl.setText(textBefore)
      }
    }

    // Render summary message
    const summaryEl = container.createEl('p', { cls: 'lachesis-diff-summary' })
    summaryEl.setText('Here are the proposed changes:')

    // Render file links list
    const fileListEl = container.createDiv({ cls: 'lachesis-diff-file-list' })

    for (const diffBlock of diffBlocks) {
      this.renderDiffFileLink(fileListEl, diffBlock)
    }

    // Extract text after last diff block
    const lastDiffBlock = diffBlocks[diffBlocks.length - 1]
    const lastDiffMarker = '```diff\n' + lastDiffBlock.rawDiff + '\n```'
    const lastIdx = content.lastIndexOf(lastDiffMarker)
    if (lastIdx >= 0) {
      const textAfter = content.slice(lastIdx + lastDiffMarker.length).trim()
      if (textAfter) {
        const textEl = container.createEl('p', { cls: 'lachesis-diff-text' })
        textEl.setText(textAfter)
      }
    }
  }

  /**
   * Render a clickable file link for a diff block.
   */
  private renderDiffFileLink(container: HTMLElement, diffBlock: DiffBlock) {
    const linkEl = container.createDiv({ cls: 'lachesis-diff-file-link' })
    diffBlock.element = linkEl

    // File icon
    const iconEl = linkEl.createSpan({ cls: 'lachesis-diff-file-icon' })
    iconEl.setText('📄')

    // File name (clickable)
    const nameEl = linkEl.createEl('a', {
      text: diffBlock.fileName,
      cls: 'lachesis-diff-file-name',
    })
    nameEl.addEventListener('click', (e) => {
      e.preventDefault()
      this.openDiffViewer(diffBlock)
    })

    // Change summary
    if (diffBlock.parsed) {
      let addCount = 0
      let removeCount = 0
      for (const hunk of diffBlock.parsed.hunks) {
        for (const line of hunk.lines) {
          if (line.type === 'add') addCount++
          if (line.type === 'remove') removeCount++
        }
      }
      const changeEl = linkEl.createSpan({ cls: 'lachesis-diff-file-changes' })
      changeEl.setText(`+${addCount} / -${removeCount}`)
    }

    // Status indicator
    const statusEl = linkEl.createSpan({ cls: `lachesis-diff-file-status ${diffBlock.status}` })
    statusEl.setText(diffBlock.status === 'pending' ? 'pending' : diffBlock.status)
  }

  /**
   * Open the diff viewer modal for a specific diff block.
   */
  private openDiffViewer(diffBlock: DiffBlock) {
    const modal = new DiffViewerModal(
      this.app,
      diffBlock,
      this.projectPath,
      (updatedDiff, action) => this.handleDiffAction(updatedDiff, action),
    )
    modal.open()
  }

  /**
   * Handle when a diff is accepted or rejected from the viewer modal.
   */
  private async handleDiffAction(diffBlock: DiffBlock, action: DiffAction) {
    // Update the file link UI
    if (diffBlock.element) {
      const statusEl = diffBlock.element.querySelector('.lachesis-diff-file-status')
      if (statusEl) {
        statusEl.removeClass('pending')
        statusEl.addClass(action)
        statusEl.setText(action)
      }
      diffBlock.element.addClass(action)
    }

    // Refresh snapshot if changes were applied
    if (action === 'accepted') {
      this.snapshot = await buildProjectSnapshot(this.app.vault, this.projectPath)
    }
  }

  private updateStatus(status: string) {
    if (this.statusEl) {
      this.statusEl.setText(status)
    }
  }

  private setInputEnabled(enabled: boolean) {
    if (this.inputEl) {
      this.inputEl.disabled = !enabled
    }
    this.isProcessing = !enabled
  }

  private async generateOpeningMessage() {
    if (!this.provider) return

    this.setInputEnabled(false)
    this.updateStatus('Lachesis is analyzing the project...')

    // Add placeholder for streaming message
    this.addMessageToUI('assistant', '', true)

    const snapshotSummary = formatProjectSnapshotForModel(this.snapshot)

    const systemPrompt = buildSystemPrompt({
      sessionType: 'existing',
      projectName: this.snapshot.projectName,
      isFirstMessage: true,
      snapshotSummary,
    })

    try {
      const result = await this.provider.streamText(
        systemPrompt,
        [],
        (partial) => {
          this.streamingText = partial
          this.updateStreamingMessage(partial)
        },
      )

      this.finalizeStreamingMessage()

      if (result.success && result.content) {
        this.messages.push({
          role: 'assistant',
          content: result.content,
          timestamp: new Date().toISOString(),
        })
        await this.saveCurrentChat()
        this.highlightCurrentChat()
      }

      this.setInputEnabled(true)
      this.updateStatus('Your turn')
      this.inputEl?.focus()
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Failed to generate opening message'
      this.finalizeStreamingMessage()
      this.updateStatus(`Error: ${error}`)
      this.setInputEnabled(true)
    }
  }

  private async handleUserInput() {
    if (!this.provider || !this.inputEl) return

    const message = this.inputEl.value.trim()
    if (!message) return

    // Clear input
    this.inputEl.value = ''

    // Detect workflow request from user input (if not already set by button click)
    if (!this.activeWorkflow) {
      this.activeWorkflow = this.detectWorkflowFromMessage(message)
    }

    // Add user message
    const userMessage: ConversationMessage = {
      role: 'user',
      content: message,
      timestamp: new Date().toISOString(),
    }
    this.messages.push(userMessage)
    this.addMessageToUI('user', message)

    // Save after user message
    await this.saveCurrentChat()
    this.highlightCurrentChat()

    // Generate response
    this.setInputEnabled(false)

    // Fetch file contents if a workflow is active
    let workflowFileContents: string | undefined
    let logTrimResult: TrimmedLogResult | null = null
    if (this.activeWorkflow) {
      this.updateStatus(`Fetching files for ${this.activeWorkflow.displayName}...`)
      try {
        const fileContents = await fetchProjectFileContents(
          this.app.vault,
          this.projectPath,
          this.activeWorkflow.readFiles,
        )

        // For refine-log workflow, trim large log files to only unsummarized entries
        if (this.activeWorkflow.name === 'refine-log' && fileContents['Log.md']) {
          logTrimResult = getTrimmedLogContent(fileContents['Log.md'])
          if (logTrimResult.wasTrimmed) {
            fileContents['Log.md'] = logTrimResult.content
            console.log(`Log trimmed: ${logTrimResult.trimSummary}`)
          }
        }

        workflowFileContents = formatFileContentsForModel(fileContents)
      } catch (err) {
        console.error('Failed to fetch workflow files:', err)
      }
    }

    this.updateStatus('Lachesis is thinking...')
    this.addMessageToUI('assistant', '', true)

    const snapshotSummary = formatProjectSnapshotForModel(this.snapshot)

    const systemPrompt = buildSystemPrompt({
      sessionType: 'existing',
      projectName: this.snapshot.projectName,
      isFirstMessage: false,
      snapshotSummary,
      activeWorkflow: this.activeWorkflow ?? undefined,
      workflowFileContents,
    })

    // Clear active workflow after use (it was included in this request)
    this.activeWorkflow = null

    try {
      const result = await this.provider.streamText(
        systemPrompt,
        this.messages,
        (partial) => {
          this.streamingText = partial
          this.updateStreamingMessage(partial)
        },
      )

      this.finalizeStreamingMessage()

      if (result.success && result.content) {
        this.messages.push({
          role: 'assistant',
          content: result.content,
          timestamp: new Date().toISOString(),
        })
        await this.saveCurrentChat()
        this.highlightCurrentChat()
      }

      this.setInputEnabled(true)
      this.updateStatus('Your turn')
      this.inputEl?.focus()
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Failed to generate response'
      this.finalizeStreamingMessage()
      this.updateStatus(`Error: ${error}`)
      this.setInputEnabled(true)
    }
  }

  /**
   * Detect if a user message is requesting a workflow.
   * Returns the workflow definition if detected, null otherwise.
   */
  private detectWorkflowFromMessage(message: string): WorkflowDefinition | null {
    // Check for common workflow trigger patterns
    const workflowPatterns = [
      /run\s+(?:the\s+)?(\w+(?:[- ]\w+)?)\s+workflow/i,
      /execute\s+(?:the\s+)?(\w+(?:[- ]\w+)?)\s+workflow/i,
      /start\s+(?:the\s+)?(\w+(?:[- ]\w+)?)\s+workflow/i,
      /do\s+(?:a\s+)?(\w+(?:[- ]\w+)?)\s+(?:workflow|pass)/i,
    ]

    for (const pattern of workflowPatterns) {
      const match = message.match(pattern)
      if (match) {
        const workflowName = match[1].toLowerCase().replace(/\s+/g, '-')

        // Try to find workflow by name or display name
        for (const workflow of getAllWorkflows()) {
          if (
            workflow.name === workflowName ||
            workflow.displayName.toLowerCase() === match[1].toLowerCase() ||
            workflow.displayName.toLowerCase().replace(/\s+/g, '-') === workflowName
          ) {
            return workflow
          }
        }
      }
    }

    return null
  }

  private triggerWorkflow(workflowDisplayName: string) {
    if (!this.inputEl) return

    // Find the workflow by display name
    const workflow = getAllWorkflows().find(w => w.displayName === workflowDisplayName)
    if (workflow) {
      this.activeWorkflow = workflow
    }

    this.inputEl.value = `Run the ${workflowDisplayName} workflow`
    this.handleUserInput()
  }

  private renderEmptyState() {
    if (!this.messagesContainer) return

    const wrapper = this.messagesContainer.createDiv({ cls: 'lachesis-empty-state-wrapper' })

    wrapper.createEl('div', {
      text: this.snapshot.projectName,
      cls: 'lachesis-empty-state-title'
    })

    const subtitle = this.snapshot.readiness.isReady
      ? 'Project is ready for workflows.'
      : 'Project needs attention.'

    wrapper.createEl('div', {
      text: subtitle,
      cls: 'lachesis-empty-state-subtitle'
    })
  }

  // ============================================================================
  // Chat History Methods
  // ============================================================================

  /**
   * Load list of existing chat logs for sidebar.
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
   * Start a new chat (clears current conversation).
   */
  private startNewChat(): void {
    this.messages = []
    this.currentChatFilename = null
    this.pendingDiffs = []
    this.activeWorkflow = null
    this.renderChatPhase()
  }

  /**
   * Load an existing chat from file.
   */
  private async loadChat(filename: string): Promise<void> {
    const chatLog = await loadChatLog(this.app.vault, this.projectPath, filename)
    if (chatLog) {
      this.messages = chatLog.messages
      this.currentChatFilename = filename
      this.pendingDiffs = []
      this.activeWorkflow = null
      this.renderChatPhase()
    }
  }

  /**
   * Save current chat to file (called after each message).
   */
  private async saveCurrentChat(): Promise<void> {
    if (this.messages.length === 0) return

    const wasNewChat = !this.currentChatFilename

    const result = await saveChatLog(
      this.app.vault,
      this.projectPath,
      this.messages,
      this.currentChatFilename
    )

    if (result.success) {
      // If this was a new chat, update our filename reference
      if (wasNewChat) {
        this.currentChatFilename = result.filename
      }
      // Note: Sidebar refresh is handled by vault event listeners
    }
  }

  /**
   * Render the sidebar with chat history.
   */
  private renderSidebar(container?: HTMLElement): void {
    const parent = container ?? this.sidebarEl
    if (!parent) return

    parent.empty()

    // Sidebar header
    const header = parent.createDiv({ cls: 'lachesis-sidebar-header' })
    header.createSpan({ text: 'Chat History' })

    // New Chat button
    const newChatBtn = parent.createEl('button', {
      text: '+ New Chat',
      cls: 'lachesis-new-chat-button',
    })
    newChatBtn.addEventListener('click', () => this.startNewChat())

    // Chat list container
    this.chatListEl = parent.createDiv({ cls: 'lachesis-chat-list' })

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
   * Render a single chat item in the sidebar.
   */
  private renderChatItem(log: ChatLogMetadata): void {
    if (!this.chatListEl) return

    const isActive = log.filename === this.currentChatFilename
    const item = this.chatListEl.createDiv({
      cls: `lachesis-chat-item ${isActive ? 'active' : ''}`,
    })

    item.createEl('span', { text: log.displayDate, cls: 'lachesis-chat-date' })
    item.createEl('span', { text: log.preview, cls: 'lachesis-chat-preview' })

    item.addEventListener('click', () => {
      if (log.filename !== this.currentChatFilename) {
        this.loadChat(log.filename)
      }
    })
  }

  /**
   * Highlight the current chat in the sidebar.
   */
  private highlightCurrentChat(): void {
    if (!this.chatListEl) return

    const items = this.chatListEl.querySelectorAll('.lachesis-chat-item')
    items.forEach((el, idx) => {
      const isActive = this.chatLogs[idx]?.filename === this.currentChatFilename
      el.toggleClass('active', isActive)
    })
  }

  // ============================================================================
  // Vault Event Listeners (Real-time Sidebar Updates)
  // ============================================================================

  /**
   * Set up vault event listeners to watch for changes in the .ai/logs folder.
   */
  private setupVaultListeners(): void {
    const logsPath = `${this.projectPath}/.ai/logs`

    // Helper to check if a file is in our logs folder
    const isInLogsFolder = (path: string): boolean => {
      return path.startsWith(logsPath + '/') && path.endsWith('.md')
    }

    // On file create
    this.vaultCreateRef = this.app.vault.on('create', async (file) => {
      if (file instanceof TFile && isInLogsFolder(file.path)) {
        await this.loadChatHistory()
        this.renderSidebar()
        this.highlightCurrentChat()
      }
    })

    // On file modify
    this.vaultModifyRef = this.app.vault.on('modify', async (file) => {
      if (file instanceof TFile && isInLogsFolder(file.path)) {
        await this.loadChatHistory()
        this.renderSidebar()
        this.highlightCurrentChat()
      }
    })

    // On file delete
    this.vaultDeleteRef = this.app.vault.on('delete', async (file) => {
      if (file instanceof TFile && isInLogsFolder(file.path)) {
        await this.loadChatHistory()
        this.renderSidebar()
        this.highlightCurrentChat()
      }
    })
  }

  /**
   * Clean up vault event listeners.
   */
  private cleanupVaultListeners(): void {
    if (this.vaultCreateRef) {
      this.app.vault.offref(this.vaultCreateRef)
      this.vaultCreateRef = null
    }
    if (this.vaultModifyRef) {
      this.app.vault.offref(this.vaultModifyRef)
      this.vaultModifyRef = null
    }
    if (this.vaultDeleteRef) {
      this.app.vault.offref(this.vaultDeleteRef)
      this.vaultDeleteRef = null
    }
  }
}
