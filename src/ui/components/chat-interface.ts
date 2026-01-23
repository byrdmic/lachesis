// Chat Interface View Component
// Handles message rendering, input, streaming, and tool activity display

import type { App, Component } from 'obsidian'
import { MarkdownRenderer } from 'obsidian'
import type { ConversationMessage, ToolActivity, EnhancedToolActivity, PersistedToolActivity } from '../../ai/providers/types'
import {
  containsEnrichTasksResponse,
  extractEnrichTasksSummary,
} from '../../utils/enrich-tasks-parser'
import {
  containsPlanWorkResponse,
  extractPlanWorkSummary,
} from '../../utils/plan-work-parser'
import { ComposeMessageModal } from '../compose-message-modal'
import {
  ChatState,
  type ChatInterfaceCallbacks,
} from './chat-state'

// Re-export types for consumers
export type { ChatInterfaceCallbacks } from './chat-state'

// ============================================================================
// Tool Activity Tracking Types
// ============================================================================

type ActiveToolActivity = {
  id: string
  element: HTMLElement
  timerInterval?: ReturnType<typeof setInterval>
  startedAt: number
}

// ============================================================================
// Chat Interface View Component
// ============================================================================

export class ChatInterface {
  private app: App
  private projectPath: string
  private callbacks: ChatInterfaceCallbacks
  private renderComponent: Component
  private state: ChatState

  // DOM Elements
  private messagesContainer: HTMLElement | null = null
  private inputEl: HTMLInputElement | null = null
  private statusEl: HTMLElement | null = null
  private toolActivityEl: HTMLElement | null = null
  private toolActivitiesContainer: HTMLElement | null = null
  private planningModeIndicator: HTMLElement | null = null

  // Active tool activities tracking (for live updates)
  private activeToolActivities: Map<string, ActiveToolActivity> = new Map()

  constructor(
    app: App,
    projectPath: string,
    callbacks: ChatInterfaceCallbacks,
    renderComponent: Component,
  ) {
    this.app = app
    this.projectPath = projectPath
    this.callbacks = callbacks
    this.renderComponent = renderComponent
    this.state = new ChatState()
  }

  /**
   * Set whether we're viewing a loaded chat.
   */
  setViewingLoadedChat(viewing: boolean): void {
    this.state.setViewingLoadedChat(viewing)
  }

  /**
   * Set the active workflow name (used to customize rendering behavior).
   */
  setActiveWorkflow(workflowName: string | null): void {
    this.state.setActiveWorkflow(workflowName)
  }

  /**
   * Set planning mode and update UI.
   */
  setPlanningMode(enabled: boolean): void {
    this.state.setPlanningMode(enabled)
    this.updatePlanningModeUI()
  }

  /**
   * Get planning mode state.
   */
  isPlanningMode(): boolean {
    return this.state.planningMode
  }

  /**
   * Update the planning mode UI elements.
   */
  private updatePlanningModeUI(): void {
    const enabled = this.state.planningMode

    // Update input placeholder
    if (this.inputEl) {
      this.inputEl.placeholder = enabled
        ? 'Brainstorm your next milestones...'
        : 'Ask about the project or request changes...'
    }

    // Update planning mode indicator
    if (this.planningModeIndicator) {
      if (enabled) {
        this.planningModeIndicator.removeClass('hidden')
      } else {
        this.planningModeIndicator.addClass('hidden')
      }
    }
  }

  /**
   * Get whether we're viewing a loaded chat.
   */
  isViewingLoaded(): boolean {
    return this.state.isViewingLoadedChat
  }

  /**
   * Render the chat interface into the container.
   */
  render(
    container: HTMLElement,
    messages: ConversationMessage[],
    projectName: string,
    isReady: boolean,
  ): void {
    // Messages container
    this.messagesContainer = container.createDiv({ cls: 'lachesis-messages' })

    // Render existing messages
    if (messages.length === 0) {
      this.renderEmptyState(projectName, isReady)
    } else {
      for (const msg of messages) {
        this.addMessageToUI(msg.role, msg.content, false, msg.toolActivities)
      }
    }

    // Input area
    const inputContainer = container.createDiv({ cls: 'lachesis-input-area' })

    // Planning mode indicator (hidden by default)
    this.planningModeIndicator = inputContainer.createDiv({
      cls: 'lachesis-planning-mode-indicator hidden',
      text: 'Planning Mode',
    })

    this.inputEl = inputContainer.createEl('input', {
      type: 'text',
      placeholder: this.state.planningMode
        ? 'Brainstorm your next milestones...'
        : 'Ask about the project or request changes...',
      cls: 'lachesis-input',
    })

    this.inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !this.state.isProcessing) {
        e.preventDefault()
        this.handleUserInput()
      }
    })

    // Expand button to open compose modal
    const expandButton = inputContainer.createEl('button', {
      cls: 'lachesis-expand-button',
      attr: { 'aria-label': 'Expand input' },
    })
    expandButton.setText('↗')
    expandButton.addEventListener('click', () => {
      this.openComposeModal()
    })

    const sendButton = inputContainer.createEl('button', {
      text: 'Send',
      cls: 'lachesis-send-button',
    })
    sendButton.addEventListener('click', () => {
      if (!this.state.isProcessing) {
        this.handleUserInput()
      }
    })

    // Status bar
    this.statusEl = container.createDiv({ cls: 'lachesis-status' })
    this.updateStatus('Ready')
  }

  /**
   * Clear the messages container and re-render with new messages.
   */
  refresh(messages: ConversationMessage[], projectName: string, isReady: boolean): void {
    if (!this.messagesContainer) return

    this.messagesContainer.empty()

    if (messages.length === 0) {
      this.renderEmptyState(projectName, isReady)
    } else {
      for (const msg of messages) {
        this.addMessageToUI(msg.role, msg.content, false, msg.toolActivities)
      }
    }
  }

  /**
   * Handle user input from the text field.
   */
  private handleUserInput(): void {
    if (!this.inputEl) return

    const message = this.inputEl.value.trim()
    if (!message) return

    // Clear input
    this.inputEl.value = ''

    // Notify parent
    this.callbacks.onSubmit(message)
  }

  /**
   * Open the compose message modal for multi-line input.
   */
  private openComposeModal(): void {
    const currentText = this.inputEl?.value || ''
    new ComposeMessageModal(this.app, currentText, (message, confirmed) => {
      if (confirmed && message.trim()) {
        // Clear the input field since message is being sent
        if (this.inputEl) {
          this.inputEl.value = ''
        }
        this.callbacks.onSubmit(message)
      }
    }).open()
  }

  /**
   * Add a message to the UI.
   * Supports optional tool activities for messages loaded from history.
   */
  addMessageToUI(
    role: 'assistant' | 'user',
    content: string,
    isStreaming = false,
    toolActivities?: PersistedToolActivity[],
  ): HTMLElement | undefined {
    if (!this.messagesContainer) return

    // Remove empty state if present
    const emptyState = this.messagesContainer.querySelector('.lachesis-empty-state-wrapper')
    if (emptyState) {
      emptyState.remove()
    }

    const messageEl = this.messagesContainer.createDiv({
      cls: `lachesis-message ${role} ${isStreaming ? 'streaming' : ''}`,
    })

    // Show thinking indicator for empty streaming messages
    if (isStreaming && !content) {
      const thinkingEl = messageEl.createDiv({ cls: 'lachesis-thinking-indicator' })
      thinkingEl.createSpan({ cls: 'lachesis-thinking-dot' })
      thinkingEl.createSpan({ cls: 'lachesis-thinking-dot' })
      thinkingEl.createSpan({ cls: 'lachesis-thinking-dot' })
    }

    // For non-streaming messages, check for special response types
    if (!isStreaming && containsEnrichTasksResponse(content)) {
      // Enrich tasks response - render with a "View Enrichments" button
      this.renderMessageWithEnrichTasks(messageEl, content)
    } else if (!isStreaming && containsPlanWorkResponse(content)) {
      // Plan work response - render with a "View Tasks" button
      this.renderMessageWithPlanWork(messageEl, content)
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

    // Render persisted tool activities for assistant messages from history
    if (!isStreaming && role === 'assistant' && toolActivities && toolActivities.length > 0) {
      this.renderPersistedToolActivities(messageEl, toolActivities)
    }

    // Scroll to bottom
    this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight

    return messageEl
  }

  /**
   * Update the streaming message with new content.
   */
  updateStreamingMessage(content: string): void {
    if (!this.messagesContainer) return

    this.state.setStreamingText(content)
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

  /**
   * Finalize the streaming message (remove streaming class, re-render).
   */
  finalizeStreamingMessage(): void {
    if (!this.messagesContainer) return

    const streamingEl = this.messagesContainer.querySelector('.lachesis-message.streaming') as HTMLElement | null
    if (streamingEl) {
      streamingEl.removeClass('streaming')

      const streamingText = this.state.streamingText

      // Check if content contains special response types
      if (containsEnrichTasksResponse(streamingText)) {
        // Clear and re-render with enrich tasks summary
        streamingEl.empty()
        this.renderMessageWithEnrichTasks(streamingEl, streamingText)
      } else if (containsPlanWorkResponse(streamingText)) {
        // Clear and re-render with plan work summary
        streamingEl.empty()
        this.renderMessageWithPlanWork(streamingEl, streamingText)
      } else {
        // Re-render with markdown + hint styling
        streamingEl.empty()
        const hintMatch = streamingText.match(/\{\{hint\}\}([\s\S]*?)\{\{\/hint\}\}/)
        if (hintMatch) {
          const mainContent = streamingText.replace(/\{\{hint\}\}[\s\S]*?\{\{\/hint\}\}/, '').trim()
          if (mainContent) {
            this.renderMarkdown(mainContent, streamingEl)
          }

          const hintEl = streamingEl.createDiv({ cls: 'lachesis-hint' })
          const hintContent = hintMatch[1].trim()
          if (hintContent) {
            this.renderMarkdown(hintContent, hintEl)
          }
        } else if (streamingText) {
          this.renderMarkdown(streamingText, streamingEl)
        }
      }
    }

    this.state.clearStreamingText()
  }

  /**
   * Update the status bar.
   */
  updateStatus(status: string): void {
    if (this.statusEl) {
      this.statusEl.setText(status)
    }
  }

  /**
   * Set input enabled/disabled state.
   */
  setInputEnabled(enabled: boolean): void {
    if (this.inputEl) {
      this.inputEl.disabled = !enabled
    }
    this.state.setProcessing(!enabled)
  }

  /**
   * Focus the input element.
   */
  focusInput(): void {
    this.inputEl?.focus()
  }

  /**
   * Get the current streaming text.
   */
  getStreamingText(): string {
    return this.state.streamingText
  }

  /**
   * Get the underlying state object (for advanced use cases).
   */
  getState(): ChatState {
    return this.state
  }

  /**
   * Show tool activity indicator (e.g., when Agent SDK is using a tool).
   * This is the basic version for backward compatibility.
   */
  showToolActivity(activity: ToolActivity): void {
    if (!this.messagesContainer) return

    // Ensure container exists
    this.ensureToolActivitiesContainer()

    // Generate a simple ID based on tool name and status
    const activityId = `${activity.toolName}-${Date.now()}`

    if (activity.status === 'running') {
      // Create new activity element
      const activityEl = this.createToolActivityElement(
        activityId,
        activity.toolName,
        this.generateBasicDescription(activity),
        'running',
      )

      // Track it
      this.activeToolActivities.set(activityId, {
        id: activityId,
        element: activityEl,
        startedAt: Date.now(),
        timerInterval: this.startTimer(activityEl, Date.now()),
      })
    } else {
      // Find and update the most recent activity for this tool
      const existingKey = Array.from(this.activeToolActivities.keys())
        .reverse()
        .find((key) => key.startsWith(activity.toolName + '-'))

      if (existingKey) {
        const existing = this.activeToolActivities.get(existingKey)!
        this.updateToolActivityElement(
          existing.element,
          activity.status,
          this.generateBasicSummaryFromOutput(activity),
          existing.startedAt,
        )
        if (existing.timerInterval) {
          clearInterval(existing.timerInterval)
        }
        this.activeToolActivities.delete(existingKey)
      }
    }

    // Scroll to show the activity indicator
    this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight
  }

  /**
   * Show enhanced tool activity with rich details.
   */
  showEnhancedToolActivity(activity: EnhancedToolActivity): void {
    if (!this.messagesContainer) return

    // Ensure container exists
    this.ensureToolActivitiesContainer()

    const existing = this.activeToolActivities.get(activity.id)

    if (activity.status === 'running' && !existing) {
      // Create new activity element with phase
      const activityEl = this.createToolActivityElement(
        activity.id,
        activity.toolName,
        activity.description,
        'running',
        activity.phase,
      )

      // Track it with timer
      this.activeToolActivities.set(activity.id, {
        id: activity.id,
        element: activityEl,
        startedAt: activity.startedAt,
        timerInterval: this.startTimer(activityEl, activity.startedAt),
      })
    } else if (existing && activity.status === 'running') {
      // Handle phase transition (starting → executing)
      this.updateToolActivityPhase(existing.element, activity.phase)
    } else if (existing && activity.status !== 'running') {
      // Update existing element - use durationMs for accurate final duration
      const summary = this.generateSummary(activity)
      this.updateToolActivityElement(
        existing.element,
        activity.status,
        summary,
        activity.durationMs ?? (Date.now() - existing.startedAt),
        activity.toolName === 'Edit' ? (activity.input.diff as string | undefined) : undefined,
      )

      // Clear timer
      if (existing.timerInterval) {
        clearInterval(existing.timerInterval)
      }
      this.activeToolActivities.delete(activity.id)
    }

    // Scroll to show the activity
    this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight
  }

  /**
   * Clear all tool activity indicators and stop timers.
   */
  clearToolActivity(): void {
    // Clear legacy element
    if (this.toolActivityEl) {
      this.toolActivityEl.remove()
      this.toolActivityEl = null
    }

    // Stop all timers
    for (const activity of this.activeToolActivities.values()) {
      if (activity.timerInterval) {
        clearInterval(activity.timerInterval)
      }
    }
    this.activeToolActivities.clear()

    // Remove container
    if (this.toolActivitiesContainer) {
      this.toolActivitiesContainer.remove()
      this.toolActivitiesContainer = null
    }
  }

  /**
   * Finalize tool activities by migrating them to the last assistant message.
   * This creates a persistent log of activities instead of removing them.
   */
  finalizeToolActivities(): void {
    if (!this.toolActivitiesContainer || !this.messagesContainer) return

    // Find last assistant message
    const messages = this.messagesContainer.querySelectorAll('.lachesis-message.assistant')
    const lastMessage = messages[messages.length - 1]

    // Stop all timers
    for (const activity of this.activeToolActivities.values()) {
      if (activity.timerInterval) {
        clearInterval(activity.timerInterval)
      }
    }
    this.activeToolActivities.clear()

    // Check if there are any activities to persist
    const activityList = this.toolActivitiesContainer.querySelector('.lachesis-tool-activities-list')
    const hasActivities = activityList && activityList.children.length > 0

    if (lastMessage && hasActivities) {
      // Move container into message (it becomes the persistent log)
      this.toolActivitiesContainer.addClass('finalized')

      // Update header to show count
      const header = this.toolActivitiesContainer.querySelector('.lachesis-tool-activities-header')
      if (header && activityList) {
        const count = activityList.children.length
        header.textContent = `${count} tool${count === 1 ? '' : 's'} used`
      }

      lastMessage.appendChild(this.toolActivitiesContainer)
    } else {
      // No activities or no message to attach to - just remove
      this.toolActivitiesContainer.remove()
    }

    this.toolActivitiesContainer = null
  }

  /**
   * Render tool activities on the last assistant message in the container.
   * Used after finalizing a streaming message to add tool activity display.
   */
  renderToolActivitiesOnLastMessage(activities: PersistedToolActivity[]): void {
    if (!this.messagesContainer || !activities || activities.length === 0) return

    // Find the last assistant message
    const messages = this.messagesContainer.querySelectorAll('.lachesis-message.assistant')
    const lastMessage = messages[messages.length - 1]
    if (!lastMessage) return

    this.renderPersistedToolActivities(lastMessage as HTMLElement, activities)
  }

  /**
   * Render persisted tool activities inline with a message.
   */
  renderPersistedToolActivities(container: HTMLElement, activities: PersistedToolActivity[]): void {
    if (!activities || activities.length === 0) return

    const wrapper = container.createDiv({ cls: 'lachesis-persisted-tool-activities' })
    wrapper.createDiv({
      text: `${activities.length} tool${activities.length === 1 ? '' : 's'} used`,
      cls: 'lachesis-persisted-tool-activities-header',
    })

    for (const activity of activities) {
      const activityEl = wrapper.createDiv({
        cls: `lachesis-persisted-tool-activity ${activity.status}`,
      })

      // Icon
      const iconEl = activityEl.createSpan({ cls: 'lachesis-persisted-tool-activity-icon' })
      iconEl.setText(activity.status === 'completed' ? '✓' : '✗')

      // Info container
      const infoEl = activityEl.createDiv({ cls: 'lachesis-persisted-tool-activity-info' })
      infoEl.createDiv({
        text: activity.description,
        cls: 'lachesis-persisted-tool-activity-description',
      })
      infoEl.createDiv({
        text: activity.summary,
        cls: 'lachesis-persisted-tool-activity-summary',
      })

      // Duration
      activityEl.createDiv({
        text: this.formatDuration(activity.durationMs),
        cls: 'lachesis-persisted-tool-activity-duration',
      })

      // Diff preview for Edit tools
      if (activity.changeDetails?.diffPreview) {
        const toggleEl = infoEl.createDiv({
          text: 'Show diff',
          cls: 'lachesis-tool-activity-diff-toggle',
        })
        const previewEl = infoEl.createDiv({
          cls: 'lachesis-tool-activity-diff-preview collapsed',
        })
        previewEl.setText(activity.changeDetails.diffPreview)

        toggleEl.addEventListener('click', () => {
          const isCollapsed = previewEl.hasClass('collapsed')
          if (isCollapsed) {
            previewEl.removeClass('collapsed')
            toggleEl.setText('Hide diff')
          } else {
            previewEl.addClass('collapsed')
            toggleEl.setText('Show diff')
          }
        })
      }
    }
  }

  // ============================================================================
  // Tool Activity Private Methods
  // ============================================================================

  private ensureToolActivitiesContainer(): void {
    if (!this.toolActivitiesContainer && this.messagesContainer) {
      this.toolActivitiesContainer = this.messagesContainer.createDiv({
        cls: 'lachesis-tool-activities-container',
      })

      // Add collapsible header
      const header = this.toolActivitiesContainer.createDiv({
        cls: 'lachesis-tool-activities-header',
        text: 'Tools',
      })
      header.addEventListener('click', () => {
        if (this.toolActivitiesContainer) {
          const isCollapsed = this.toolActivitiesContainer.hasClass('collapsed')
          this.toolActivitiesContainer.toggleClass('collapsed', !isCollapsed)
        }
      })

      // Activity list
      this.toolActivitiesContainer.createDiv({
        cls: 'lachesis-tool-activities-list',
      })
    }
  }

  private createToolActivityElement(
    id: string,
    toolName: string,
    description: string,
    status: 'running' | 'completed' | 'failed',
    phase?: 'starting' | 'executing',
  ): HTMLElement {
    // Find the list container within the activities container
    const listContainer = this.toolActivitiesContainer?.querySelector('.lachesis-tool-activities-list')
    const container = listContainer || this.toolActivitiesContainer || this.messagesContainer
    if (!container) throw new Error('No container for tool activity')

    // Build class list with optional phase
    const classes = [`lachesis-tool-activity`, status]
    if (phase) classes.push(phase)

    const activityEl = (container as HTMLElement).createDiv({
      cls: classes.join(' '),
      attr: { 'data-activity-id': id },
    })

    // Icon - use phase-appropriate animation
    const iconEl = activityEl.createSpan({ cls: 'lachesis-tool-activity-icon' })
    if (status === 'running') {
      iconEl.addClass(phase === 'starting' ? 'pulsing' : 'spinning')
      iconEl.setText('⚙')
    } else if (status === 'completed') {
      iconEl.setText('✓')
    } else {
      iconEl.setText('✗')
    }

    // Content area
    const contentEl = activityEl.createDiv({ cls: 'lachesis-tool-activity-content' })
    contentEl.createDiv({
      text: description,
      cls: 'lachesis-tool-activity-description',
    })

    // Status text for running activities
    if (status === 'running') {
      contentEl.createDiv({
        text: phase === 'starting' ? 'Starting...' : 'Working...',
        cls: 'lachesis-tool-activity-status-text',
      })
    }

    // Timer
    activityEl.createDiv({
      text: '0.0s',
      cls: 'lachesis-tool-activity-timer',
    })

    return activityEl
  }

  /**
   * Update phase of a running tool activity (starting → executing).
   */
  private updateToolActivityPhase(element: HTMLElement, phase?: 'starting' | 'executing'): void {
    // Remove old phase classes
    element.removeClass('starting')
    element.removeClass('executing')

    // Add new phase class
    if (phase) {
      element.addClass(phase)
    }

    // Update icon animation
    const iconEl = element.querySelector('.lachesis-tool-activity-icon')
    if (iconEl) {
      iconEl.removeClass('pulsing')
      iconEl.removeClass('spinning')
      iconEl.addClass(phase === 'starting' ? 'pulsing' : 'spinning')
    }

    // Update status text
    const statusTextEl = element.querySelector('.lachesis-tool-activity-status-text')
    if (statusTextEl) {
      statusTextEl.textContent = phase === 'starting' ? 'Starting...' : 'Working...'
    }
  }

  private updateToolActivityElement(
    element: HTMLElement,
    status: 'completed' | 'failed',
    summary: string,
    durationMs: number,
    diffPreview?: string,
  ): void {
    // Update class - remove running and phase classes
    element.removeClass('running')
    element.removeClass('starting')
    element.removeClass('executing')
    element.addClass(status)

    // Update icon - remove all animations
    const iconEl = element.querySelector('.lachesis-tool-activity-icon')
    if (iconEl) {
      iconEl.removeClass('spinning')
      iconEl.removeClass('pulsing')
      iconEl.textContent = status === 'completed' ? '✓' : '✗'
    }

    // Remove status text (no longer running)
    const statusTextEl = element.querySelector('.lachesis-tool-activity-status-text')
    if (statusTextEl) {
      statusTextEl.remove()
    }

    // Add summary
    const contentEl = element.querySelector('.lachesis-tool-activity-content')
    if (contentEl) {
      const existingSummary = contentEl.querySelector('.lachesis-tool-activity-summary')
      if (!existingSummary) {
        const summaryEl = createDiv({ cls: 'lachesis-tool-activity-summary' })
        summaryEl.setText(summary)
        contentEl.appendChild(summaryEl)
      }

      // Add diff preview toggle for Edit tools
      if (diffPreview) {
        const toggleEl = createDiv({
          cls: 'lachesis-tool-activity-diff-toggle',
          text: 'Show diff',
        })
        const previewEl = createDiv({
          cls: 'lachesis-tool-activity-diff-preview collapsed',
        })
        previewEl.setText(diffPreview)

        toggleEl.addEventListener('click', () => {
          const isCollapsed = previewEl.hasClass('collapsed')
          if (isCollapsed) {
            previewEl.removeClass('collapsed')
            toggleEl.setText('Hide diff')
          } else {
            previewEl.addClass('collapsed')
            toggleEl.setText('Show diff')
          }
        })

        contentEl.appendChild(toggleEl)
        contentEl.appendChild(previewEl)
      }
    }

    // Update timer with final duration (use durationMs directly, not recalculated)
    const timerEl = element.querySelector('.lachesis-tool-activity-timer')
    if (timerEl) {
      timerEl.textContent = this.formatDuration(durationMs)
    }
  }

  private startTimer(element: HTMLElement, startedAt: number): ReturnType<typeof setInterval> {
    // Query the timer element inside the interval callback to handle DOM attachment race conditions
    return setInterval(() => {
      const timerEl = element.querySelector('.lachesis-tool-activity-timer')
      if (timerEl) {
        timerEl.textContent = this.formatDuration(Date.now() - startedAt)
      }
    }, 100)
  }

  private formatDuration(ms: number): string {
    if (ms < 1000) {
      return `${(ms / 1000).toFixed(1)}s`
    }
    if (ms < 60000) {
      return `${(ms / 1000).toFixed(1)}s`
    }
    const minutes = Math.floor(ms / 60000)
    const seconds = ((ms % 60000) / 1000).toFixed(0)
    return `${minutes}m ${seconds}s`
  }

  private generateBasicDescription(activity: ToolActivity): string {
    const input = activity.input || {}
    switch (activity.toolName) {
      case 'Read':
        return `Reading ${this.extractFileName(input.file_path as string | undefined)}`
      case 'Write':
        return `Writing to ${this.extractFileName(input.file_path as string | undefined)}`
      case 'Edit':
        return `Editing ${this.extractFileName(input.file_path as string | undefined)}`
      case 'Glob':
        return `Finding files matching ${input.pattern || 'pattern'}`
      case 'Grep':
        return `Searching for '${input.pattern || 'pattern'}'`
      default:
        return `Running ${activity.toolName}`
    }
  }

  private generateSummary(activity: EnhancedToolActivity): string {
    if (activity.error) {
      return `Failed: ${activity.error.slice(0, 50)}`
    }
    switch (activity.toolName) {
      case 'Read': {
        const len = activity.output?.length ?? 0
        return `Read ${this.formatNumber(len)} chars`
      }
      case 'Write': {
        const len = (activity.input.content as string)?.length ?? 0
        return `Wrote ${this.formatNumber(len)} chars`
      }
      case 'Edit':
        return 'Edit applied'
      case 'Glob': {
        const count = activity.output?.split('\n').filter((l) => l.trim()).length ?? 0
        return `Found ${count} file${count === 1 ? '' : 's'}`
      }
      case 'Grep': {
        const count = activity.output?.split('\n').filter((l) => l.trim()).length ?? 0
        return `Found ${count} match${count === 1 ? '' : 'es'}`
      }
      default:
        return 'Completed'
    }
  }

  /**
   * Generate a condensed summary from basic ToolActivity (used by backward-compatible showToolActivity).
   */
  private generateBasicSummaryFromOutput(activity: ToolActivity): string {
    if (!activity.output) return 'Completed'
    const len = activity.output.length
    switch (activity.toolName) {
      case 'Read':
        return `Read ${this.formatNumber(len)} chars`
      case 'Write':
        return `Wrote ${this.formatNumber(len)} chars`
      case 'Edit':
        return 'Edit applied'
      case 'Glob': {
        const count = activity.output.split('\n').filter((l) => l.trim()).length
        return `Found ${count} file${count === 1 ? '' : 's'}`
      }
      case 'Grep': {
        const count = activity.output.split('\n').filter((l) => l.trim()).length
        return `Found ${count} match${count === 1 ? '' : 'es'}`
      }
      default:
        return 'Completed'
    }
  }

  private extractFileName(filePath: string | undefined): string {
    if (!filePath) return 'file'
    const parts = filePath.replace(/\\/g, '/').split('/')
    return parts[parts.length - 1] || filePath
  }

  private formatNumber(num: number): string {
    if (num >= 1000) {
      return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'k'
    }
    return num.toString()
  }

  // ============================================================================
  // Private Rendering Methods
  // ============================================================================

  /**
   * Render markdown content into a container.
   */
  private renderMarkdown(content: string, container: HTMLElement): void {
    MarkdownRenderer.render(
      this.app,
      content,
      container,
      '',
      this.renderComponent
    )
  }

  /**
   * Render the empty state when no messages exist.
   */
  private renderEmptyState(projectName: string, isReady: boolean): void {
    if (!this.messagesContainer) return

    const wrapper = this.messagesContainer.createDiv({ cls: 'lachesis-empty-state-wrapper' })

    wrapper.createEl('div', {
      text: projectName,
      cls: 'lachesis-empty-state-title',
    })

    const subtitle = isReady
      ? 'Project is ready for workflows.'
      : 'Project needs attention.'

    wrapper.createEl('div', {
      text: subtitle,
      cls: 'lachesis-empty-state-subtitle',
    })
  }

  /**
   * Render a message for enrich-tasks workflow.
   * Shows a summary with a "View Enrichments" button that opens the modal.
   */
  private renderMessageWithEnrichTasks(container: HTMLElement, content: string): void {
    const summary = extractEnrichTasksSummary(content)

    // Render summary message
    const summaryEl = container.createDiv({ cls: 'lachesis-enrich-tasks-summary' })

    if (summary && summary.tasksEnriched > 0) {
      let summaryText = `Generated enrichments for ${summary.tasksEnriched} task${summary.tasksEnriched === 1 ? '' : 's'}`
      if (summary.tasksSkipped > 0) {
        summaryText += ` (${summary.tasksSkipped} skipped)`
      }
      summaryText += '.'
      summaryEl.createEl('p', { text: summaryText })

      if (summary.skipReasons.length > 0) {
        summaryEl.createEl('p', {
          text: `Skip reasons: ${summary.skipReasons.join(', ')}`,
          cls: 'lachesis-enrich-tasks-note',
        })
      }
    } else {
      summaryEl.createEl('p', { text: 'No tasks found to enrich.' })
    }

    // View button
    const btnContainer = summaryEl.createDiv({ cls: 'lachesis-enrich-tasks-button-container' })
    const viewBtn = btnContainer.createEl('button', {
      text: 'View Enrichments',
      cls: 'lachesis-enrich-tasks-view-btn',
    })
    viewBtn.addEventListener('click', () => {
      this.callbacks.onViewEnrichTasks(content)
    })
  }

  /**
   * Render a message for plan-work workflow.
   * Shows a summary with a "View Tasks" button that opens the modal.
   */
  private renderMessageWithPlanWork(container: HTMLElement, content: string): void {
    const summary = extractPlanWorkSummary(content)

    // Render summary message
    const summaryEl = container.createDiv({ cls: 'lachesis-plan-work-summary' })

    if (summary && summary.tasksGenerated > 0) {
      let summaryText = `Generated ${summary.tasksGenerated} task${summary.tasksGenerated === 1 ? '' : 's'}`
      if (summary.existingSlicesLinked > 0) {
        summaryText += ` (${summary.existingSlicesLinked} linked to existing slices)`
      }
      if (summary.newSlicesSuggested > 0) {
        summaryText += `, ${summary.newSlicesSuggested} new slice${summary.newSlicesSuggested === 1 ? '' : 's'} suggested`
      }
      summaryText += '.'
      summaryEl.createEl('p', { text: summaryText })

      if (summary.notes) {
        summaryEl.createEl('p', {
          text: summary.notes,
          cls: 'lachesis-plan-work-note',
        })
      }
    } else {
      summaryEl.createEl('p', { text: 'No tasks generated.' })
    }

    // View button
    const btnContainer = summaryEl.createDiv({ cls: 'lachesis-plan-work-button-container' })
    const viewBtn = btnContainer.createEl('button', {
      text: 'View Tasks',
      cls: 'lachesis-plan-work-view-btn',
    })
    viewBtn.addEventListener('click', () => {
      this.callbacks.onViewPlanWork(content)
    })
  }
}
