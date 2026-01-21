// Existing Project Modal - Chat interface for continuing work on existing projects
// This is the orchestrator that coordinates the extracted components.

import { App, Modal, Component } from 'obsidian'
import type LachesisPlugin from '../main'
import { resolveAbsoluteProjectPath } from '../utils/path'
import type { ProjectSnapshot, ExpectedCoreFile } from '../core/project/snapshot'
import { buildProjectSnapshot, formatProjectSnapshotForModel, fetchProjectFileContents, formatFileContentsForModel } from '../core/project/snapshot-builder'
import { getProvider, isProviderAvailable } from '../ai/providers/factory'
import type { AIProvider, ConversationMessage } from '../ai/providers/types'
import { buildSystemPrompt } from '../ai/prompts'
import { PROJECT_FILES, getWorkflowDefinition } from '../core/workflows/definitions'
import type { WorkflowDefinition, WorkflowName } from '../core/workflows/types'
import type { DiffBlock } from '../utils/diff'
import { getTrimmedLogContent, getFilteredLogForTitleEntries, getBottomLinesOfLog, type TrimmedLogResult, type FilteredLogResult, type BottomLinesResult } from '../utils/log-parser'
import type { DiffAction } from './diff-viewer-modal'
import { fetchCommits, formatCommitLog } from '../github'

// Components
import { ChatSidebar } from './components/chat-sidebar'
import { IssuesPanel } from './components/issues-panel'
import { WorkflowExecutor } from './components/workflow-executor'
import { ChatInterface } from './components/chat-interface'
import { ModalHeader } from './components/modal-header'

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
  private lastUsedWorkflowName: WorkflowName | null = null // Track workflow for post-diff processing
  private currentChatFilename: string | null = null

  // Components
  private chatSidebar: ChatSidebar | null = null
  private issuesPanel: IssuesPanel | null = null
  private workflowExecutor: WorkflowExecutor | null = null
  private chatInterface: ChatInterface | null = null
  private modalHeader: ModalHeader | null = null

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

    // Save this project as the last-used project
    this.plugin.settings.lastActiveProjectPath = this.projectPath
    await this.plugin.saveSettings()

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
    this.modalHeader = null
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
        onViewSyncCommits: (content) => this.workflowExecutor?.openSyncCommitsModalForHistory(content),
        onViewArchiveCompleted: (content) => this.workflowExecutor?.openArchiveCompletedModalForHistory(content),
        onViewHarvestTasks: (content) => this.workflowExecutor?.openHarvestTasksModalForHistory(content),
        onViewEnrichTasks: (content) => this.workflowExecutor?.openEnrichTasksModalForHistory(content),
        isAutoAcceptEnabled: () => this.plugin.settings.autoAcceptChanges,
        getWorkflowAutoApply: (name) => {
          // Check if workflow is auto-applyable and user has enabled it
          const workflow = getWorkflowDefinition(name as WorkflowName)
          if (!workflow?.autoApplyable) return false
          return this.plugin.settings.workflowAutoApply[name] ?? false
        },
      },
      this.renderComponent
    )

    // Modal Header
    this.modalHeader = new ModalHeader(
      this.app,
      this.projectPath,
      this.snapshot,
      {
        onAutoApplyChange: async (enabled) => {
          this.plugin.settings.autoAcceptChanges = enabled
          await this.plugin.saveSettings()
        },
        onConfigSaved: async () => {
          await this.refreshSnapshot()
          this.renderChatPhase()
        },
        onStatusBadgeClick: (badgeEl) => {
          this.issuesPanel?.toggleDropdown(badgeEl)
        },
      },
      { autoAcceptChanges: this.plugin.settings.autoAcceptChanges }
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

    // Header with project name, status badge, and controls
    const headerEl = mainEl.createDiv()
    this.modalHeader?.render(headerEl)

    // Workflow buttons bar
    const workflowBar = mainEl.createDiv({ cls: 'lachesis-workflow-bar' })
    this.workflowExecutor?.renderWorkflowButtons(workflowBar, () => {
      if (!this.isProcessing && this.messages.length === 0) {
        this.generateOpeningMessage()
      }
    })

    // Render chat interface (messages, input, status)
    const isReady = this.snapshot.readiness.isReady
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
    this.chatInterface?.setInputEnabled(enabled)
  }

  private updateStatus(text: string): void {
    this.chatInterface?.updateStatus(text)
  }

  /**
   * Handle when a diff is accepted or rejected.
   * Called by ChatInterface after it updates the UI.
   */
  private async handleDiffAction(_diffBlock: DiffBlock, action: DiffAction) {
    // Refresh snapshot if changes were applied
    if (action === 'accepted') {
      await this.refreshSnapshot()
    }
  }

  private async refreshSnapshot(): Promise<ProjectSnapshot> {
    this.snapshot = await buildProjectSnapshot(this.app.vault, this.projectPath)
    this.issuesPanel?.setSnapshot(this.snapshot)
    this.workflowExecutor?.setSnapshot(this.snapshot)
    this.modalHeader?.setSnapshot(this.snapshot)
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

    // Check if we're awaiting the promote keyword
    if (this.workflowExecutor?.isAwaitingPromoteKeyword()) {
      // Add user message to UI first
      const userMessage: ConversationMessage = {
        role: 'user',
        content: message,
        timestamp: new Date().toISOString(),
      }
      this.messages.push(userMessage)
      this.chatInterface.addMessageToUI('user', message)
      await this.chatSidebar?.saveChat(this.messages)

      // Check for keyword and handle
      const handled = await this.workflowExecutor.checkPromoteKeyword(message)
      if (handled) {
        // Save any assistant messages that were added
        await this.chatSidebar?.saveChat(this.messages)
        return
      }
    }

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
    let logBottomResult: BottomLinesResult | null = null
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
          } else if (this.activeWorkflow.name === 'log-refine') {
            // For log-refine, limit to bottom 300 lines to avoid overwhelming AI
            logBottomResult = getBottomLinesOfLog(fileContents['Log.md'])
            if (logBottomResult.wasTrimmed) {
              fileContents['Log.md'] = logBottomResult.content
              console.log(`Log trimmed for log-refine: showing ${logBottomResult.includedLineCount} lines, excluded ${logBottomResult.excludedLineCount} earlier lines`)
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
              const gitCommits = result.data.map((c) => ({
                sha: c.sha,
                message: c.message,
                date: c.date instanceof Date ? c.date.toISOString() : '',
                url: c.url,
              }))

              // Pass commits to WorkflowExecutor for sync-commits response handling
              this.workflowExecutor?.setRecentGitCommits(gitCommits)

              // Format commits for AI analysis
              const commitsSection = gitCommits.map((c) => {
                const date = c.date ? new Date(c.date).toISOString().split('T')[0] : 'unknown'
                return `COMMIT ${c.sha} (${date}):\n${c.message}`
              }).join('\n\n---\n\n')

              fileContents['RECENT_COMMITS'] = commitsSection
              console.log(`Fetched ${gitCommits.length} commits for sync-commits workflow`)
            } else if (!result.success) {
              console.warn('Failed to fetch commits:', result.error)
              this.workflowExecutor?.setRecentGitCommits([])
            } else {
              console.warn('No commits found')
              this.workflowExecutor?.setRecentGitCommits([])
            }
          } else {
            console.warn('No GitHub repo configured for sync-commits workflow')
            this.workflowExecutor?.setRecentGitCommits([])
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

    // Use agent chat for non-workflow chat when provider supports it
    const useAgentChat = !this.lastUsedWorkflowName && this.provider.streamAgentChat

    try {
      let result

      if (useAgentChat) {
        // Use Agent SDK for non-workflow chat (enables tool access)
        const absolutePath = resolveAbsoluteProjectPath(this.app.vault, this.projectPath)

        result = await this.provider.streamAgentChat!(
          systemPrompt,
          this.messages,
          {
            cwd: absolutePath,
            allowedTools: ['Glob', 'Grep', 'Read', 'Edit', 'Write'],
          },
          {
            onTextUpdate: (partial) => this.chatInterface?.updateStreamingMessage(partial),
            onToolActivity: (activity) => this.chatInterface?.showToolActivity(activity),
          },
        )

        this.chatInterface?.clearToolActivity()
      } else {
        // Use regular streamText for workflows
        result = await this.provider.streamText(
          systemPrompt,
          this.messages,
          (partial) => {
            this.chatInterface?.updateStreamingMessage(partial)
          },
        )
      }

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
          await this.workflowExecutor?.handleSyncCommitsResponse(result.content)
        }

        // Check if this was an archive-completed workflow - handle specially
        if (this.lastUsedWorkflowName === 'archive-completed') {
          await this.workflowExecutor?.handleArchiveCompletedResponse(result.content)
        }

        // Check if this was a promote-next-task workflow - handle specially
        if (this.lastUsedWorkflowName === 'promote-next-task') {
          await this.workflowExecutor?.handlePromoteNextResponse(result.content)
        }

        // Check if this was an init-from-summary workflow - handle specially
        if (this.lastUsedWorkflowName === 'init-from-summary') {
          await this.workflowExecutor?.handleInitFromSummaryResponse(result.content)
        }

        // Check if this was an enrich-tasks workflow - handle specially
        if (this.lastUsedWorkflowName === 'enrich-tasks') {
          await this.workflowExecutor?.handleEnrichTasksResponse(result.content)
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
      this.chatInterface?.clearToolActivity()
      this.chatInterface?.updateStatus(`Error: ${error}`)
      this.setInputEnabled(true)
    }
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
    this.activeWorkflow = null
    this.focusedFile = null
    this.lastUsedWorkflowName = null
    this.chatInterface?.setViewingLoadedChat(false)
    this.renderChatPhase()
  }
}
