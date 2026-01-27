// Existing Project Modal - Chat interface for continuing work on existing projects
// This is the orchestrator that coordinates the extracted components.

import { App, Modal, Component } from 'obsidian'
import type LachesisPlugin from '../main'
import { resolveAbsoluteProjectPath } from '../utils/path'
import type { ProjectSnapshot, ExpectedCoreFile } from '../core/project/snapshot'
import { buildProjectSnapshot, buildProjectStatus, formatProjectSnapshotForModel, fetchProjectFileContents, formatFileContentsForModel } from '../core/project/snapshot-builder'
import type { ProjectStatus } from '../core/project/status'
import { getProvider, isProviderAvailable } from '../ai/providers/factory'
import type { AIProvider, ConversationMessage } from '../ai/providers/types'
import { buildSystemPrompt, detectPlanningModeRequest, detectPlanningTrigger, extractMilestoneProposals } from '../ai/prompts'
import type { ChatMode } from '../ai/prompts/types'
import { PROJECT_FILES, getWorkflowDefinition } from '../core/workflows/definitions'
import type { WorkflowDefinition, WorkflowName } from '../core/workflows/types'
import { fetchCommits, formatCommitLog } from '../github'

// Components
import { ChatSidebar } from './components/chat-sidebar'
import { IssuesPanel } from './components/issues-panel'
import { WorkflowExecutor } from './components/workflow-executor'
import { ChatInterface } from './components/chat-interface'
import { ModalHeader } from './components/modal-header'
import { WorkflowHintBanner } from './components/workflow-hint-banner'
import type { WorkflowHint } from '../core/workflows/hints'

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
  private projectStatus: ProjectStatus | null = null
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
  private planningMode = false // Planning mode for milestone brainstorming

  // Components
  private chatSidebar: ChatSidebar | null = null
  private issuesPanel: IssuesPanel | null = null
  private workflowExecutor: WorkflowExecutor | null = null
  private chatInterface: ChatInterface | null = null
  private modalHeader: ModalHeader | null = null
  private hintBanner: WorkflowHintBanner | null = null
  private hintContainer: HTMLElement | null = null

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

    // Build project status for milestone transition detection
    this.projectStatus = await buildProjectStatus(this.app.vault, this.projectPath)

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
      this.modalEl,
      this.projectStatus ?? undefined
    )

    // Workflow Hint Banner
    this.hintBanner = new WorkflowHintBanner({
      onRunWorkflow: (displayName) => {
        this.hintBanner?.remove()
        this.workflowExecutor?.triggerWorkflow(displayName)
      },
      onDismiss: () => {},
    })

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
        onPlanningModeToggle: (enabled) => this.handlePlanningModeToggle(enabled),
        onShowHint: (hint) => this.showHint(hint),
      },
      this.plugin.settings.githubToken
    )

    // Chat Interface
    this.chatInterface = new ChatInterface(
      this.app,
      this.projectPath,
      {
        onSubmit: (message) => this.handleUserInput(message),
        onViewEnrichTasks: (content) => this.workflowExecutor?.openEnrichTasksModalForHistory(content),
        onViewPlanWork: (content) => this.workflowExecutor?.openPlanWorkModalForHistory(content),
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
      { autoAcceptChanges: this.plugin.settings.autoAcceptChanges },
      this.projectStatus ?? undefined
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

    // Hint container (renders hints when triggered)
    this.hintContainer = mainEl.createDiv({ cls: 'lachesis-hint-container' })

    // Render chat interface (messages, input, status)
    const isReady = this.snapshot.readiness.isReady
    this.chatInterface?.render(mainEl, this.messages, this.snapshot.projectName, isReady)
  }

  /**
   * Show a workflow hint banner.
   */
  private showHint(hint: WorkflowHint): void {
    if (this.hintContainer && this.hintBanner) {
      this.hintBanner.render(this.hintContainer, hint)
    }
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

  private async refreshSnapshot(): Promise<ProjectSnapshot> {
    this.snapshot = await buildProjectSnapshot(this.app.vault, this.projectPath)
    this.projectStatus = await buildProjectStatus(this.app.vault, this.projectPath)
    this.issuesPanel?.setSnapshot(this.snapshot)
    this.issuesPanel?.setProjectStatus(this.projectStatus)
    this.workflowExecutor?.setSnapshot(this.snapshot)
    this.modalHeader?.setSnapshot(this.snapshot)
    this.modalHeader?.setProjectStatus(this.projectStatus)
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
      chatMode: this.getChatMode(),
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
        await this.chatSidebar?.saveChat(this.messages, this.getChatMode())
        this.chatSidebar?.highlightCurrentChat()
        this.setProcessing(false, 'Your turn')
        this.chatInterface.focusInput()
      } else if (!result.success) {
        // API call failed - show error
        const errorMsg = result.error || 'Failed to connect to AI provider'
        this.chatInterface.updateStatus(`Error: ${errorMsg}`)
        this.setProcessing(false, `Error: ${errorMsg}`)
        console.error('AI provider error:', result.error, result.debugDetails)
      } else {
        // Success but empty content
        this.setProcessing(false, 'Your turn')
        this.chatInterface.focusInput()
      }
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
      await this.chatSidebar?.saveChat(this.messages, this.getChatMode())

      // Check for keyword and handle
      const handled = await this.workflowExecutor.checkPromoteKeyword(message)
      if (handled) {
        // Save any assistant messages that were added
        await this.chatSidebar?.saveChat(this.messages, this.getChatMode())
        return
      }
    }

    // Check for planning mode actions (save to ideas, add to roadmap)
    if (this.planningMode) {
      const planningAction = detectPlanningTrigger(message)
      if (planningAction === 'save_ideas' || planningAction === 'add_roadmap') {
        // Find the last assistant message with proposals
        const lastAssistantMsg = [...this.messages].reverse().find((m) => m.role === 'assistant')
        if (lastAssistantMsg) {
          await this.handlePlanningAction(planningAction, lastAssistantMsg.content)
          return
        }
      }
    }

    // Detect if user wants to enter planning mode (natural language triggers)
    if (!this.planningMode && detectPlanningModeRequest(message)) {
      this.planningMode = true
      this.chatInterface.setPlanningMode(true)
      this.workflowExecutor?.setPlanningMode(true)
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
    await this.chatSidebar?.saveChat(this.messages, this.getChatMode())
    this.chatSidebar?.highlightCurrentChat()

    // Generate response
    this.setProcessing(true, 'Lachesis is thinking...')

    // Fetch file contents if a workflow is active
    let workflowFileContents: string | undefined
    if (this.activeWorkflow) {
      this.chatInterface.updateStatus(`Fetching files for ${this.activeWorkflow.displayName}...`)
      try {
        const fileContents = await fetchProjectFileContents(
          this.app.vault,
          this.projectPath,
          this.activeWorkflow.readFiles,
        )

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
      chatMode: this.getChatMode(),
    })

    // Store workflow name for post-diff processing, then clear active workflow
    this.lastUsedWorkflowName = this.activeWorkflow?.name ?? null
    // Only clear focusedFile if a workflow was active (workflow takes precedence over fill mode)
    if (this.activeWorkflow) {
      this.focusedFile = null
    }
    this.activeWorkflow = null

    // Always use agent chat when provider supports it (enables tool access for file modifications)
    const useAgentChat = !!this.provider.streamAgentChat

    try {
      let result

      if (useAgentChat) {
        // Use Agent SDK for non-workflow chat (enables tool access)
        const absolutePath = resolveAbsoluteProjectPath(this.app.vault, this.projectPath)
        console.log('[Lachesis] Agent chat cwd:', absolutePath)

        result = await this.provider.streamAgentChat!(
          systemPrompt,
          this.messages,
          {
            cwd: absolutePath,
            allowedTools: ['Glob', 'Grep', 'Read', 'Edit', 'Write', 'GitLog'],
            githubToken: this.plugin.settings.githubToken || undefined,
          },
          {
            onTextUpdate: (partial) => this.chatInterface?.updateStreamingMessage(partial),
            onEnhancedToolActivity: (activity) => this.chatInterface?.showEnhancedToolActivity(activity),
          },
        )

        this.chatInterface?.finalizeToolActivities()
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

      if (result.success && result.content) {
        this.chatInterface.finalizeStreamingMessage()

        // Render tool activities on the finalized message (after finalizeStreamingMessage clears the container)
        if (result.toolActivities && result.toolActivities.length > 0) {
          this.chatInterface.renderToolActivitiesOnLastMessage(result.toolActivities)
        }

        // Check if this was an init-from-summary workflow - handle specially
        if (this.lastUsedWorkflowName === 'init-from-summary') {
          await this.workflowExecutor?.handleInitFromSummaryResponse(result.content)
        }

        // Check if this was an enrich-tasks workflow - handle specially
        if (this.lastUsedWorkflowName === 'enrich-tasks') {
          await this.workflowExecutor?.handleEnrichTasksResponse(result.content)
        }

        // Check if this was a plan-work workflow - handle specially
        if (this.lastUsedWorkflowName === 'plan-work') {
          await this.workflowExecutor?.handlePlanWorkResponse(result.content)
        }

        this.messages.push({
          role: 'assistant',
          content: result.content,
          timestamp: new Date().toISOString(),
          toolActivities: result.toolActivities,
        })
        await this.chatSidebar?.saveChat(this.messages, this.getChatMode())
        this.chatSidebar?.highlightCurrentChat()
        this.setProcessing(false, 'Your turn')
        this.chatInterface.focusInput()
      } else if (!result.success) {
        // API call failed - handle error with visibility of what happened
        const errorMsg = result.error || 'Failed to generate response'
        console.error('AI provider error:', result.error, result.debugDetails)

        // Determine if files were modified before the error
        const hasPartialChanges = result.hasPartialChanges ?? false
        const toolActivities = result.toolActivities

        // Build error message for user
        let userMessage: string
        if (hasPartialChanges) {
          userMessage = `⚠️ **Error occurred after file changes**\n\n${errorMsg}\n\nSome files may have been modified before this error. Please review the tool activities below to see what changed.`
        } else if (toolActivities && toolActivities.length > 0) {
          userMessage = `❌ **Error**\n\n${errorMsg}\n\nNo files were modified.`
        } else {
          userMessage = `❌ **Error**\n\n${errorMsg}`
        }

        // Build full message content (partial content + error)
        const partialContent = result.content
        const fullContent = partialContent
          ? `${partialContent}\n\n---\n\n${userMessage}`
          : userMessage

        // Replace streaming message with proper error message that includes tool activities
        // First update streaming with content, then finalize
        this.chatInterface.updateStreamingMessage(fullContent)
        this.chatInterface.finalizeStreamingMessage()

        // Render tool activities on the finalized message
        if (toolActivities && toolActivities.length > 0) {
          this.chatInterface.renderToolActivitiesOnLastMessage(toolActivities)
        }

        // Save error message with tool activities so user can see what happened
        this.messages.push({
          role: 'assistant',
          content: fullContent,
          timestamp: new Date().toISOString(),
          toolActivities: toolActivities,
        })

        await this.chatSidebar?.saveChat(this.messages, this.getChatMode())
        this.chatSidebar?.highlightCurrentChat()

        const statusMsg = hasPartialChanges
          ? 'Error (files may have changed)'
          : `Error: ${errorMsg}`
        this.chatInterface.updateStatus(statusMsg)
        this.setProcessing(false, statusMsg)
      } else {
        // Success but empty content
        this.chatInterface.finalizeStreamingMessage()
        this.setProcessing(false, 'Your turn')
        this.chatInterface.focusInput()
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Failed to generate response'
      this.chatInterface?.finalizeStreamingMessage()
      this.chatInterface?.finalizeToolActivities()
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
    this.planningMode = false
    this.chatInterface?.setViewingLoadedChat(false)
    this.chatInterface?.setPlanningMode(false)
    this.workflowExecutor?.setPlanningMode(false)
    this.renderChatPhase()
  }

  // ============================================================================
  // Planning Mode Methods
  // ============================================================================

  /**
   * Handle planning mode toggle from workflow executor.
   */
  private handlePlanningModeToggle(enabled: boolean): void {
    this.planningMode = enabled
    this.chatInterface?.setPlanningMode(enabled)
  }

  /**
   * Get the current chat mode based on planning state.
   */
  private getChatMode(): ChatMode {
    return this.planningMode ? 'planning' : 'default'
  }

  /**
   * Handle planning mode actions (save to ideas, add to roadmap).
   */
  private async handlePlanningAction(
    action: 'save_ideas' | 'add_roadmap',
    assistantContent: string
  ): Promise<void> {
    const proposals = extractMilestoneProposals(assistantContent)
    if (!proposals) {
      this.chatInterface?.addMessageToUI(
        'assistant',
        "I don't see any milestone proposals to save. Would you like me to generate some first?"
      )
      return
    }

    const targetFile = action === 'save_ideas' ? 'Ideas.md' : 'Roadmap.md'
    const filePath = `${this.projectPath}/${targetFile}`
    const file = this.app.vault.getAbstractFileByPath(filePath)

    if (!file) {
      this.chatInterface?.addMessageToUI(
        'assistant',
        `${targetFile} not found. Please ensure the file exists first.`
      )
      return
    }

    try {
      const currentContent = await this.app.vault.read(file as any)
      const dateHeader = `### ${new Date().toISOString().split('T')[0]} — Planning Session`
      const newSection = `\n\n${dateHeader}\n\n${proposals}`

      // Append to the end of the file
      await this.app.vault.modify(file as any, currentContent + newSection)

      this.chatInterface?.addMessageToUI(
        'assistant',
        `Done. I've added the milestone proposals to ${targetFile}.`
      )

      await this.refreshSnapshot()
    } catch (err) {
      console.error(`Failed to save to ${targetFile}:`, err)
      this.chatInterface?.addMessageToUI(
        'assistant',
        `Failed to save to ${targetFile}: ${err instanceof Error ? err.message : 'Unknown error'}`
      )
    }
  }
}
