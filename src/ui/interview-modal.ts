// Interview Modal - Main UI for project planning interviews

import { App, Modal, Notice, MarkdownRenderer, Component } from 'obsidian'
import type LachesisPlugin from '../main'
import { initializeStore, loadFromDisk } from '../core/session/session-store'
import { isProviderAvailable } from '../ai/providers/factory'
import { buildProjectSnapshot } from '../core/project/snapshot-builder'
import {
  InterviewFlowController,
  PLANNING_LEVELS,
  TOPIC_LABELS,
  DISCOVERY_TOPICS,
  type InterviewPhase,
  type PlanningLevel,
} from '../core/interview'
import type { SessionState } from '../core/session/types'

// ============================================================================
// Interview Modal
// ============================================================================

export class InterviewModal extends Modal {
  private plugin: LachesisPlugin
  private flowController: InterviewFlowController | null = null
  private renderComponent: Component

  // Cached session state for rendering
  private cachedSession: SessionState | null = null

  // DOM Elements
  private messagesContainer: HTMLElement | null = null
  private inputContainer: HTMLElement | null = null
  private inputEl: HTMLInputElement | null = null
  private statusEl: HTMLElement | null = null
  private progressContainer: HTMLElement | null = null

  constructor(app: App, plugin: LachesisPlugin) {
    super(app)
    this.plugin = plugin
    this.renderComponent = new Component()
  }

  async onOpen() {
    const { contentEl } = this
    contentEl.empty()
    this.modalEl.addClass('lachesis-modal-root')
    contentEl.addClass('lachesis-modal')
    this.renderComponent.load()

    // Check if provider is configured
    if (!isProviderAvailable(this.plugin.settings.provider, this.plugin.settings)) {
      this.renderApiKeyMissing()
      return
    }

    // Initialize session store
    initializeStore(this.plugin)
    await loadFromDisk()

    // Create flow controller with event handlers
    this.flowController = new InterviewFlowController(
      this.plugin.settings,
      this.app.vault,
      {
        onPhaseChange: (phase, error) => this.handlePhaseChange(phase, error),
        onSessionUpdate: (session) => this.handleSessionUpdate(session),
        onStreamingUpdate: (text) => this.handleStreamingUpdate(text),
        onStatusChange: (status) => this.updateStatus(status),
        onProcessingChange: (isProcessing) => this.handleProcessingChange(isProcessing),
      }
    )
    this.flowController.initialize()

    // Render initial setup phase
    this.renderSetupPhase()
  }

  onClose() {
    const { contentEl } = this
    contentEl.empty()
    this.renderComponent.unload()
    this.flowController?.dispose()
    this.flowController = null
    this.cachedSession = null
  }

  // ============================================================================
  // Event Handlers (from FlowController)
  // ============================================================================

  private handlePhaseChange(phase: InterviewPhase, error?: string): void {
    switch (phase) {
      case 'setup':
        this.renderSetupPhase()
        break
      case 'conversation':
        this.renderConversationPhase()
        break
      case 'naming':
        this.renderNamingPhase()
        break
      case 'complete':
        this.renderCompletePhase()
        break
      case 'error':
        this.renderErrorPhase(error || 'Unknown error')
        break
    }
  }

  private handleSessionUpdate(session: SessionState): void {
    this.cachedSession = session
    // Update progress indicator if in conversation phase
    if (this.flowController?.getPhase() === 'conversation') {
      this.updateProgressIndicator()
    }
  }

  private handleStreamingUpdate(text: string): void {
    this.updateStreamingMessage(text)
  }

  private handleProcessingChange(isProcessing: boolean): void {
    this.setInputEnabled(!isProcessing)
  }

  // ============================================================================
  // Render Methods
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

  private renderSetupPhase() {
    const { contentEl } = this
    contentEl.empty()

    const selectedLevel = this.flowController?.getSelectedPlanningLevel() || 'Light spark'

    // Header
    contentEl.createEl('h2', { text: 'New Project Interview' })
    contentEl.createEl('p', {
      text: 'How developed is your project idea?',
      cls: 'lachesis-subtitle',
    })

    // Planning level selection
    const optionsContainer = contentEl.createDiv({ cls: 'lachesis-planning-options' })

    for (const level of PLANNING_LEVELS) {
      const option = optionsContainer.createDiv({
        cls: `lachesis-planning-option ${selectedLevel === level.value ? 'selected' : ''}`,
      })

      option.createEl('div', { text: level.label, cls: 'lachesis-option-label' })
      option.createEl('div', { text: level.description, cls: 'lachesis-option-desc' })

      option.addEventListener('click', () => {
        this.flowController?.setPlanningLevel(level.value as PlanningLevel)
        // Update selection visually
        optionsContainer.querySelectorAll('.lachesis-planning-option').forEach((el) => {
          el.removeClass('selected')
        })
        option.addClass('selected')
      })
    }

    // Estimated time
    contentEl.createEl('p', {
      text: 'Full interview takes ~5 minutes',
      cls: 'lachesis-time-estimate',
    })

    // Button container
    const buttonContainer = contentEl.createDiv({ cls: 'lachesis-button-container' })

    // Quick Start button
    const quickStartButton = buttonContainer.createEl('button', {
      text: 'Quick Start',
      cls: 'lachesis-quick-start-button',
    })
    quickStartButton.addEventListener('click', () => this.flowController?.startQuickStart())

    // Start Interview button
    const startButton = buttonContainer.createEl('button', {
      text: 'Start Interview',
      cls: 'mod-cta',
    })
    startButton.addEventListener('click', () => this.flowController?.startInterview())

    // Quick Start description
    contentEl.createEl('p', {
      text: 'Quick Start skips the interview and creates project files immediately',
      cls: 'lachesis-quick-start-hint',
    })
  }

  private renderConversationPhase() {
    const { contentEl } = this
    contentEl.empty()

    // Header with progress indicator
    const header = contentEl.createDiv({ cls: 'lachesis-header' })
    const headerLeft = header.createDiv({ cls: 'lachesis-header-left' })
    headerLeft.createEl('h2', { text: 'Project Discovery' })

    // Progress indicator
    this.progressContainer = header.createDiv({ cls: 'lachesis-progress-indicator' })
    this.updateProgressIndicator()

    // Messages container
    this.messagesContainer = contentEl.createDiv({ cls: 'lachesis-messages' })

    // Render existing messages
    if (this.cachedSession) {
      for (const msg of this.cachedSession.messages) {
        this.addMessageToUI(msg.role, msg.content)
      }
    }

    // Input area
    this.inputContainer = contentEl.createDiv({ cls: 'lachesis-input-area' })

    this.inputEl = this.inputContainer.createEl('input', {
      type: 'text',
      placeholder: 'Type your response...',
      cls: 'lachesis-input',
    })

    this.inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !this.flowController?.isCurrentlyProcessing()) {
        e.preventDefault()
        this.handleUserInput()
      }
    })

    // Skip button
    const skipButton = this.inputContainer.createEl('button', {
      text: "I don't know yet",
      cls: 'lachesis-skip-button',
    })
    skipButton.addEventListener('click', () => {
      if (!this.flowController?.isCurrentlyProcessing()) {
        this.addMessageToUI('user', "I don't know yet, let's move on")
        this.flowController?.handleSkipTopic()
      }
    })

    const sendButton = this.inputContainer.createEl('button', {
      text: 'Send',
      cls: 'lachesis-send-button',
    })
    sendButton.addEventListener('click', () => {
      if (!this.flowController?.isCurrentlyProcessing()) {
        this.handleUserInput()
      }
    })

    // Status bar
    this.statusEl = contentEl.createDiv({ cls: 'lachesis-status' })
    this.updateStatus('Ready')
  }

  private renderNamingPhase() {
    const { contentEl } = this
    contentEl.empty()

    // Check if we're in loading state (quick start)
    if (this.flowController?.isCurrentlyLaunching()) {
      contentEl.createEl('h2', { text: 'Quick Start' })
      contentEl.createEl('p', {
        text: 'Setting up your project...',
        cls: 'lachesis-subtitle',
      })
      this.statusEl = contentEl.createDiv({ cls: 'lachesis-status' })
      return
    }

    contentEl.createEl('h2', { text: 'Name Your Project' })
    contentEl.createEl('p', {
      text: 'Choose a name or enter your own:',
      cls: 'lachesis-subtitle',
    })

    const suggestions = this.cachedSession?.nameSuggestions || []

    // Name suggestions
    const suggestionsContainer = contentEl.createDiv({ cls: 'lachesis-name-suggestions' })

    for (const suggestion of suggestions) {
      const suggestionEl = suggestionsContainer.createDiv({ cls: 'lachesis-name-suggestion' })
      suggestionEl.createDiv({ text: suggestion.name, cls: 'name' })
      suggestionEl.createDiv({ text: suggestion.reasoning, cls: 'reasoning' })

      suggestionEl.addEventListener('click', () => {
        this.selectProjectName(suggestion.name)
      })
    }

    // Custom name input
    const customContainer = contentEl.createDiv({ cls: 'lachesis-custom-name' })
    customContainer.createEl('label', { text: 'Or enter a custom name:' })

    const customInput = customContainer.createEl('input', {
      type: 'text',
      placeholder: 'My Awesome Project',
      cls: 'lachesis-input',
    })

    const customButton = customContainer.createEl('button', {
      text: 'Use This Name',
      cls: 'mod-cta',
    })
    customButton.addEventListener('click', () => {
      const name = customInput.value.trim()
      if (name) {
        this.selectProjectName(name)
      } else {
        new Notice('Please enter a project name')
      }
    })

    customInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const name = customInput.value.trim()
        if (name) {
          this.selectProjectName(name)
        }
      }
    })
  }

  private renderCompletePhase() {
    const { contentEl } = this
    contentEl.empty()

    contentEl.createEl('h2', { text: 'Project Created!' })

    const projectPath = this.cachedSession?.scaffoldedPath || 'Unknown'
    const projectName = this.cachedSession?.selectedName || 'Your Project'

    contentEl.createEl('p', {
      text: `"${projectName}" has been created successfully.`,
      cls: 'lachesis-success-message',
    })

    contentEl.createEl('p', {
      text: `Location: ${projectPath}`,
      cls: 'lachesis-path',
    })

    const buttonContainer = contentEl.createDiv({ cls: 'lachesis-button-container' })

    // Primary: Continue in Chat (opens existing project modal)
    const continueButton = buttonContainer.createEl('button', {
      text: 'Continue in Chat',
      cls: 'mod-cta',
    })
    continueButton.addEventListener('click', () => this.transitionToExistingProject())

    // Secondary: Open Files (opens Overview.md in editor)
    const openButton = buttonContainer.createEl('button', {
      text: 'Open Files',
    })
    openButton.addEventListener('click', async () => {
      const overviewPath = `${projectPath}/Overview.md`
      const file = this.app.vault.getAbstractFileByPath(overviewPath)
      if (file) {
        await this.app.workspace.openLinkText(overviewPath, '', false)
      }
      this.close()
    })

    // Close button
    const closeButton = buttonContainer.createEl('button', { text: 'Close' })
    closeButton.addEventListener('click', () => this.close())
  }

  private async transitionToExistingProject() {
    if (!this.cachedSession?.scaffoldedPath) {
      new Notice('No project path available')
      return
    }

    const projectPath = this.cachedSession.scaffoldedPath

    // Show loading state
    const { contentEl } = this
    contentEl.empty()
    contentEl.createEl('h2', { text: 'Loading project...' })

    try {
      const snapshot = await buildProjectSnapshot(this.app.vault, projectPath)
      this.close()
      this.plugin.openExistingProject(projectPath, snapshot)
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Failed to load project'
      new Notice(`Error: ${error}`)
      // Re-render complete phase on error
      this.renderCompletePhase()
    }
  }

  private renderErrorPhase(error: string) {
    const { contentEl } = this
    contentEl.empty()

    contentEl.createEl('h2', { text: 'Error' })
    contentEl.createEl('p', {
      text: error,
      cls: 'lachesis-error-message',
    })

    const buttonContainer = contentEl.createDiv({ cls: 'lachesis-button-container' })

    const retryButton = buttonContainer.createEl('button', {
      text: 'Try Again',
      cls: 'mod-cta',
    })
    retryButton.addEventListener('click', () => {
      this.flowController?.resetToSetup()
    })

    const closeButton = buttonContainer.createEl('button', { text: 'Close' })
    closeButton.addEventListener('click', () => this.close())
  }

  // ============================================================================
  // UI Helpers
  // ============================================================================

  private addMessageToUI(role: 'assistant' | 'user', content: string, isStreaming = false) {
    if (!this.messagesContainer) return

    const messageEl = this.messagesContainer.createDiv({
      cls: `lachesis-message ${role} ${isStreaming ? 'streaming' : ''}`,
    })

    // Render markdown for non-empty content
    if (content) {
      this.renderMarkdown(content, messageEl)
    }

    // Scroll to bottom
    this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight

    return messageEl
  }

  private updateStreamingMessage(content: string) {
    if (!this.messagesContainer) return

    let streamingEl = this.messagesContainer.querySelector('.lachesis-message.streaming') as HTMLElement

    // Create streaming element if it doesn't exist
    if (!streamingEl) {
      streamingEl = this.addMessageToUI('assistant', '', true) as HTMLElement
    }

    if (streamingEl) {
      streamingEl.empty()
      if (content) {
        this.renderMarkdown(content, streamingEl)
      }
      this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight
    }
  }

  private renderMarkdown(content: string, container: HTMLElement) {
    MarkdownRenderer.render(
      this.app,
      content,
      container,
      '',
      this.renderComponent
    )
  }

  private finalizeStreamingMessage() {
    if (!this.messagesContainer) return

    const streamingEl = this.messagesContainer.querySelector('.lachesis-message.streaming')
    if (streamingEl) {
      streamingEl.removeClass('streaming')
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
    // Finalize streaming message when enabling input
    if (enabled) {
      this.finalizeStreamingMessage()
      this.inputEl?.focus()
    }
  }

  private updateProgressIndicator() {
    if (!this.progressContainer) return

    this.progressContainer.empty()
    const coveredTopics = this.flowController?.getCoveredTopics() || []

    for (const topic of DISCOVERY_TOPICS) {
      const isCovered = coveredTopics.includes(topic)
      const topicEl = this.progressContainer.createDiv({
        cls: `lachesis-progress-topic ${isCovered ? 'covered' : ''}`,
      })
      topicEl.setText(TOPIC_LABELS[topic])
      topicEl.setAttribute('title', topic.replace(/_/g, ' '))
    }
  }

  // ============================================================================
  // User Input Handling
  // ============================================================================

  private handleUserInput() {
    if (!this.inputEl) return

    const message = this.inputEl.value.trim()
    if (!message) return

    // Clear input
    this.inputEl.value = ''

    // Add user message to UI
    this.addMessageToUI('user', message)

    // Send to flow controller
    this.flowController?.handleUserMessage(message)
  }

  private selectProjectName(name: string) {
    const { contentEl } = this
    contentEl.empty()
    contentEl.createEl('h2', { text: 'Creating Project...' })
    this.statusEl = contentEl.createEl('p', { text: 'Selecting name...' })

    this.flowController?.selectProjectName(name)
  }
}
