// Existing Project Modal - Chat interface for continuing work on existing projects

import { App, Modal, Notice, TFile, TFolder, MarkdownRenderer, Component } from 'obsidian'
import * as fs from 'fs'
import * as path from 'path'
import type LachesisPlugin from '../main'
import type { ProjectSnapshot, ExpectedCoreFile } from '../core/project/snapshot'
import { buildProjectSnapshot, formatProjectSnapshotForModel, fetchProjectFileContents, formatFileContentsForModel } from '../core/project/snapshot-builder'
import { getProvider } from '../ai/providers/factory'
import { isProviderAvailable } from '../ai/providers/factory'
import type { AIProvider, ConversationMessage } from '../ai/providers/types'
import { buildSystemPrompt } from '../ai/prompts'
import { getAllWorkflows, getWorkflowDefinition, WORKFLOW_DEFINITIONS } from '../core/workflows/definitions'
import type { WorkflowDefinition, WorkflowName } from '../core/workflows/types'
import { extractDiffBlocks, applyDiff, containsDiffBlocks, type DiffBlock } from '../utils/diff'
import { getTrimmedLogContent, getFilteredLogForTitleEntries, type TrimmedLogResult, type FilteredLogResult } from '../utils/log-parser'
import {
  parsePotentialTasks,
  updateLogWithTaskActions,
  appendToFutureTasksSection,
  type PotentialTask,
  type ParsedPotentialTasks,
  type TaskUpdateAction,
} from '../utils/potential-tasks-parser'
import { DiffViewerModal, type DiffAction, type DiffViewerOptions } from './diff-viewer-modal'
import { PotentialTasksModal, type TaskSelection } from './potential-tasks-modal'
import { listChatLogs, loadChatLog, saveChatLog, type ChatLogMetadata } from '../core/chat'
import { TEMPLATES, type TemplateName } from '../scaffolder/templates'
import { processTemplateForFile } from '../scaffolder/scaffolder'
import { validateOverviewHeadings, fixOverviewHeadings } from '../core/project/template-evaluator'

// ============================================================================
// Types
// ============================================================================

type ModalPhase = 'loading' | 'chat' | 'error'

type ProjectIssue = {
  file: ExpectedCoreFile | '.ai/config.json'
  type: 'missing' | 'template_only' | 'thin' | 'config' | 'headings_invalid'
  message: string
  fixLabel: string
  fixAction: () => Promise<void>
}

// ============================================================================
// Existing Project Modal
// ============================================================================

export class ExistingProjectModal extends Modal {
  private plugin: LachesisPlugin
  private projectPath: string
  private snapshot: ProjectSnapshot
  private provider: AIProvider | null = null
  private renderComponent: Component

  // UI State
  private phase: ModalPhase = 'loading'
  private messages: ConversationMessage[] = []
  private isProcessing = false
  private streamingText = ''
  private activeWorkflow: WorkflowDefinition | null = null
  private focusedFile: ExpectedCoreFile | null = null // File being filled via "Fill with AI"
  private pendingDiffs: DiffBlock[] = []
  private pendingPotentialTasks: PotentialTask[] = []
  private parsedPotentialTasks: ParsedPotentialTasks | null = null
  private lastUsedWorkflowName: WorkflowName | null = null // Track workflow for post-diff processing

  // DOM Elements
  private messagesContainer: HTMLElement | null = null
  private inputEl: HTMLInputElement | null = null
  private statusEl: HTMLElement | null = null

  // Chat History State
  private chatLogs: ChatLogMetadata[] = []
  private currentChatFilename: string | null = null
  private sidebarEl: HTMLElement | null = null
  private chatListEl: HTMLElement | null = null
  private isViewingLoadedChat = false // True when viewing a saved chat (diffs are view-only)

  // Filesystem watcher for real-time updates
  private fsWatcher: fs.FSWatcher | null = null

  // Issues dropdown state
  private issuesDropdown: HTMLElement | null = null
  private isDropdownOpen = false

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
    this.renderComponent = new Component()
  }

  async onOpen() {
    const { contentEl } = this
    contentEl.empty()
    // Style hook: Obsidian sizes modals via the root `.modal` element
    this.modalEl.addClass('lachesis-modal-root')
    contentEl.addClass('lachesis-modal')
    this.renderComponent.load()

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

    // Clean up issues dropdown
    this.closeIssuesDropdown()

    const { contentEl } = this
    contentEl.empty()
    this.renderComponent.unload()
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
    const isReady = this.snapshot.readiness.isReady
    const statusBadge = header.createEl('span', {
      cls: `lachesis-status-badge ${isReady ? 'ready' : 'needs-work'} ${!isReady ? 'clickable' : ''}`,
    })
    statusBadge.setText(isReady ? 'Ready' : 'Needs attention')

    // Add click handler for issues dropdown (only when not ready)
    if (!isReady) {
      statusBadge.addEventListener('click', (e) => {
        e.stopPropagation()
        this.toggleIssuesDropdown(statusBadge)
      })
    }

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

    // For non-streaming messages, check if content contains diff blocks
    if (!isStreaming && containsDiffBlocks(content)) {
      this.renderMessageWithDiffs(messageEl, content)
    } else {
      // Parse hint tags and render them specially
      const hintMatch = content.match(/\{\{hint\}\}([\s\S]*?)\{\{\/hint\}\}/)
      if (hintMatch) {
        const mainContent = content.replace(/\{\{hint\}\}[\s\S]*?\{\{\/hint\}\}/, '').trim()
        if (mainContent) {
          this.renderMarkdown(mainContent, messageEl)
        }

        // Add hint as a separate styled element
        const hintEl = messageEl.createDiv({ cls: 'lachesis-hint' })
        const hintContent = hintMatch[1].trim()
        if (hintContent) {
          this.renderMarkdown(hintContent, hintEl)
        }
      } else {
        if (content) {
          this.renderMarkdown(content, messageEl)
        }
      }
    }

    // Scroll to bottom
    this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight

    return messageEl
  }

  private updateStreamingMessage(content: string) {
    if (!this.messagesContainer) return

    const streamingEl = this.messagesContainer.querySelector('.lachesis-message.streaming')
    if (streamingEl) {
      // Parse hint tags for display (only if fully present)
      const hintMatch = content.match(/\{\{hint\}\}([\s\S]*?)\{\{\/hint\}\}/)
      ;(streamingEl as HTMLElement).empty()
      if (hintMatch) {
        const mainContent = content.replace(/\{\{hint\}\}[\s\S]*?\{\{\/hint\}\}/, '').trim()
        if (mainContent) {
          this.renderMarkdown(mainContent, streamingEl as HTMLElement)
        }
        const hintEl = (streamingEl as HTMLElement).createDiv({ cls: 'lachesis-hint' })
        const hintContent = hintMatch[1].trim()
        if (hintContent) {
          this.renderMarkdown(hintContent, hintEl)
        }
      } else {
        if (content) {
          this.renderMarkdown(content, streamingEl as HTMLElement)
        }
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
        // Re-render with markdown + hint styling
        streamingEl.empty()
        const hintMatch = this.streamingText.match(/\{\{hint\}\}([\s\S]*?)\{\{\/hint\}\}/)
        if (hintMatch) {
          const mainContent = this.streamingText.replace(/\{\{hint\}\}[\s\S]*?\{\{\/hint\}\}/, '').trim()
          if (mainContent) {
            this.renderMarkdown(mainContent, streamingEl)
          }

          const hintEl = streamingEl.createDiv({ cls: 'lachesis-hint' })
          const hintContent = hintMatch[1].trim()
          if (hintContent) {
            this.renderMarkdown(hintContent, hintEl)
          }
        } else if (this.streamingText) {
          this.renderMarkdown(this.streamingText, streamingEl)
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
      this.renderMarkdown(content, container)
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
        const textEl = container.createDiv({ cls: 'lachesis-diff-text' })
        this.renderMarkdown(textBefore, textEl)
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

    // Note: Potential tasks review is now a separate workflow (groom-tasks)
    // The generate-tasks workflow only generates tasks - grooming is done separately

    // Extract text after last diff block
    const lastDiffBlock = diffBlocks[diffBlocks.length - 1]
    const lastDiffMarker = '```diff\n' + lastDiffBlock.rawDiff + '\n```'
    const lastIdx = content.lastIndexOf(lastDiffMarker)
    if (lastIdx >= 0) {
      const textAfter = content.slice(lastIdx + lastDiffMarker.length).trim()
      if (textAfter) {
        const textEl = container.createDiv({ cls: 'lachesis-diff-text' })
        this.renderMarkdown(textAfter, textEl)
      }
    }
  }

  private renderMarkdown(content: string, container: HTMLElement) {
    MarkdownRenderer.render(
      this.app,
      content,
      container,
      '',
      this.renderComponent,
    )
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
      { viewOnly: this.isViewingLoadedChat },
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

  // ============================================================================
  // Potential Tasks Methods
  // ============================================================================

  /**
   * Check if Log.md has potential tasks and render a link if so.
   */
  private async checkForPotentialTasksLink(fileListContainer: HTMLElement): Promise<void> {
    try {
      // Read Log.md content
      const logPath = `${this.projectPath}/Log.md`
      const logFile = this.app.vault.getAbstractFileByPath(logPath)
      if (!logFile || !(logFile instanceof TFile)) return

      const content = await this.app.vault.read(logFile)
      const parsed = parsePotentialTasks(content)

      if (parsed.actionableTaskCount > 0) {
        this.pendingPotentialTasks = parsed.allTasks
        this.parsedPotentialTasks = parsed
        this.renderPotentialTasksLink(fileListContainer, parsed.actionableTaskCount)
      }
    } catch (err) {
      console.error('Failed to check for potential tasks:', err)
    }
  }

  /**
   * Render the "Potential Tasks Generated" link in the diff file list.
   */
  private renderPotentialTasksLink(container: HTMLElement, taskCount: number): void {
    const linkEl = container.createDiv({ cls: 'lachesis-potential-tasks-link' })

    // Icon
    const iconEl = linkEl.createSpan({ cls: 'lachesis-diff-file-icon' })
    iconEl.setText('📋')

    // Link text
    const nameEl = linkEl.createEl('a', {
      text: 'Potential Tasks Generated',
      cls: 'lachesis-diff-file-name',
    })
    nameEl.addEventListener('click', (e) => {
      e.preventDefault()
      this.openPotentialTasksModal()
    })

    // Badge with count
    const badgeEl = linkEl.createSpan({ cls: 'lachesis-potential-tasks-badge' })
    badgeEl.setText(`${taskCount} task${taskCount > 1 ? 's' : ''}`)
  }

  /**
   * Open the potential tasks review modal.
   */
  private openPotentialTasksModal(): void {
    const modal = new PotentialTasksModal(
      this.app,
      this.pendingPotentialTasks,
      this.projectPath,
      (selections, confirmed) => this.handlePotentialTasksAction(selections, confirmed),
    )
    modal.open()
  }

  /**
   * Handle actions from the potential tasks modal.
   */
  private async handlePotentialTasksAction(
    selections: TaskSelection[],
    confirmed: boolean,
  ): Promise<void> {
    if (!confirmed || !this.parsedPotentialTasks) return

    // Group selections by action
    const rejects = selections.filter((s) => s.action === 'reject')
    const moves = selections.filter((s) => s.action === 'move-to-future')
    // 'keep' actions require no file changes

    // Convert to TaskUpdateAction format
    const actions: TaskUpdateAction[] = selections.map((s) => ({
      taskId: s.taskId,
      action: s.action,
    }))

    try {
      // Process Log.md updates if there are any rejections or moves
      if (rejects.length > 0 || moves.length > 0) {
        const logPath = `${this.projectPath}/Log.md`
        const logFile = this.app.vault.getAbstractFileByPath(logPath)

        if (logFile && logFile instanceof TFile) {
          const logContent = await this.app.vault.read(logFile)
          const result = updateLogWithTaskActions(logContent, actions, this.parsedPotentialTasks)
          await this.app.vault.modify(logFile, result.newContent)
        }
      }

      // Process Tasks.md additions if there are any moves
      if (moves.length > 0) {
        const tasksPath = `${this.projectPath}/Tasks.md`
        const tasksFile = this.app.vault.getAbstractFileByPath(tasksPath)

        if (tasksFile && tasksFile instanceof TFile) {
          const tasksContent = await this.app.vault.read(tasksFile)

          // Get task details for moved tasks
          const movedTasks = moves.map((m) => {
            const task = this.pendingPotentialTasks.find((t) => t.id === m.taskId)
            return {
              text: task?.text || '',
              sourceDate: task?.logEntryDate || null,
            }
          })

          const newTasksContent = appendToFutureTasksSection(tasksContent, movedTasks)
          await this.app.vault.modify(tasksFile, newTasksContent)
        }
      }

      // Clear pending tasks and refresh
      this.pendingPotentialTasks = []
      this.parsedPotentialTasks = null
      this.snapshot = await buildProjectSnapshot(this.app.vault, this.projectPath)
    } catch (err) {
      console.error('Failed to apply potential task actions:', err)
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

    // Once user interacts with the chat, it's no longer view-only
    // (new diffs generated in this session should be actionable)
    this.isViewingLoadedChat = false

    // Detect workflow request from user input (if not already set by button click)
    if (!this.activeWorkflow) {
      const detectedWorkflow = this.detectWorkflowFromMessage(message)
      if (detectedWorkflow) {
        // Check if this is a non-AI workflow
        if (!detectedWorkflow.usesAI) {
          // Handle non-AI workflow directly (no AI call needed)
          await this.handleNonAIWorkflow(detectedWorkflow)
          return
        }
        this.activeWorkflow = detectedWorkflow
        this.focusedFile = null  // Clear any active "fill file" mode - workflow takes precedence
      }
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
    let logFilterResult: FilteredLogResult | null = null
    if (this.activeWorkflow) {
      this.updateStatus(`Fetching files for ${this.activeWorkflow.displayName}...`)
      try {
        const fileContents = await fetchProjectFileContents(
          this.app.vault,
          this.projectPath,
          this.activeWorkflow.readFiles,
        )

        // Handle log file processing based on workflow type
        if (fileContents['Log.md']) {
          if (this.activeWorkflow.name === 'title-entries') {
            // For title-entries: ALWAYS filter out already-titled entries
            // This prevents the AI from proposing changes to entries that already have titles
            logFilterResult = getFilteredLogForTitleEntries(fileContents['Log.md'])
            fileContents['Log.md'] = logFilterResult.content
            console.log(`Log filtered for title-entries: ${logFilterResult.includedEntryCount} entries need titles, ${logFilterResult.excludedEntryCount} already have titles`)
          } else if (this.activeWorkflow.name === 'generate-tasks') {
            // For generate-tasks: trim large files but include all entries (need full context)
            logTrimResult = getTrimmedLogContent(fileContents['Log.md'])
            if (logTrimResult.wasTrimmed) {
              fileContents['Log.md'] = logTrimResult.content
              console.log(`Log trimmed: ${logTrimResult.trimSummary}`)
            }
          }
        }

        workflowFileContents = formatFileContentsForModel(fileContents)
      } catch (err) {
        console.error('Failed to fetch workflow files:', err)
      }
    }

    // Fetch file contents if filling a focused file (via "Fill with AI" button)
    let focusedFileContents: string | undefined
    const currentFocusedFile = this.focusedFile // Capture before clearing
    if (currentFocusedFile) {
      this.updateStatus(`Fetching ${currentFocusedFile} and context files...`)
      try {
        // Determine which context files to include
        const filesToFetch: string[] = [currentFocusedFile]

        // Always include Overview.md for project context (unless that's the focused file)
        if (currentFocusedFile !== 'Overview.md') {
          filesToFetch.push('Overview.md')
        }

        // For Tasks.md, also include Roadmap.md for milestone context
        if (currentFocusedFile === 'Tasks.md') {
          filesToFetch.push('Roadmap.md')
        }

        const fileContents = await fetchProjectFileContents(
          this.app.vault,
          this.projectPath,
          filesToFetch,
        )
        focusedFileContents = formatFileContentsForModel(fileContents)
      } catch (err) {
        console.error('Failed to fetch focused file contents:', err)
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
      focusedFile: currentFocusedFile ?? undefined,
      focusedFileContents,
    })

    // Store workflow name for post-diff processing, then clear active workflow
    this.lastUsedWorkflowName = this.activeWorkflow?.name ?? null
    // Only clear focusedFile if a workflow was active (workflow takes precedence over fill mode)
    // Otherwise, keep focusedFile set so diff instructions persist across the conversation
    if (this.activeWorkflow) {
      this.focusedFile = null
    }
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
    const lowerMessage = message.toLowerCase()

    // Check for specific workflow keywords first
    // Title Entries workflow
    if (
      lowerMessage.includes('title entries') ||
      lowerMessage.includes('add titles') ||
      lowerMessage.includes('summarize log') ||
      lowerMessage.includes('title the log')
    ) {
      return getWorkflowDefinition('title-entries')
    }

    // Generate Tasks workflow
    if (
      lowerMessage.includes('generate tasks') ||
      lowerMessage.includes('extract tasks') ||
      lowerMessage.includes('find tasks')
    ) {
      return getWorkflowDefinition('generate-tasks')
    }

    // Groom Tasks workflow
    if (
      lowerMessage.includes('groom tasks') ||
      lowerMessage.includes('review tasks') ||
      lowerMessage.includes('review potential tasks') ||
      lowerMessage.includes('potential tasks') ||
      lowerMessage.includes('process tasks')
    ) {
      return getWorkflowDefinition('groom-tasks')
    }

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
    if (!workflow) return

    // Check if this is a non-AI workflow
    if (!workflow.usesAI) {
      this.handleNonAIWorkflow(workflow)
      return
    }

    // Standard AI workflow handling
    this.activeWorkflow = workflow
    this.focusedFile = null  // Clear any active "fill file" mode - workflow takes precedence
    this.inputEl.value = `Run the ${workflowDisplayName} workflow`
    this.handleUserInput()
  }

  /**
   * Handle workflows that don't require AI processing.
   * These workflows perform local operations immediately.
   */
  private async handleNonAIWorkflow(workflow: WorkflowDefinition): Promise<void> {
    if (workflow.name === 'groom-tasks') {
      await this.handleGroomTasksWorkflow()
    }
    // Future non-AI workflows can be added here
  }

  /**
   * Handle the Groom Tasks workflow.
   * Parses Log.md for existing potential tasks and opens the review modal.
   */
  private async handleGroomTasksWorkflow(): Promise<void> {
    try {
      this.setInputEnabled(false)
      this.updateStatus('Scanning Log.md for potential tasks...')

      // Read Log.md content
      const logPath = `${this.projectPath}/Log.md`
      const logFile = this.app.vault.getAbstractFileByPath(logPath)

      if (!logFile || !(logFile instanceof TFile)) {
        this.updateStatus('Log.md not found')
        this.setInputEnabled(true)
        new Notice('Log.md not found in project')
        return
      }

      const content = await this.app.vault.read(logFile)
      const parsed = parsePotentialTasks(content)

      if (parsed.actionableTaskCount === 0) {
        this.updateStatus('No potential tasks found')
        this.setInputEnabled(true)
        new Notice('No actionable potential tasks found in Log.md. Run "Generate Tasks" first to create some.')
        return
      }

      // Store parsed data for modal callback
      this.pendingPotentialTasks = parsed.allTasks
      this.parsedPotentialTasks = parsed

      // Add a message to the UI indicating what we're doing
      this.addMessageToUI(
        'assistant',
        `Found ${parsed.actionableTaskCount} potential task${parsed.actionableTaskCount > 1 ? 's' : ''} in Log.md. Opening review modal...`,
      )

      // Open the modal directly
      this.openPotentialTasksModal()

      this.updateStatus('Ready')
      this.setInputEnabled(true)
    } catch (err) {
      console.error('Failed to run Groom Tasks workflow:', err)
      this.updateStatus('Error scanning for tasks')
      this.setInputEnabled(true)
      new Notice(`Failed to scan for tasks: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
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
    this.focusedFile = null  // Clear any active "fill file" mode
    this.lastUsedWorkflowName = null
    this.isViewingLoadedChat = false // New chat is not a loaded chat
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
      this.focusedFile = null  // Clear any active "fill file" mode
      this.lastUsedWorkflowName = null
      this.isViewingLoadedChat = true // Mark as viewing saved chat (diffs are view-only)
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
  // Filesystem Watcher (Real-time Sidebar Updates)
  // ============================================================================

  /**
   * Set up filesystem watcher for changes in the .ai/logs folder.
   * Uses Node.js fs.watch instead of Obsidian's vault events to bypass cache.
   */
  private setupVaultListeners(): void {
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
          this.renderSidebar()
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
  private cleanupVaultListeners(): void {
    if (this.fsWatcher) {
      this.fsWatcher.close()
      this.fsWatcher = null
    }
  }

  // ============================================================================
  // Issues Dropdown Methods
  // ============================================================================

  /**
   * Build the list of issues from the snapshot readiness data.
   */
  private buildIssuesList(): ProjectIssue[] {
    const issues: ProjectIssue[] = []

    // Check for config issues first (higher priority)
    if (this.snapshot.health.configIssues.length > 0) {
      const configMissing = !this.snapshot.aiConfig
      issues.push({
        file: '.ai/config.json',
        type: 'config',
        message: configMissing
          ? 'AI config file is missing'
          : 'GitHub repository not configured',
        fixLabel: configMissing ? 'Create Config' : 'Configure',
        fixAction: () => this.fixMissingConfig(),
      })
    }

    for (const fileName of this.snapshot.readiness.prioritizedFiles) {
      const fileEntry = this.snapshot.files[fileName]

      if (!fileEntry.exists) {
        issues.push({
          file: fileName,
          type: 'missing',
          message: `${fileName} does not exist`,
          fixLabel: 'Create File',
          fixAction: () => this.fixMissingFile(fileName),
        })
      } else if (fileEntry.templateStatus === 'template_only') {
        issues.push({
          file: fileName,
          type: 'template_only',
          message: `${fileName} has not been filled in`,
          fixLabel: 'Fill with AI',
          fixAction: () => this.fixTemplateOnlyFile(fileName),
        })
      } else if (fileEntry.templateStatus === 'thin') {
        issues.push({
          file: fileName,
          type: 'thin',
          message: `${fileName} needs more content`,
          fixLabel: 'Expand with AI',
          fixAction: () => this.fixThinFile(fileName),
        })
      }
    }

    // Check Overview.md headings validation (only if file exists and isn't already flagged as missing/template_only)
    const overviewEntry = this.snapshot.files['Overview.md']
    if (overviewEntry?.exists && overviewEntry.templateStatus !== 'missing') {
      // Don't duplicate if Overview.md is already in issues as template_only
      const alreadyHasOverviewIssue = issues.some(
        (i) => i.file === 'Overview.md' && (i.type === 'missing' || i.type === 'template_only')
      )
      if (!alreadyHasOverviewIssue) {
        // Read file synchronously using fs to check headings
        const headingIssue = this.checkOverviewHeadingsSync()
        if (headingIssue) {
          issues.push(headingIssue)
        }
      }
    }

    return issues
  }

  /**
   * Synchronously check Overview.md heading validation using filesystem.
   * Returns an issue if headings are invalid, null otherwise.
   */
  private checkOverviewHeadingsSync(): ProjectIssue | null {
    try {
      const basePath = (this.app.vault.adapter as any).getBasePath() as string
      const overviewPath = path.join(basePath, this.projectPath, 'Overview.md')

      if (!fs.existsSync(overviewPath)) return null

      const content = fs.readFileSync(overviewPath, 'utf-8')
      const validation = validateOverviewHeadings(content)

      if (!validation.isValid) {
        return {
          file: 'Overview.md',
          type: 'headings_invalid',
          message: `Missing ${validation.missingHeadings.length} heading(s)`,
          fixLabel: 'Fix Headings',
          fixAction: () => this.fixInvalidHeadings(),
        }
      }

      return null
    } catch (err) {
      console.warn('Failed to validate Overview.md headings:', err)
      return null
    }
  }

  /**
   * Toggle the issues dropdown visibility.
   */
  private toggleIssuesDropdown(anchorEl: HTMLElement): void {
    if (this.isDropdownOpen) {
      this.closeIssuesDropdown()
    } else {
      this.openIssuesDropdown(anchorEl)
    }
  }

  /**
   * Open the issues dropdown below the status badge.
   */
  private openIssuesDropdown(anchorEl: HTMLElement): void {
    if (this.issuesDropdown) {
      this.closeIssuesDropdown()
    }

    const issues = this.buildIssuesList()
    if (issues.length === 0) return

    // Create dropdown container
    this.issuesDropdown = document.createElement('div')
    this.issuesDropdown.addClass('lachesis-issues-dropdown')

    // Position relative to anchor
    const rect = anchorEl.getBoundingClientRect()
    this.issuesDropdown.style.top = `${rect.bottom + 8}px`
    this.issuesDropdown.style.right = `${window.innerWidth - rect.right}px`

    // Header
    const header = this.issuesDropdown.createDiv({ cls: 'lachesis-issues-header' })
    header.setText(`${issues.length} issue${issues.length > 1 ? 's' : ''} to address`)

    // Issues list
    const listEl = this.issuesDropdown.createDiv({ cls: 'lachesis-issues-list' })

    for (const issue of issues) {
      this.renderIssueItem(listEl, issue)
    }

    // Add to modal
    this.modalEl.appendChild(this.issuesDropdown)
    this.isDropdownOpen = true

    // Close on outside click (delayed to prevent immediate close)
    setTimeout(() => {
      document.addEventListener('click', this.handleOutsideClick)
    }, 0)
  }

  /**
   * Close the issues dropdown.
   */
  private closeIssuesDropdown(): void {
    if (this.issuesDropdown) {
      this.issuesDropdown.remove()
      this.issuesDropdown = null
    }
    this.isDropdownOpen = false
    document.removeEventListener('click', this.handleOutsideClick)
  }

  /**
   * Handle clicks outside the dropdown.
   */
  private handleOutsideClick = (e: MouseEvent): void => {
    if (this.issuesDropdown && !this.issuesDropdown.contains(e.target as Node)) {
      this.closeIssuesDropdown()
    }
  }

  /**
   * Render a single issue item in the dropdown.
   */
  private renderIssueItem(container: HTMLElement, issue: ProjectIssue): void {
    const itemEl = container.createDiv({ cls: `lachesis-issue-item lachesis-issue-${issue.type}` })

    // Icon based on type
    const iconEl = itemEl.createSpan({ cls: 'lachesis-issue-icon' })
    const iconMap: Record<ProjectIssue['type'], string> = {
      missing: '!',
      template_only: '?',
      thin: '~',
      config: '⚙',
      headings_invalid: '☰',
    }
    iconEl.setText(iconMap[issue.type])

    // Issue content
    const contentEl = itemEl.createDiv({ cls: 'lachesis-issue-content' })
    contentEl.createDiv({ cls: 'lachesis-issue-file', text: issue.file })
    contentEl.createDiv({ cls: 'lachesis-issue-message', text: issue.message })

    // Fix button
    const fixBtn = itemEl.createEl('button', {
      text: issue.fixLabel,
      cls: 'lachesis-issue-fix-btn',
    })
    fixBtn.addEventListener('click', async (e) => {
      e.stopPropagation()
      fixBtn.disabled = true
      fixBtn.setText('Working...')
      await issue.fixAction()
    })
  }

  // ============================================================================
  // Fix Action Methods
  // ============================================================================

  /**
   * Map file names to template names.
   */
  private getTemplateName(fileName: ExpectedCoreFile): TemplateName {
    const mapping: Record<ExpectedCoreFile, TemplateName> = {
      'Overview.md': 'overview',
      'Roadmap.md': 'roadmap',
      'Tasks.md': 'tasks',
      'Log.md': 'log',
      'Ideas.md': 'ideas',
      'Archive.md': 'archive',
    }
    return mapping[fileName]
  }

  /**
   * Fix a missing file by creating it from template.
   */
  private async fixMissingFile(fileName: ExpectedCoreFile): Promise<void> {
    try {
      const templateName = this.getTemplateName(fileName)
      const template = TEMPLATES[templateName]
      const filePath = `${this.projectPath}/${fileName}`

      // Process template with basic data
      const projectSlug = this.snapshot.projectName.toLowerCase().replace(/\s+/g, '-')
      const content = processTemplateForFile(template, {
        projectName: this.snapshot.projectName,
        projectSlug,
      })

      await this.app.vault.create(filePath, content)
      new Notice(`Created ${fileName}`)

      await this.refreshAfterFix()
    } catch (err) {
      new Notice(`Failed to create ${fileName}: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  /**
   * Fix a template-only file by initiating an AI chat focused on filling it.
   */
  private async fixTemplateOnlyFile(fileName: ExpectedCoreFile): Promise<void> {
    this.closeIssuesDropdown()

    // Set the focused file so handleUserInput will fetch its contents
    this.focusedFile = fileName

    // Set up the input to trigger a focused conversation
    if (this.inputEl) {
      this.inputEl.value = `Help me fill in ${fileName}. It currently only has template placeholders. Let's work through it section by section.`
      this.handleUserInput()
    }
  }

  /**
   * Fix a thin file by initiating an AI chat to expand it.
   */
  private async fixThinFile(fileName: ExpectedCoreFile): Promise<void> {
    this.closeIssuesDropdown()

    // Set the focused file so handleUserInput will fetch its contents
    this.focusedFile = fileName

    // Set up the input to trigger a focused conversation
    if (this.inputEl) {
      this.inputEl.value = `Help me expand ${fileName}. It has some content but needs more detail. Let's review what's there and add more.`
      this.handleUserInput()
    }
  }

  /**
   * Fix Overview.md headings by adding missing sections with placeholders.
   * This is a structural fix that doesn't require AI.
   */
  private async fixInvalidHeadings(): Promise<void> {
    try {
      const overviewPath = `${this.projectPath}/Overview.md`
      const overviewFile = this.app.vault.getAbstractFileByPath(overviewPath)

      if (!overviewFile || !(overviewFile instanceof TFile)) {
        new Notice('Overview.md not found')
        return
      }

      const content = await this.app.vault.read(overviewFile)
      const fixedContent = fixOverviewHeadings(content, this.snapshot.projectName)

      await this.app.vault.modify(overviewFile, fixedContent)
      new Notice('Fixed Overview.md headings')

      await this.refreshAfterFix()
    } catch (err) {
      new Notice(`Failed to fix headings: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  /**
   * Fix missing or incomplete .ai/config.json by creating it and prompting for GitHub repo.
   */
  private async fixMissingConfig(): Promise<void> {
    this.closeIssuesDropdown()

    try {
      const configFolderPath = `${this.projectPath}/.ai`
      const configFilePath = `${configFolderPath}/config.json`

      // Check if .ai folder exists, create if not
      const folderExists = this.app.vault.getAbstractFileByPath(configFolderPath)
      if (!folderExists) {
        await this.app.vault.createFolder(configFolderPath)
      }

      // Check if config file exists
      const configExists = this.app.vault.getAbstractFileByPath(configFilePath)

      if (!configExists) {
        // Create new config file with empty github_repo
        const aiConfig = {
          $schema: 'https://lachesis.dev/schemas/ai-config.json',
          github_repo: '',
          notes:
            'Add your GitHub repo URL (e.g., "github.com/user/repo") to enable commit analysis for task tracking.',
        }
        await this.app.vault.create(configFilePath, JSON.stringify(aiConfig, null, 2))
        new Notice('Created .ai/config.json')
      }

      // Refresh to update the snapshot
      await this.refreshAfterFix()

      // Now prompt the user to provide GitHub repo via chat
      if (this.inputEl) {
        this.inputEl.value =
          "I've just created the .ai/config.json file. What's the GitHub repository URL for this project?"
        this.handleUserInput()
      }
    } catch (err) {
      new Notice(`Failed to create config: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  /**
   * Refresh snapshot and UI after a fix is applied.
   */
  private async refreshAfterFix(): Promise<void> {
    // Rebuild snapshot
    this.snapshot = await buildProjectSnapshot(this.app.vault, this.projectPath)

    // Update badge
    this.updateStatusBadge()

    // Refresh dropdown if still open
    if (this.isDropdownOpen && this.issuesDropdown) {
      const anchorEl = this.modalEl.querySelector('.lachesis-status-badge') as HTMLElement
      if (anchorEl) {
        this.closeIssuesDropdown()
        if (!this.snapshot.readiness.isReady) {
          this.openIssuesDropdown(anchorEl)
        }
      }
    }
  }

  /**
   * Update the status badge based on current snapshot.
   */
  private updateStatusBadge(): void {
    const badge = this.modalEl.querySelector('.lachesis-status-badge')
    if (badge) {
      badge.removeClass('ready', 'needs-work', 'clickable')
      badge.addClass(this.snapshot.readiness.isReady ? 'ready' : 'needs-work')
      if (!this.snapshot.readiness.isReady) {
        badge.addClass('clickable')
      }
      badge.setText(this.snapshot.readiness.isReady ? 'Ready' : 'Needs attention')
    }
  }
}
