// Interview Modal - Main UI for project planning interviews

import { App, Modal, Notice, Setting, MarkdownRenderer, Component } from 'obsidian'
import type LachesisPlugin from '../main'
import type { LachesisSettings } from '../settings'
import {
  createSessionManager,
  type SessionManagerConfig,
} from '../core/session/session-manager'
import type {
  ISessionManager,
  SessionState,
  SessionStep,
  ProjectNameSuggestion,
} from '../core/session/types'
import { initializeStore, loadFromDisk } from '../core/session/session-store'
import { isProviderAvailable } from '../ai/providers/factory'
import { DISCOVERY_TOPICS, type DiscoveryTopic } from '../core/interview/phases'

// ============================================================================
// Planning Level Options
// ============================================================================

const PLANNING_LEVELS = [
  { value: 'Light spark', label: 'Light spark', description: 'Just a vague idea' },
  { value: 'Some notes', label: 'Some notes', description: 'Have some thoughts written down' },
  { value: 'Well defined', label: 'Well defined', description: 'Pretty clear on what I want' },
] as const

// Human-readable labels for discovery topics
const TOPIC_LABELS: Record<DiscoveryTopic, string> = {
  elevator_pitch: 'What',
  problem_statement: 'Why',
  target_users: 'Who',
  value_proposition: 'Value',
  scope_and_antigoals: 'Scope',
  constraints: 'Constraints',
}

// ============================================================================
// Interview Modal
// ============================================================================

type ModalPhase = 'setup' | 'conversation' | 'naming' | 'complete' | 'error'

export class InterviewModal extends Modal {
  private plugin: LachesisPlugin
  private sessionManager: ISessionManager | null = null
  private currentSession: SessionState | null = null
  private renderComponent: Component

  // UI State
  private phase: ModalPhase = 'setup'
  private selectedPlanningLevel: string = 'Light spark'
  private isLaunching = false
  private isProcessing = false
  private streamingText = ''

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
    // Style hook: Obsidian sizes modals via the root `.modal` element
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

    // Create session manager
    const config: SessionManagerConfig = {
      settings: this.plugin.settings,
      vault: this.app.vault,
    }
    this.sessionManager = createSessionManager(config)

    // Render initial setup phase
    this.renderSetupPhase()
  }

  onClose() {
    const { contentEl } = this
    contentEl.empty()
    this.renderComponent.unload()
    this.sessionManager = null
    this.currentSession = null
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
        cls: `lachesis-planning-option ${this.selectedPlanningLevel === level.value ? 'selected' : ''}`,
      })

      option.createEl('div', { text: level.label, cls: 'lachesis-option-label' })
      option.createEl('div', { text: level.description, cls: 'lachesis-option-desc' })

      option.addEventListener('click', () => {
        this.selectedPlanningLevel = level.value
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
    quickStartButton.addEventListener('click', () => this.startQuickStart())

    // Start Interview button
    const startButton = buttonContainer.createEl('button', {
      text: 'Start Interview',
      cls: 'mod-cta',
    })
    startButton.addEventListener('click', () => this.startInterview())

    // Quick Start description
    contentEl.createEl('p', {
      text: 'Quick Start skips the interview and creates project files immediately',
      cls: 'lachesis-quick-start-hint',
    })
  }

  /**
   * Lightweight loading view shown while quick start prepares the naming step.
   * This replaces the setup UI immediately to avoid duplicate launches.
   */
  private renderQuickStartLoading() {
    const { contentEl } = this
    contentEl.empty()

    contentEl.createEl('h2', { text: 'Quick Start' })
    contentEl.createEl('p', {
      text: 'Setting up your project...',
      cls: 'lachesis-subtitle',
    })

    this.statusEl = contentEl.createDiv({ cls: 'lachesis-status' })
    this.updateStatus('Creating session...')
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
    if (this.currentSession) {
      for (const msg of this.currentSession.messages) {
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
      if (e.key === 'Enter' && !e.shiftKey && !this.isProcessing) {
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
      if (!this.isProcessing) {
        this.handleSkipTopic()
      }
    })

    const sendButton = this.inputContainer.createEl('button', {
      text: 'Send',
      cls: 'lachesis-send-button',
    })
    sendButton.addEventListener('click', () => {
      if (!this.isProcessing) {
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

    contentEl.createEl('h2', { text: 'Name Your Project' })
    contentEl.createEl('p', {
      text: 'Choose a name or enter your own:',
      cls: 'lachesis-subtitle',
    })

    const suggestions = this.currentSession?.nameSuggestions || []

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

    const projectPath = this.currentSession?.scaffoldedPath || 'Unknown'
    const projectName = this.currentSession?.selectedName || 'Your Project'

    contentEl.createEl('p', {
      text: `"${projectName}" has been created successfully.`,
      cls: 'lachesis-success-message',
    })

    contentEl.createEl('p', {
      text: `Location: ${projectPath}`,
      cls: 'lachesis-path',
    })

    const buttonContainer = contentEl.createDiv({ cls: 'lachesis-button-container' })

    // Open project button
    const openButton = buttonContainer.createEl('button', {
      text: 'Open Project',
      cls: 'mod-cta',
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
      this.phase = 'setup'
      this.renderSetupPhase()
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

    const streamingEl = this.messagesContainer.querySelector('.lachesis-message.streaming') as HTMLElement
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
    this.isProcessing = !enabled
  }

  private updateProgressIndicator() {
    if (!this.progressContainer) return

    this.progressContainer.empty()
    const coveredTopics = this.currentSession?.coveredTopics || []

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
  // Interview Flow
  // ============================================================================

  private async startInterview() {
    if (!this.sessionManager || this.isLaunching || this.phase !== 'setup') return

    this.isLaunching = true

    this.phase = 'conversation'
    this.renderConversationPhase()

    try {
      // Create session
      this.currentSession = await this.sessionManager.createSession({
        type: 'new_project',
        planningLevel: this.selectedPlanningLevel,
      })

      // Stream first question
      await this.streamNextQuestion()
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Failed to start interview'
      this.phase = 'error'
      this.renderErrorPhase(error)
    } finally {
      this.isLaunching = false
    }
  }

  private async startQuickStart() {
    if (!this.sessionManager || this.isLaunching || this.phase !== 'setup') return

    this.isLaunching = true
    // Replace setup UI immediately to prevent concurrent launches
    this.phase = 'naming'
    this.renderQuickStartLoading()

    try {
      // Create session with Quick Start planning level
      this.currentSession = await this.sessionManager.createSession({
        type: 'new_project',
        planningLevel: 'Quick Start',
      })

      // Go directly to naming phase
      this.updateStatus('Getting name suggestions...')

      this.currentSession = await this.sessionManager.requestNameSuggestions(
        this.currentSession.id,
      )

      this.renderNamingPhase()
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Failed to start quick project'
      this.phase = 'error'
      this.renderErrorPhase(error)
    } finally {
      this.isLaunching = false
    }
  }

  private async handleSkipTopic() {
    if (!this.sessionManager || !this.currentSession || !this.inputEl) return

    // Clear any existing input
    this.inputEl.value = ''

    // Add a skip message that the AI will handle gracefully
    this.addMessageToUI('user', "I don't know yet, let's move on")

    try {
      this.currentSession = await this.sessionManager.sendMessage(
        this.currentSession.id,
        "I don't know yet, let's move on to the next topic",
      )

      // Stream next question
      await this.streamNextQuestion()
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Failed to skip topic'
      this.updateStatus(`Error: ${error}`)
      this.setInputEnabled(true)
    }
  }

  private async streamNextQuestion() {
    if (!this.sessionManager || !this.currentSession) return

    this.setInputEnabled(false)
    this.updateStatus('Lachesis is thinking...')

    // Add placeholder for streaming message
    this.addMessageToUI('assistant', '', true)

    try {
      this.currentSession = await this.sessionManager.streamNextQuestion(
        this.currentSession.id,
        (partial) => {
          this.streamingText = partial
          this.updateStreamingMessage(partial)
        },
      )

      this.finalizeStreamingMessage()

      // Update progress indicator with new topics
      this.updateProgressIndicator()

      // Check if we should transition to naming
      if (this.shouldTransitionToNaming()) {
        await this.transitionToNaming()
      } else {
        this.setInputEnabled(true)
        this.updateStatus('Your turn')
        this.inputEl?.focus()
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Failed to generate question'
      this.finalizeStreamingMessage()
      this.updateStatus(`Error: ${error}`)
      this.setInputEnabled(true)
    }
  }

  private async handleUserInput() {
    if (!this.sessionManager || !this.currentSession || !this.inputEl) return

    const message = this.inputEl.value.trim()
    if (!message) return

    // Clear input
    this.inputEl.value = ''

    // Add user message to UI
    this.addMessageToUI('user', message)

    // Send message to session
    try {
      this.currentSession = await this.sessionManager.sendMessage(
        this.currentSession.id,
        message,
      )

      // Stream next question
      await this.streamNextQuestion()
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Failed to send message'
      this.updateStatus(`Error: ${error}`)
      this.setInputEnabled(true)
    }
  }

  private shouldTransitionToNaming(): boolean {
    if (!this.currentSession) return false

    // Check if the last assistant message contains the transition phrase
    const lastMessage = this.currentSession.messages[this.currentSession.messages.length - 1]
    if (lastMessage?.role === 'assistant') {
      const content = lastMessage.content.toLowerCase()
      return content.includes('very well, sir. let us proceed')
    }

    return false
  }

  private async transitionToNaming() {
    if (!this.sessionManager || !this.currentSession) return

    this.updateStatus('Generating name suggestions...')

    try {
      this.currentSession = await this.sessionManager.requestNameSuggestions(
        this.currentSession.id,
      )

      this.phase = 'naming'
      this.renderNamingPhase()
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Failed to generate names'
      new Notice(`Error: ${error}`)
      // Fall back to naming phase with empty suggestions
      this.phase = 'naming'
      this.renderNamingPhase()
    }
  }

  private async selectProjectName(name: string) {
    if (!this.sessionManager || !this.currentSession) return

    const { contentEl } = this
    contentEl.empty()
    contentEl.createEl('h2', { text: 'Creating Project...' })
    const statusEl = contentEl.createEl('p', { text: 'Selecting name...' })

    try {
      // Select name
      this.currentSession = await this.sessionManager.selectProjectName(
        this.currentSession.id,
        name,
      )
      statusEl.setText('Extracting project data...')

      // Extract data
      this.currentSession = await this.sessionManager.extractProjectData(
        this.currentSession.id,
      )
      statusEl.setText('Creating project files...')

      // Scaffold
      const result = await this.sessionManager.scaffold(this.currentSession.id)

      if (result.success) {
        // Refresh session state
        this.currentSession = this.sessionManager.getSession(this.currentSession.id)
        this.phase = 'complete'
        this.renderCompletePhase()
      } else {
        throw new Error(result.error || 'Failed to create project')
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Failed to create project'
      this.phase = 'error'
      this.renderErrorPhase(error)
    }
  }
}
