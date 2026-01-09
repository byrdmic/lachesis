// Existing Project Modal - Chat interface for continuing work on existing projects
// This is the orchestrator that coordinates the extracted components.

import { App, Modal, Notice, Component, MarkdownRenderer, TFile } from 'obsidian'
import * as fs from 'fs'
import * as path from 'path'
import type LachesisPlugin from '../main'
import type { ProjectSnapshot, ExpectedCoreFile } from '../core/project/snapshot'
import { buildProjectSnapshot, formatProjectSnapshotForModel, fetchProjectFileContents, formatFileContentsForModel } from '../core/project/snapshot-builder'
import { getProvider } from '../ai/providers/factory'
import { isProviderAvailable } from '../ai/providers/factory'
import type { AIProvider, ConversationMessage } from '../ai/providers/types'
import { buildSystemPrompt } from '../ai/prompts'
import { getAllWorkflows, getWorkflowDefinition, PROJECT_FILES } from '../core/workflows/definitions'
import type { WorkflowDefinition, WorkflowName } from '../core/workflows/types'
import { containsDiffBlocks, type DiffBlock } from '../utils/diff'
import { getTrimmedLogContent, getFilteredLogForTitleEntries, type TrimmedLogResult, type FilteredLogResult } from '../utils/log-parser'
import { listChatLogs, loadChatLog, saveChatLog, type ChatLogMetadata } from '../core/chat'
import { TEMPLATES, type TemplateName } from '../scaffolder/templates'
import { processTemplateForFile } from '../scaffolder/scaffolder'
import {
  validateOverviewHeadings,
  fixOverviewHeadings,
  validateRoadmapHeadings,
  fixRoadmapHeadings,
} from '../core/project/template-evaluator'
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
import { HarvestTasksModal } from './harvest-tasks-modal'
import { IdeasGroomModal } from './ideas-groom-modal'
import { GitLogModal } from './git-log-modal'
import { SyncCommitsModal } from './sync-commits-modal'
import { ArchiveCompletedModal } from './archive-completed-modal'
import {
  parseHarvestResponse,
  parseRoadmapSlices,
  applyHarvestSelections,
  containsHarvestResponse,
  detectMovedHarvestTasks,
  type HarvestedTask,
  type HarvestTaskSelection,
  type RoadmapSlice,
} from '../utils/harvest-tasks-parser'
import {
  parseIdeasGroomResponse,
  applyIdeasGroomSelections,
  containsIdeasGroomResponse,
  detectMovedIdeas,
  type GroomedIdeaTask,
  type GroomedIdeaSelection,
} from '../utils/ideas-groom-parser'
import {
  containsSyncCommitsResponse,
  parseSyncCommitsResponse,
  applyTaskCompletions,
  buildArchiveEntries,
  applyArchiveEntries,
  type CommitMatch,
  type UnmatchedCommit,
  type SyncCommitSelection,
  type GitCommit,
} from '../utils/sync-commits-parser'
import { fetchCommits, formatCommitLog } from '../github'
import {
  extractCompletedTasks,
  groupTasksBySlice,
  containsArchiveCompletedResponse,
  parseArchiveCompletedResponse,
  applyArchiveRemoval,
  buildArchiveEntries as buildArchiveCompletedEntries,
  applyArchiveAdditions,
  getAllTasks,
  type CompletedTask,
  type SliceGroup,
  type ArchiveSelection,
} from '../utils/archive-completed-parser'

// Components
import { ChatSidebar } from './components/chat-sidebar'
import { IssuesPanel, type ProjectIssue } from './components/issues-panel'
import { WorkflowExecutor } from './components/workflow-executor'
import { ChatInterface } from './components/chat-interface'

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
  private renderComponent: Component

  // UI State
  private phase: ModalPhase = 'loading'
  private messages: ConversationMessage[] = []
  private isProcessing = false
  private activeWorkflow: WorkflowDefinition | null = null
  private focusedFile: ExpectedCoreFile | null = null // File being filled via "Fill with AI"
  private pendingDiffs: DiffBlock[] = []
  private pendingPotentialTasks: PotentialTask[] = []
  private parsedPotentialTasks: ParsedPotentialTasks | null = null
  private lastUsedWorkflowName: WorkflowName | null = null // Track workflow for post-diff processing
  private pendingHarvestedTasks: HarvestedTask[] = []
  private pendingGroomedIdeaTasks: GroomedIdeaTask[] = []
  private roadmapSlices: RoadmapSlice[] = []
  private pendingSyncCommitMatches: CommitMatch[] = []
  private pendingUnmatchedCommits: UnmatchedCommit[] = []
  private recentGitCommits: GitCommit[] = []
  private pendingArchiveCompletedTasks: CompletedTask[] = []
  private pendingSliceGroups: SliceGroup[] = []
  private pendingStandaloneTasks: CompletedTask[] = []
  private messagesContainer: HTMLElement | null = null
  private inputEl: HTMLInputElement | null = null
  private statusEl: HTMLElement | null = null
  private streamingText = ''
  private chatLogs: ChatLogMetadata[] = []
  private currentChatFilename: string | null = null
  private chatListEl: HTMLElement | null = null
  private isViewingLoadedChat = false
  private fsWatcher: fs.FSWatcher | null = null
  private issuesDropdown: HTMLDivElement | null = null
  private isDropdownOpen = false

  // Components
  private chatSidebar: ChatSidebar | null = null
  private issuesPanel: IssuesPanel | null = null
  private workflowExecutor: WorkflowExecutor | null = null
  private chatInterface: ChatInterface | null = null

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

    // Initialize components
    await this.initializeComponents()

    // Render chat interface
    this.phase = 'chat'
    this.renderChatPhase()
  }

  onClose() {
    // Clean up components
    this.chatSidebar?.cleanup()
    this.issuesPanel?.cleanup()

    const { contentEl } = this
    contentEl.empty()
    this.renderComponent.unload()
    this.provider = null
    this.messages = []
    this.chatSidebar = null
    this.issuesPanel = null
    this.workflowExecutor = null
    this.chatInterface = null
  }

  // ============================================================================
  // Initialization
  // ============================================================================

  private async initializeComponents(): Promise<void> {
    // Chat Sidebar
    this.chatSidebar = new ChatSidebar(this.app, this.projectPath, {
      onNewChat: () => this.startNewChat(),
      onLoadChat: (filename, messages) => this.applyLoadedChat(filename, messages),
    })
    await this.chatSidebar.initialize()

    // Issues Panel
    this.issuesPanel = new IssuesPanel(
      this.app,
      this.projectPath,
      this.snapshot,
      {
        onStartAIChat: (message, focusedFile) => this.startAIChat(message, focusedFile),
        onSnapshotRefresh: () => this.refreshSnapshot(),
      },
      this.modalEl
    )

    // Workflow Executor
    this.workflowExecutor = new WorkflowExecutor(
      this.app,
      this.projectPath,
      this.snapshot,
      {
        onTriggerAIWorkflow: (workflow, message) => this.triggerAIWorkflow(workflow, message),
        onSetFocusedFile: (file, message) => this.setFocusedFileAndChat(file, message),
        onSnapshotRefresh: () => this.refreshSnapshot(),
        onAddMessage: (role, content) => this.chatInterface?.addMessageToUI(role, content),
        onSetProcessing: (processing, status) => this.setProcessing(processing, status),
      },
      this.plugin.settings.githubToken
    )

    // Chat Interface
    this.chatInterface = new ChatInterface(
      this.app,
      this.projectPath,
      {
        onSubmit: (message) => this.handleUserInput(message),
        onDiffAction: (diffBlock, action) => this.handleDiffAction(diffBlock, action),
        onViewIdeasGroom: (content) => this.workflowExecutor?.openIdeasGroomModalForHistory(content),
        onViewSyncCommits: (content) => this.openSyncCommitsModalForHistory(content),
        onViewArchiveCompleted: (content) => this.openArchiveCompletedModalForHistory(content),
      },
      this.renderComponent
    )
  }

  // ============================================================================
  // Rendering
  // ============================================================================

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
    const sidebarEl = layoutEl.createDiv({ cls: 'lachesis-sidebar' })
    this.chatSidebar?.render(sidebarEl)

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
        this.issuesPanel?.toggleDropdown(statusBadge)
      })
    }

    // Workflow buttons bar
    const workflowBar = mainEl.createDiv({ cls: 'lachesis-workflow-bar' })
    this.workflowExecutor?.renderWorkflowButtons(workflowBar, () => {
      if (!this.isProcessing && this.messages.length === 0) {
        this.generateOpeningMessage()
      }
    })

    // Render chat interface (messages, input, status)
    this.chatInterface?.render(mainEl, this.messages, this.snapshot.projectName, isReady)
  }

  private applyLoadedChat(filename: string, messages: ConversationMessage[]): void {
    this.messages = messages
    this.activeWorkflow = null
    this.focusedFile = null
    this.lastUsedWorkflowName = null
    this.chatSidebar?.setCurrentChatFilename(filename)
    this.chatInterface?.setViewingLoadedChat(true)
    this.renderChatPhase()
  }

  private startAIChat(message: string, focusedFile?: ExpectedCoreFile): void {
    if (focusedFile) {
      this.focusedFile = focusedFile
    }
    // Mark as no longer viewing loaded chat since user is interacting
    this.chatInterface?.setViewingLoadedChat(false)
    this.handleUserInput(message)
  }

  private setFocusedFileAndChat(file: ExpectedCoreFile, message: string): void {
    this.focusedFile = file
    this.handleUserInput(message)
  }

  private triggerAIWorkflow(workflow: WorkflowDefinition, message: string): void {
    this.activeWorkflow = workflow
    this.focusedFile = null // Clear any active "fill file" mode - workflow takes precedence
    this.handleUserInput(message)
  }

  private setProcessing(processing: boolean, status: string): void {
    this.isProcessing = processing
    this.chatInterface?.setInputEnabled(!processing)
    this.chatInterface?.updateStatus(status)
  }

  private setInputEnabled(enabled: boolean): void {
    this.isProcessing = !enabled
    if (this.inputEl) {
      this.inputEl.disabled = !enabled
    }
    this.chatInterface?.setInputEnabled(enabled)
  }

  private updateStatus(text: string): void {
    if (this.statusEl) {
      this.statusEl.setText(text)
    }
    this.chatInterface?.updateStatus(text)
  }

  /**
   * Open the sync commits modal for viewing history.
   * Detects which tasks have already been completed by checking Tasks.md.
   * Allows acting on pending tasks that haven't been completed yet.
   */
  private async openSyncCommitsModalForHistory(content: string): Promise<void> {
    try {
      // We need commits data to parse the response properly
      // If we don't have cached commits, try to fetch them
      if (this.recentGitCommits.length === 0) {
        const githubRepo = this.snapshot.aiConfig?.github_repo
        if (githubRepo) {
          const result = await fetchCommits(githubRepo, {
            token: this.plugin.settings.githubToken || undefined,
            perPage: 50,
          })
          if (result.success && result.data.length > 0) {
            this.recentGitCommits = result.data.map((c) => ({
              sha: c.sha,
              message: c.message,
              date: c.date instanceof Date ? c.date.toISOString() : '',
              url: c.url,
            }))
          }
        }
      }

      let parsed = parseSyncCommitsResponse(content, this.recentGitCommits)

      if (parsed.matches.length === 0) {
        new Notice('Could not parse commit matches from response.')
        return
      }

      // Read Tasks.md to detect which tasks have already been completed
      const tasksPath = `${this.projectPath}/Tasks.md`
      const tasksFile = this.app.vault.getAbstractFileByPath(tasksPath)

      if (tasksFile && tasksFile instanceof TFile) {
        const tasksContent = await this.app.vault.read(tasksFile)
        // Mark matches as already completed if the task is checked in Tasks.md
        parsed.matches = parsed.matches.map((match) => {
          // Check if task is already completed (has [x] in Tasks.md)
          const taskPattern = match.taskText.slice(0, 30).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
          const completedPattern = new RegExp(`^\\s*-\\s*\\[x\\]\\s+${taskPattern}`, 'im')
          if (completedPattern.test(tasksContent)) {
            return { ...match, alreadyCompleted: true }
          }
          return match
        })
      }

      // Store for the action callback
      this.pendingSyncCommitMatches = parsed.matches
      this.pendingUnmatchedCommits = parsed.unmatchedCommits

      // Open modal with viewOnly support
      const modal = new SyncCommitsModal(
        this.app,
        parsed.matches,
        parsed.unmatchedCommits,
        this.projectPath,
        (selections, confirmed) => this.handleSyncCommitsAction(selections, confirmed),
        { viewOnly: true },
      )
      modal.open()
    } catch (err) {
      console.error('Failed to open sync commits modal for history:', err)
      new Notice(`Failed to open matches: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  /**
   * Render a message that contains harvest-tasks JSON response.
   * Shows a summary with a "View Tasks" button that opens the modal.
   */
  private renderMessageWithHarvestTasks(container: HTMLElement, content: string) {
    const tasks = parseHarvestResponse(content)

    if (tasks.length === 0) {
      // Couldn't parse tasks, render as plain text
      this.renderMarkdown(content, container)
      return
    }

    // Render summary message
    const summaryEl = container.createDiv({ cls: 'lachesis-harvest-tasks-summary' })

    const uniqueFiles = new Set(tasks.map((t) => t.sourceFile))
    summaryEl.createEl('p', {
      text: `Found ${tasks.length} potential task${tasks.length === 1 ? '' : 's'} from ${uniqueFiles.size} file${uniqueFiles.size === 1 ? '' : 's'}.`,
    })

    // View Tasks button
    const btnContainer = summaryEl.createDiv({ cls: 'lachesis-harvest-tasks-button-container' })
    const viewBtn = btnContainer.createEl('button', {
      text: 'View Tasks',
      cls: 'lachesis-harvest-tasks-view-btn',
    })
    viewBtn.addEventListener('click', async () => {
      await this.openHarvestTasksModalForHistory(content)
    })
  }

  /**
   * Open the harvest tasks modal for viewing history.
   * Detects which tasks have been moved by checking Tasks.md.
   * Allows acting on pending tasks that haven't been moved yet.
   */
  private async openHarvestTasksModalForHistory(content: string): Promise<void> {
    try {
      let tasks = parseHarvestResponse(content)

      if (tasks.length === 0) {
        new Notice('Could not parse tasks from response.')
        return
      }

      // Read Tasks.md to detect which tasks have been moved
      const tasksPath = `${this.projectPath}/Tasks.md`
      const tasksFile = this.app.vault.getAbstractFileByPath(tasksPath)

      if (tasksFile && tasksFile instanceof TFile) {
        const tasksContent = await this.app.vault.read(tasksFile)
        tasks = detectMovedHarvestTasks(tasks, tasksContent)
      }

      // Read Roadmap.md for slice information
      const roadmapPath = `${this.projectPath}/Roadmap.md`
      const roadmapFile = this.app.vault.getAbstractFileByPath(roadmapPath)
      let roadmapSlices: RoadmapSlice[] = []

      if (roadmapFile && roadmapFile instanceof TFile) {
        const roadmapContent = await this.app.vault.read(roadmapFile)
        roadmapSlices = parseRoadmapSlices(roadmapContent)
      }

      // Store tasks for the action callback
      this.pendingHarvestedTasks = tasks
      this.roadmapSlices = roadmapSlices

      // Open modal in view-only mode but with action callback for pending tasks
      const modal = new HarvestTasksModal(
        this.app,
        tasks,
        this.projectPath,
        roadmapSlices,
        (selections, confirmed) => this.handleHarvestTasksAction(selections, confirmed),
        { viewOnly: true },
      )
      modal.open()
    } catch (err) {
      console.error('Failed to open harvest tasks modal for history:', err)
      new Notice(`Failed to open tasks: ${err instanceof Error ? err.message : 'Unknown error'}`)
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
      this.issuesPanel?.setSnapshot(this.snapshot)
      this.workflowExecutor?.setSnapshot(this.snapshot)
    }
  }

  private async refreshSnapshot(): Promise<ProjectSnapshot> {
    this.snapshot = await buildProjectSnapshot(this.app.vault, this.projectPath)
    this.issuesPanel?.setSnapshot(this.snapshot)
    this.workflowExecutor?.setSnapshot(this.snapshot)
    this.issuesPanel?.updateStatusBadge()
    return this.snapshot
  }

  // ============================================================================
  // AI Operations
  // ============================================================================

  private async fetchRecentCommits(commitCount = 20): Promise<string | undefined> {
    const githubRepo = this.snapshot.aiConfig?.github_repo
    if (!githubRepo) return undefined

    const result = await fetchCommits(githubRepo, {
      token: this.plugin.settings.githubToken || undefined,
      perPage: commitCount,
    })

    if (!result.success) {
      console.warn('Failed to fetch commits:', result.error)
      return undefined
    }

    if (result.data.length === 0) return undefined

    return formatCommitLog(result.data, { includeDate: true, includeDescription: true })
  }

  private async generateOpeningMessage() {
    if (!this.provider || !this.chatInterface) return

    this.setProcessing(true, 'Lachesis is analyzing the project...')

    // Add placeholder for streaming message
    this.chatInterface.addMessageToUI('assistant', '', true)

    // Fetch recent commits in parallel with building the snapshot
    const [snapshotSummary, recentCommits] = await Promise.all([
      Promise.resolve(formatProjectSnapshotForModel(this.snapshot)),
      this.fetchRecentCommits(),
    ])

    const systemPrompt = buildSystemPrompt({
      sessionType: 'existing',
      projectName: this.snapshot.projectName,
      isFirstMessage: true,
      snapshotSummary,
      recentCommits,
    })

    try {
      const result = await this.provider.streamText(
        systemPrompt,
        [],
        (partial) => {
          this.chatInterface?.updateStreamingMessage(partial)
        },
      )

      this.chatInterface.finalizeStreamingMessage()

      if (result.success && result.content) {
        this.messages.push({
          role: 'assistant',
          content: result.content,
          timestamp: new Date().toISOString(),
        })
        await this.chatSidebar?.saveChat(this.messages)
        this.chatSidebar?.highlightCurrentChat()
      }

      this.setProcessing(false, 'Your turn')
      this.chatInterface.focusInput()
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Failed to generate opening message'
      this.chatInterface.finalizeStreamingMessage()
      this.chatInterface.updateStatus(`Error: ${error}`)
      this.setProcessing(false, `Error: ${error}`)
    }
  }

  private async handleUserInput(message: string) {
    if (!this.provider || !this.chatInterface) return

    // Once user interacts with the chat, it's no longer view-only
    this.chatInterface.setViewingLoadedChat(false)

    // Detect workflow request from user input (if not already set by button click)
    if (!this.activeWorkflow) {
      const detectedWorkflow = this.workflowExecutor?.detectWorkflowFromMessage(message)
      if (detectedWorkflow) {
        // Check if this is a non-AI workflow
        if (!detectedWorkflow.usesAI) {
          // Handle non-AI workflow directly (no AI call needed)
          await this.workflowExecutor?.handleNonAIWorkflow(detectedWorkflow)
          return
        }
        this.activeWorkflow = detectedWorkflow
        this.focusedFile = null // Clear any active "fill file" mode - workflow takes precedence
      }
    }

    // Add user message
    const userMessage: ConversationMessage = {
      role: 'user',
      content: message,
      timestamp: new Date().toISOString(),
    }
    this.messages.push(userMessage)
    this.chatInterface.addMessageToUI('user', message)

    // Save after user message
    await this.chatSidebar?.saveChat(this.messages)
    this.chatSidebar?.highlightCurrentChat()

    // Generate response
    this.setProcessing(true, 'Lachesis is thinking...')

    // Fetch file contents if a workflow is active
    let workflowFileContents: string | undefined
    let logTrimResult: TrimmedLogResult | null = null
    let logFilterResult: FilteredLogResult | null = null
    if (this.activeWorkflow) {
      this.chatInterface.updateStatus(`Fetching files for ${this.activeWorkflow.displayName}...`)
      try {
        const fileContents = await fetchProjectFileContents(
          this.app.vault,
          this.projectPath,
          this.activeWorkflow.readFiles,
        )

        // Handle log file processing based on workflow type
        if (fileContents['Log.md']) {
          if (this.activeWorkflow.name === 'title-entries') {
            logFilterResult = getFilteredLogForTitleEntries(fileContents['Log.md'])
            fileContents['Log.md'] = logFilterResult.content
            console.log(`Log filtered for title-entries: ${logFilterResult.includedEntryCount} entries need titles, ${logFilterResult.excludedEntryCount} already have titles`)
          } else if (this.activeWorkflow.name === 'generate-tasks') {
            logTrimResult = getTrimmedLogContent(fileContents['Log.md'])
            if (logTrimResult.wasTrimmed) {
              fileContents['Log.md'] = logTrimResult.content
              console.log(`Log trimmed: ${logTrimResult.trimSummary}`)
            }
          }
        }

        // For sync-commits: fetch recent commits and include them in the file contents
        if (this.activeWorkflow.name === 'sync-commits') {
          const githubRepo = this.snapshot.aiConfig?.github_repo
          if (githubRepo) {
            this.updateStatus('Fetching recent commits...')
            const result = await fetchCommits(githubRepo, {
              token: this.plugin.settings.githubToken || undefined,
              perPage: 50, // Get more commits for better matching
            })

            if (result.success && result.data.length > 0) {
              // Store commits for later parsing
              // CommitLogEntry has: sha, shortSha, message, author, authorEmail, date (Date), url
              this.recentGitCommits = result.data.map((c) => ({
                sha: c.sha,
                message: c.message,
                date: c.date instanceof Date ? c.date.toISOString() : '',
                url: c.url,
              }))

              // Format commits for AI analysis
              const commitsSection = this.recentGitCommits.map((c) => {
                const date = c.date ? new Date(c.date).toISOString().split('T')[0] : 'unknown'
                return `COMMIT ${c.sha} (${date}):\n${c.message}`
              }).join('\n\n---\n\n')

              fileContents['RECENT_COMMITS'] = commitsSection
              console.log(`Fetched ${this.recentGitCommits.length} commits for sync-commits workflow`)
            } else if (!result.success) {
              console.warn('Failed to fetch commits:', result.error)
              this.recentGitCommits = []
            } else {
              console.warn('No commits found')
              this.recentGitCommits = []
            }
          } else {
            console.warn('No GitHub repo configured for sync-commits workflow')
            this.recentGitCommits = []
          }
        }

        workflowFileContents = formatFileContentsForModel(fileContents)
      } catch (err) {
        console.error('Failed to fetch workflow files:', err)
      }
    }

    // Fetch file contents - always include all core files for full project context
    let focusedFileContents: string | undefined
    const currentFocusedFile = this.focusedFile

    // Always fetch all core files so AI has full context for any request
    const allCoreFiles = Object.values(PROJECT_FILES)
    const filesToFetch: string[] = currentFocusedFile
      ? [currentFocusedFile, ...allCoreFiles.filter(f => f !== currentFocusedFile)]
      : allCoreFiles

    this.chatInterface.updateStatus(currentFocusedFile
      ? `Fetching ${currentFocusedFile} and context files...`
      : 'Fetching project files...')

    try {
      const fileContents = await fetchProjectFileContents(
        this.app.vault,
        this.projectPath,
        filesToFetch,
      )
      focusedFileContents = formatFileContentsForModel(fileContents)
    } catch (err) {
      console.error('Failed to fetch file contents:', err)
    }

    this.chatInterface.updateStatus('Lachesis is thinking...')

    // Set active workflow on chat interface so it knows how to render the response
    // (e.g., archive-completed should skip diffs and show a button instead)
    if (this.activeWorkflow) {
      this.chatInterface.setActiveWorkflow(this.activeWorkflow.name)
    }

    this.chatInterface.addMessageToUI('assistant', '', true)

    // Fetch recent commits for context
    const recentCommits = await this.fetchRecentCommits()

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
      recentCommits,
    })

    // Store workflow name for post-diff processing, then clear active workflow
    this.lastUsedWorkflowName = this.activeWorkflow?.name ?? null
    // Only clear focusedFile if a workflow was active (workflow takes precedence over fill mode)
    if (this.activeWorkflow) {
      this.focusedFile = null
    }
    this.activeWorkflow = null

    try {
      const result = await this.provider.streamText(
        systemPrompt,
        this.messages,
        (partial) => {
          this.chatInterface?.updateStreamingMessage(partial)
        },
      )

      this.chatInterface.finalizeStreamingMessage()

      if (result.success && result.content) {
        // Check if this was a harvest-tasks workflow - handle specially
        if (this.lastUsedWorkflowName === 'harvest-tasks') {
          await this.workflowExecutor?.handleHarvestTasksResponse(result.content)
        }

        // Check if this was an ideas-groom workflow - handle specially
        if (this.lastUsedWorkflowName === 'ideas-groom') {
          await this.workflowExecutor?.handleIdeasGroomResponse(result.content)
        }

        // Check if this was a sync-commits workflow - handle specially
        if (this.lastUsedWorkflowName === 'sync-commits') {
          await this.handleSyncCommitsResponse(result.content)
        }

        // Check if this was an archive-completed workflow - handle specially
        if (this.lastUsedWorkflowName === 'archive-completed') {
          await this.handleArchiveCompletedResponse(result.content)
        }

        this.messages.push({
          role: 'assistant',
          content: result.content,
          timestamp: new Date().toISOString(),
        })
        await this.chatSidebar?.saveChat(this.messages)
        this.chatSidebar?.highlightCurrentChat()
      }

      this.setProcessing(false, 'Your turn')
      this.chatInterface.focusInput()
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Failed to generate response'
      this.chatInterface?.finalizeStreamingMessage()
      this.chatInterface?.updateStatus(`Error: ${error}`)
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

    // Harvest Tasks workflow
    if (
      lowerMessage.includes('harvest tasks') ||
      lowerMessage.includes('find new tasks') ||
      lowerMessage.includes('discover tasks') ||
      lowerMessage.includes('suggest tasks')
    ) {
      return getWorkflowDefinition('harvest-tasks')
    }

    // Ideas Groom workflow
    if (
      lowerMessage.includes('groom ideas') ||
      lowerMessage.includes('ideas groom') ||
      lowerMessage.includes('extract tasks from ideas') ||
      lowerMessage.includes('ideas to tasks')
    ) {
      return getWorkflowDefinition('ideas-groom')
    }

    // Sync Commits workflow
    if (
      lowerMessage.includes('sync commits') ||
      lowerMessage.includes('sync tasks') ||
      lowerMessage.includes('sync from git') ||
      lowerMessage.includes('update from git') ||
      lowerMessage.includes('update from commits') ||
      lowerMessage.includes('mark completed from git')
    ) {
      return getWorkflowDefinition('sync-commits')
    }

    // Archive Completed workflow
    if (
      lowerMessage.includes('archive completed') ||
      lowerMessage.includes('archive tasks') ||
      lowerMessage.includes('move completed') ||
      lowerMessage.includes('clean up tasks') ||
      lowerMessage.includes('archive done')
    ) {
      return getWorkflowDefinition('archive-completed')
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

  // ============================================================================
  // Harvest Tasks Workflow Methods
  // ============================================================================

  /**
   * Handle the AI response from the harvest-tasks workflow.
   * Parses the JSON response and opens the review modal.
   */
  private async handleHarvestTasksResponse(content: string): Promise<void> {
    try {
      // Parse the AI response as harvested tasks
      const harvestedTasks = parseHarvestResponse(content)

      if (harvestedTasks.length === 0) {
        new Notice('No new tasks found to harvest.')
        return
      }

      // Read Roadmap.md to get available slices for linking
      const roadmapPath = `${this.projectPath}/Roadmap.md`
      const roadmapFile = this.app.vault.getAbstractFileByPath(roadmapPath)

      if (roadmapFile && roadmapFile instanceof TFile) {
        const roadmapContent = await this.app.vault.read(roadmapFile)
        this.roadmapSlices = parseRoadmapSlices(roadmapContent)
      } else {
        // No roadmap file - slices will be empty but we can still place tasks
        this.roadmapSlices = []
      }

      this.pendingHarvestedTasks = harvestedTasks

      // Open the harvest tasks modal
      this.openHarvestTasksModal()
    } catch (err) {
      console.error('Failed to process harvest tasks response:', err)
      new Notice(`Failed to process tasks: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  /**
   * Open the harvest tasks review modal.
   */
  private openHarvestTasksModal(): void {
    const modal = new HarvestTasksModal(
      this.app,
      this.pendingHarvestedTasks,
      this.projectPath,
      this.roadmapSlices,
      (selections, confirmed) => this.handleHarvestTasksAction(selections, confirmed),
    )
    modal.open()
  }

  /**
   * Handle actions from the harvest tasks modal.
   */
  private async handleHarvestTasksAction(
    selections: HarvestTaskSelection[],
    confirmed: boolean,
  ): Promise<void> {
    if (!confirmed) return

    // Filter out discarded tasks
    const tasksToApply = selections.filter((s) => s.destination !== 'discard')

    if (tasksToApply.length === 0) {
      new Notice('No tasks selected to add.')
      return
    }

    try {
      // Read current Tasks.md content
      const tasksPath = `${this.projectPath}/Tasks.md`
      const tasksFile = this.app.vault.getAbstractFileByPath(tasksPath)

      if (!tasksFile || !(tasksFile instanceof TFile)) {
        new Notice('Tasks.md not found')
        return
      }

      const tasksContent = await this.app.vault.read(tasksFile)

      // Apply the selections to Tasks.md
      const newContent = applyHarvestSelections(
        tasksContent,
        tasksToApply,
        this.pendingHarvestedTasks,
      )

      await this.app.vault.modify(tasksFile, newContent)

      new Notice(`Added ${tasksToApply.length} task${tasksToApply.length > 1 ? 's' : ''} to Tasks.md`)

      // Clear pending state and refresh snapshot
      this.pendingHarvestedTasks = []
      this.roadmapSlices = []
      this.snapshot = await buildProjectSnapshot(this.app.vault, this.projectPath)
    } catch (err) {
      console.error('Failed to apply harvest task selections:', err)
      new Notice(`Failed to add tasks: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  // ============================================================================
  // Ideas Groom Workflow Methods
  // ============================================================================

  /**
   * Handle the AI response from the ideas-groom workflow.
   * Parses the JSON response and opens the review modal.
   */
  private async handleIdeasGroomResponse(content: string): Promise<void> {
    try {
      // Parse the AI response as groomed idea tasks
      const groomedTasks = parseIdeasGroomResponse(content)

      if (groomedTasks.length === 0) {
        new Notice('No actionable ideas found to convert to tasks.')
        return
      }

      // Read Roadmap.md to get available slices for linking
      const roadmapPath = `${this.projectPath}/Roadmap.md`
      const roadmapFile = this.app.vault.getAbstractFileByPath(roadmapPath)

      if (roadmapFile && roadmapFile instanceof TFile) {
        const roadmapContent = await this.app.vault.read(roadmapFile)
        this.roadmapSlices = parseRoadmapSlices(roadmapContent)
      } else {
        // No roadmap file - slices will be empty but we can still place tasks
        this.roadmapSlices = []
      }

      this.pendingGroomedIdeaTasks = groomedTasks

      // Open the ideas groom modal
      this.openIdeasGroomModal()
    } catch (err) {
      console.error('Failed to process ideas groom response:', err)
      new Notice(`Failed to process ideas: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  /**
   * Open the ideas groom review modal.
   */
  private openIdeasGroomModal(): void {
    const modal = new IdeasGroomModal(
      this.app,
      this.pendingGroomedIdeaTasks,
      this.projectPath,
      this.roadmapSlices,
      (selections, confirmed) => this.handleIdeasGroomAction(selections, confirmed),
    )
    modal.open()
  }

  /**
   * Handle actions from the ideas groom modal.
   */
  private async handleIdeasGroomAction(
    selections: GroomedIdeaSelection[],
    confirmed: boolean,
  ): Promise<void> {
    if (!confirmed) return

    // Filter out discarded tasks
    const tasksToApply = selections.filter((s) => s.destination !== 'discard')

    if (tasksToApply.length === 0) {
      new Notice('No tasks selected to add.')
      return
    }

    try {
      // Read current Tasks.md content
      const tasksPath = `${this.projectPath}/Tasks.md`
      const tasksFile = this.app.vault.getAbstractFileByPath(tasksPath)

      if (!tasksFile || !(tasksFile instanceof TFile)) {
        new Notice('Tasks.md not found')
        return
      }

      const tasksContent = await this.app.vault.read(tasksFile)

      // Apply the selections to Tasks.md
      const newContent = applyIdeasGroomSelections(
        tasksContent,
        tasksToApply,
        this.pendingGroomedIdeaTasks,
      )

      await this.app.vault.modify(tasksFile, newContent)

      new Notice(`Added ${tasksToApply.length} task${tasksToApply.length > 1 ? 's' : ''} to Tasks.md`)

      // Clear pending state and refresh snapshot
      this.pendingGroomedIdeaTasks = []
      this.roadmapSlices = []
      this.snapshot = await buildProjectSnapshot(this.app.vault, this.projectPath)
    } catch (err) {
      console.error('Failed to apply ideas groom task selections:', err)
      new Notice(`Failed to add tasks: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  // ============================================================================
  // Sync Commits Workflow Methods
  // ============================================================================

  /**
   * Handle the AI response from the sync-commits workflow.
   * Parses the JSON response and opens the review modal.
   */
  private async handleSyncCommitsResponse(content: string): Promise<void> {
    try {
      // Parse the AI response using stored commits for lookup
      const parsed = parseSyncCommitsResponse(content, this.recentGitCommits)

      if (parsed.matches.length === 0) {
        new Notice('No commits matched any unchecked tasks.')
        return
      }

      this.pendingSyncCommitMatches = parsed.matches
      this.pendingUnmatchedCommits = parsed.unmatchedCommits

      // Open the sync commits modal
      this.openSyncCommitsModal()
    } catch (err) {
      console.error('Failed to process sync commits response:', err)
      new Notice(`Failed to process commits: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  /**
   * Open the sync commits review modal.
   */
  private openSyncCommitsModal(): void {
    const modal = new SyncCommitsModal(
      this.app,
      this.pendingSyncCommitMatches,
      this.pendingUnmatchedCommits,
      this.projectPath,
      (selections, confirmed) => this.handleSyncCommitsAction(selections, confirmed),
    )
    modal.open()
  }

  /**
   * Handle actions from the sync commits modal.
   */
  private async handleSyncCommitsAction(
    selections: SyncCommitSelection[],
    confirmed: boolean,
  ): Promise<void> {
    if (!confirmed) return

    // Filter out skipped tasks
    const actionsToApply = selections.filter((s) => s.action !== 'skip')

    if (actionsToApply.length === 0) {
      new Notice('No changes to apply.')
      return
    }

    try {
      // Read current Tasks.md content
      const tasksPath = `${this.projectPath}/Tasks.md`
      const tasksFile = this.app.vault.getAbstractFileByPath(tasksPath)

      if (!tasksFile || !(tasksFile instanceof TFile)) {
        new Notice('Tasks.md not found')
        return
      }

      let tasksContent = await this.app.vault.read(tasksFile)

      // Apply task completions to Tasks.md
      tasksContent = applyTaskCompletions(
        tasksContent,
        actionsToApply,
        this.pendingSyncCommitMatches,
      )

      await this.app.vault.modify(tasksFile, tasksContent)

      // Build and apply archive entries if any tasks are being archived
      const archiveSelections = actionsToApply.filter((s) => s.action === 'mark-archive')
      if (archiveSelections.length > 0) {
        const archivePath = `${this.projectPath}/Archive.md`
        const archiveFile = this.app.vault.getAbstractFileByPath(archivePath)

        if (archiveFile && archiveFile instanceof TFile) {
          const archiveContent = await this.app.vault.read(archiveFile)
          const archiveEntries = buildArchiveEntries(archiveSelections, this.pendingSyncCommitMatches)
          const newArchiveContent = applyArchiveEntries(archiveContent, archiveEntries)
          await this.app.vault.modify(archiveFile, newArchiveContent)
        }
      }

      const completedCount = actionsToApply.filter((s) => s.action === 'mark-complete').length
      const archivedCount = archiveSelections.length
      const parts: string[] = []
      if (completedCount > 0) parts.push(`${completedCount} marked complete`)
      if (archivedCount > 0) parts.push(`${archivedCount} archived`)
      new Notice(`Tasks updated: ${parts.join(', ')}`)

      // Clear pending state and refresh snapshot
      this.pendingSyncCommitMatches = []
      this.pendingUnmatchedCommits = []
      this.recentGitCommits = []
      this.snapshot = await buildProjectSnapshot(this.app.vault, this.projectPath)
    } catch (err) {
      console.error('Failed to apply sync commits selections:', err)
      new Notice(`Failed to update tasks: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  // ============================================================================
  // Archive Completed Workflow Methods
  // ============================================================================

  /**
   * Handle the AI response from archive-completed workflow.
   * Parses completed tasks locally and groups them, then opens review modal.
   */
  private async handleArchiveCompletedResponse(content: string): Promise<void> {
    try {
      // First, extract completed tasks locally from Tasks.md
      const tasksPath = `${this.projectPath}/Tasks.md`
      const tasksFile = this.app.vault.getAbstractFileByPath(tasksPath)

      if (!tasksFile || !(tasksFile instanceof TFile)) {
        new Notice('Tasks.md not found')
        return
      }

      const tasksContent = await this.app.vault.read(tasksFile)
      const completedTasks = extractCompletedTasks(tasksContent)

      if (completedTasks.length === 0) {
        new Notice('No completed tasks found to archive.')
        return
      }

      // Try to parse AI response for enriched data (summaries, etc.)
      let result: { sliceGroups: SliceGroup[]; standaloneTasks: CompletedTask[] }

      if (containsArchiveCompletedResponse(content)) {
        // Use AI-enriched parsing
        const parsed = parseArchiveCompletedResponse(content, completedTasks)
        result = {
          sliceGroups: parsed.sliceGroups,
          standaloneTasks: parsed.standaloneTasks,
        }
      } else {
        // Fall back to local grouping
        result = groupTasksBySlice(completedTasks)
      }

      this.pendingArchiveCompletedTasks = completedTasks
      this.pendingSliceGroups = result.sliceGroups
      this.pendingStandaloneTasks = result.standaloneTasks

      // Open the archive completed modal
      this.openArchiveCompletedModal()
    } catch (err) {
      console.error('Failed to process archive completed response:', err)
      new Notice(`Failed to process completed tasks: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  /**
   * Open the archive completed review modal.
   */
  private openArchiveCompletedModal(): void {
    const modal = new ArchiveCompletedModal(
      this.app,
      this.pendingSliceGroups,
      this.pendingStandaloneTasks,
      this.projectPath,
      (selections, confirmed) => this.handleArchiveCompletedAction(selections, confirmed),
    )
    modal.open()
  }

  /**
   * Handle actions from the archive completed modal.
   */
  private async handleArchiveCompletedAction(
    selections: ArchiveSelection[],
    confirmed: boolean,
  ): Promise<void> {
    if (!confirmed) return

    // Filter to only archive actions
    const archiveSelections = selections.filter((s) => s.action === 'archive')

    if (archiveSelections.length === 0) {
      new Notice('No tasks selected for archiving.')
      return
    }

    try {
      // Read current Tasks.md content
      const tasksPath = `${this.projectPath}/Tasks.md`
      const tasksFile = this.app.vault.getAbstractFileByPath(tasksPath)

      if (!tasksFile || !(tasksFile instanceof TFile)) {
        new Notice('Tasks.md not found')
        return
      }

      let tasksContent = await this.app.vault.read(tasksFile)

      // Get all tasks for the removal function
      const allTasks = getAllTasks(this.pendingSliceGroups, this.pendingStandaloneTasks)

      // Remove archived tasks from Tasks.md
      tasksContent = applyArchiveRemoval(tasksContent, archiveSelections, allTasks)
      await this.app.vault.modify(tasksFile, tasksContent)

      // Build and apply archive entries
      const archivePath = `${this.projectPath}/Archive.md`
      const archiveFile = this.app.vault.getAbstractFileByPath(archivePath)

      if (archiveFile && archiveFile instanceof TFile) {
        const archiveContent = await this.app.vault.read(archiveFile)
        const archiveEntries = buildArchiveCompletedEntries(
          archiveSelections,
          this.pendingSliceGroups,
          this.pendingStandaloneTasks,
        )
        const newArchiveContent = applyArchiveAdditions(archiveContent, archiveEntries)
        await this.app.vault.modify(archiveFile, newArchiveContent)
      }

      new Notice(`Archived ${archiveSelections.length} task${archiveSelections.length === 1 ? '' : 's'}`)

      // Clear pending state and refresh snapshot
      this.pendingArchiveCompletedTasks = []
      this.pendingSliceGroups = []
      this.pendingStandaloneTasks = []
      this.snapshot = await buildProjectSnapshot(this.app.vault, this.projectPath)
    } catch (err) {
      console.error('Failed to apply archive selections:', err)
      new Notice(`Failed to archive tasks: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  /**
   * Open the archive completed modal for viewing from chat history.
   * Re-parses Tasks.md to detect which tasks have already been archived.
   */
  private async openArchiveCompletedModalForHistory(content: string): Promise<void> {
    try {
      // Read current Tasks.md to get fresh completed tasks
      const tasksPath = `${this.projectPath}/Tasks.md`
      const tasksFile = this.app.vault.getAbstractFileByPath(tasksPath)

      if (!tasksFile || !(tasksFile instanceof TFile)) {
        new Notice('Tasks.md not found')
        return
      }

      const tasksContent = await this.app.vault.read(tasksFile)
      const completedTasks = extractCompletedTasks(tasksContent)

      if (completedTasks.length === 0) {
        new Notice('No completed tasks found. They may have already been archived.')
        return
      }

      // Try to parse AI response for enriched data (summaries, etc.)
      let result: { sliceGroups: SliceGroup[]; standaloneTasks: CompletedTask[] }

      if (containsArchiveCompletedResponse(content)) {
        // Use AI-enriched parsing
        const parsed = parseArchiveCompletedResponse(content, completedTasks)
        result = {
          sliceGroups: parsed.sliceGroups,
          standaloneTasks: parsed.standaloneTasks,
        }
      } else {
        // Fall back to local grouping
        result = groupTasksBySlice(completedTasks)
      }

      // Store for the action callback
      this.pendingArchiveCompletedTasks = completedTasks
      this.pendingSliceGroups = result.sliceGroups
      this.pendingStandaloneTasks = result.standaloneTasks

      // Open modal - viewOnly mode allows actions but shows it's from history
      const modal = new ArchiveCompletedModal(
        this.app,
        result.sliceGroups,
        result.standaloneTasks,
        this.projectPath,
        (selections, confirmed) => this.handleArchiveCompletedAction(selections, confirmed),
      )
      modal.open()
    } catch (err) {
      console.error('Failed to open archive completed modal for history:', err)
      new Notice(`Failed to open tasks: ${err instanceof Error ? err.message : 'Unknown error'}`)
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
      // Note: Sidebar refresh is handled by ChatSidebar component
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

    // Check Roadmap.md headings validation (only if file exists and isn't already flagged as missing/template_only)
    const roadmapEntry = this.snapshot.files['Roadmap.md']
    if (roadmapEntry?.exists && roadmapEntry.templateStatus !== 'missing') {
      // Don't duplicate if Roadmap.md is already in issues as template_only
      const alreadyHasRoadmapIssue = issues.some(
        (i) => i.file === 'Roadmap.md' && (i.type === 'missing' || i.type === 'template_only')
      )
      if (!alreadyHasRoadmapIssue) {
        // Read file synchronously using fs to check headings
        const headingIssue = this.checkRoadmapHeadingsSync()
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
        // Format the missing headings as a readable list
        const missingList = validation.missingHeadings
          .map(h => h.replace(/^##+ /, ''))  // Remove markdown heading markers for display
          .join(', ')

        return {
          file: 'Overview.md',
          type: 'headings_invalid',
          message: `Missing ${validation.missingHeadings.length} heading(s)`,
          details: `Missing: ${missingList}`,
          fixLabel: 'Add Missing (AI)',
          fixAction: () => this.addMissingHeadingsWithAI('Overview.md', validation.missingHeadings),
          secondaryFixLabel: 'Reformat File',
          secondaryFixAction: () => this.fixInvalidHeadings(),
        }
      }

      return null
    } catch (err) {
      console.warn('Failed to validate Overview.md headings:', err)
      return null
    }
  }

  /**
   * Synchronously check Roadmap.md heading validation using filesystem.
   * Returns an issue if headings are invalid, null otherwise.
   */
  private checkRoadmapHeadingsSync(): ProjectIssue | null {
    try {
      const basePath = (this.app.vault.adapter as any).getBasePath() as string
      const roadmapPath = path.join(basePath, this.projectPath, 'Roadmap.md')

      if (!fs.existsSync(roadmapPath)) return null

      const content = fs.readFileSync(roadmapPath, 'utf-8')
      const validation = validateRoadmapHeadings(content)

      if (!validation.isValid) {
        // Format the missing headings as a readable list
        const missingList = validation.missingHeadings
          .map(h => h.replace(/^##+ /, ''))  // Remove markdown heading markers for display
          .join(', ')

        return {
          file: 'Roadmap.md',
          type: 'headings_invalid',
          message: `Missing ${validation.missingHeadings.length} heading(s)`,
          details: `Missing: ${missingList}`,
          fixLabel: 'Add Missing (AI)',
          fixAction: () => this.addMissingHeadingsWithAI('Roadmap.md', validation.missingHeadings),
          secondaryFixLabel: 'Reformat File',
          secondaryFixAction: () => this.fixRoadmapInvalidHeadings(),
        }
      }

      return null
    } catch (err) {
      console.warn('Failed to validate Roadmap.md headings:', err)
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

    // Details (e.g., list of missing headings)
    if (issue.details) {
      contentEl.createDiv({ cls: 'lachesis-issue-details', text: issue.details })
    }

    // Button container for multiple actions
    const buttonContainer = itemEl.createDiv({ cls: 'lachesis-issue-buttons' })

    // Primary fix button
    const fixBtn = buttonContainer.createEl('button', {
      text: issue.fixLabel,
      cls: 'lachesis-issue-fix-btn',
    })
    fixBtn.addEventListener('click', async (e) => {
      e.stopPropagation()
      fixBtn.disabled = true
      fixBtn.setText('Working...')
      await issue.fixAction()
    })

    // Secondary fix button (if available)
    if (issue.secondaryFixLabel && issue.secondaryFixAction) {
      const secondaryBtn = buttonContainer.createEl('button', {
        text: issue.secondaryFixLabel,
        cls: 'lachesis-issue-fix-btn lachesis-issue-fix-btn-secondary',
      })
      secondaryBtn.addEventListener('click', async (e) => {
        e.stopPropagation()
        secondaryBtn.disabled = true
        secondaryBtn.setText('Working...')
        await issue.secondaryFixAction!()
      })
    }
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

    // Trigger a focused conversation
    this.handleUserInput(`Help me fill in ${fileName}. It currently only has template placeholders. Let's work through it section by section.`)
  }

  /**
   * Fix a thin file by initiating an AI chat to expand it.
   */
  private async fixThinFile(fileName: ExpectedCoreFile): Promise<void> {
    this.closeIssuesDropdown()

    // Set the focused file so handleUserInput will fetch its contents
    this.focusedFile = fileName

    // Trigger a focused conversation
    this.handleUserInput(`Help me expand ${fileName}. It has some content but needs more detail. Let's review what's there and add more.`)
  }

  /**
   * Add missing headings to a file using AI to propose targeted diffs.
   * This allows the user to review and accept/reject each proposed change.
   */
  private async addMissingHeadingsWithAI(
    fileName: ExpectedCoreFile,
    missingHeadings: string[]
  ): Promise<void> {
    this.closeIssuesDropdown()

    // Set the focused file so handleUserInput will fetch its contents
    this.focusedFile = fileName

    // Format the missing headings list for the AI
    const headingsList = missingHeadings
      .map(h => `- ${h}`)
      .join('\n')

    // Trigger a focused conversation asking for targeted diffs
    this.handleUserInput(`${fileName} is missing the following headings:\n\n${headingsList}\n\nPlease propose a diff to add ONLY these missing headings with appropriate placeholder content. Do not modify existing content—just add the missing sections in the correct locations.`)
  }

  /**
   * Fix Overview.md headings by adding missing sections with placeholders.
   * This is a structural fix that doesn't require AI.
   * WARNING: This reformats the entire file structure.
   */
  private async fixInvalidHeadings(): Promise<void> {
    // Confirm with user since this reformats the file
    const confirmed = window.confirm(
      'This will reformat Overview.md to match the expected template structure.\n\n' +
      'Your existing content will be preserved where possible, but the file structure will change.\n\n' +
      'Continue?'
    )
    if (!confirmed) return

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
      new Notice('Reformatted Overview.md')

      await this.refreshAfterFix()
    } catch (err) {
      new Notice(`Failed to reformat: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  /**
   * Fix Roadmap.md headings by adding missing sections with placeholders.
   * This is a structural fix that doesn't require AI.
   * WARNING: This reformats the entire file structure.
   */
  private async fixRoadmapInvalidHeadings(): Promise<void> {
    // Confirm with user since this reformats the file
    const confirmed = window.confirm(
      'This will reformat Roadmap.md to match the expected template structure.\n\n' +
      'Your existing content will be preserved where possible, but the file structure will change.\n\n' +
      'Continue?'
    )
    if (!confirmed) return

    try {
      const roadmapPath = `${this.projectPath}/Roadmap.md`
      const roadmapFile = this.app.vault.getAbstractFileByPath(roadmapPath)

      if (!roadmapFile || !(roadmapFile instanceof TFile)) {
        new Notice('Roadmap.md not found')
        return
      }

      const content = await this.app.vault.read(roadmapFile)
      const fixedContent = fixRoadmapHeadings(content, this.snapshot.projectName)

      await this.app.vault.modify(roadmapFile, fixedContent)
      new Notice('Reformatted Roadmap.md')

      await this.refreshAfterFix()
    } catch (err) {
      new Notice(`Failed to reformat Roadmap: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  /**
   * Fix missing or incomplete .ai/config.json.
   * - If config doesn't exist: create it and ask AI for help
   * - If config exists but github_repo is empty: ask AI to help configure it
   */
  private async fixMissingConfig(): Promise<void> {
    this.closeIssuesDropdown()

    try {
      const configFolderPath = `${this.projectPath}/.ai`
      const configFilePath = `${configFolderPath}/config.json`

      // Check if config file already exists (use filesystem directly for reliability)
      const basePath = (this.app.vault.adapter as any).getBasePath() as string
      const fullConfigPath = path.join(basePath, configFilePath)
      const configExists = fs.existsSync(fullConfigPath)

      if (configExists) {
        // Config exists but needs github_repo configured
        // Start a conversation with the AI to help configure it
        this.handleUserInput('Help me configure my .ai/config.json - I need to set up the GitHub repository.')
        return
      }

      // Config doesn't exist - need to create it first
      // Ensure .ai folder exists
      const fullFolderPath = path.join(basePath, configFolderPath)
      if (!fs.existsSync(fullFolderPath)) {
        // Try vault API first, fall back to fs
        try {
          await this.app.vault.createFolder(configFolderPath)
        } catch {
          // Vault API failed, try fs directly
          fs.mkdirSync(fullFolderPath, { recursive: true })
        }
      }

      // Create new config file with empty github_repo
      const aiConfig = {
        $schema: 'https://lachesis.dev/schemas/ai-config.json',
        github_repo: '',
        notes:
          'Add your GitHub repo URL (e.g., "github.com/user/repo") to enable commit analysis for task tracking.',
      }

      // Try vault API first, fall back to fs
      try {
        await this.app.vault.create(configFilePath, JSON.stringify(aiConfig, null, 2))
      } catch {
        // Vault API failed, write directly
        fs.writeFileSync(fullConfigPath, JSON.stringify(aiConfig, null, 2), 'utf-8')
      }

      new Notice('Created .ai/config.json')

      // Refresh to update the snapshot
      await this.refreshAfterFix()

      // Now start a conversation with the AI to configure it
      this.handleUserInput('Help me configure my .ai/config.json - I need to set up the GitHub repository.')
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
