// Chat Interface Component
// Handles message rendering, input, streaming, and diff display

import type { App, Component } from 'obsidian'
import { MarkdownRenderer } from 'obsidian'
import type { ConversationMessage } from '../../ai/providers/types'
import {
  extractDiffBlocks,
  containsDiffBlocks,
  type DiffBlock,
} from '../../utils/diff'
import {
  parseIdeasGroomResponse,
  containsIdeasGroomResponse,
} from '../../utils/ideas-groom-parser'
import {
  containsSyncCommitsResponse,
  extractSyncCommitsSummary,
} from '../../utils/sync-commits-parser'
import { DiffViewerModal, type DiffAction } from '../diff-viewer-modal'

// ============================================================================
// Types
// ============================================================================

export type ChatInterfaceCallbacks = {
  /** Called when user submits input */
  onSubmit: (message: string) => void
  /** Called when a diff is accepted or rejected */
  onDiffAction: (diffBlock: DiffBlock, action: DiffAction) => void
  /** Called when user clicks "View Ideas" for an ideas groom response */
  onViewIdeasGroom: (content: string) => void
  /** Called when user clicks "View Matches" for a sync-commits response */
  onViewSyncCommits: (content: string) => void
}

// ============================================================================
// Chat Interface Component
// ============================================================================

export class ChatInterface {
  private app: App
  private projectPath: string
  private callbacks: ChatInterfaceCallbacks
  private renderComponent: Component
  private isViewingLoadedChat = false

  // DOM Elements
  private messagesContainer: HTMLElement | null = null
  private inputEl: HTMLInputElement | null = null
  private statusEl: HTMLElement | null = null

  // State
  private streamingText = ''
  private pendingDiffs: DiffBlock[] = []
  private isProcessing = false

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
  }

  /**
   * Set whether we're viewing a loaded chat (affects diff view-only mode).
   */
  setViewingLoadedChat(viewing: boolean): void {
    this.isViewingLoadedChat = viewing
  }

  /**
   * Get whether we're viewing a loaded chat.
   */
  isViewingLoaded(): boolean {
    return this.isViewingLoadedChat
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
        this.addMessageToUI(msg.role, msg.content)
      }
    }

    // Input area
    const inputContainer = container.createDiv({ cls: 'lachesis-input-area' })

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
        this.addMessageToUI(msg.role, msg.content)
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
   * Add a message to the UI.
   */
  addMessageToUI(role: 'assistant' | 'user', content: string, isStreaming = false): HTMLElement | undefined {
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
    } else if (!isStreaming && containsIdeasGroomResponse(content)) {
      // Ideas groom response - render with a "View Ideas" button
      this.renderMessageWithIdeasGroom(messageEl, content)
    } else if (!isStreaming && containsSyncCommitsResponse(content)) {
      // Sync commits response - render with a "View Matches" button
      this.renderMessageWithSyncCommits(messageEl, content)
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

  /**
   * Update the streaming message with new content.
   */
  updateStreamingMessage(content: string): void {
    if (!this.messagesContainer) return

    this.streamingText = content
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
   * Finalize the streaming message (remove streaming class, re-render with diffs).
   */
  finalizeStreamingMessage(): void {
    if (!this.messagesContainer) return

    const streamingEl = this.messagesContainer.querySelector('.lachesis-message.streaming') as HTMLElement | null
    if (streamingEl) {
      streamingEl.removeClass('streaming')

      // Check if content contains special response types
      if (containsDiffBlocks(this.streamingText)) {
        // Clear and re-render with diff blocks
        streamingEl.empty()
        this.renderMessageWithDiffs(streamingEl, this.streamingText)
      } else if (containsIdeasGroomResponse(this.streamingText)) {
        // Clear and re-render with ideas groom summary
        streamingEl.empty()
        this.renderMessageWithIdeasGroom(streamingEl, this.streamingText)
      } else if (containsSyncCommitsResponse(this.streamingText)) {
        // Clear and re-render with sync commits summary
        streamingEl.empty()
        this.renderMessageWithSyncCommits(streamingEl, this.streamingText)
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

    this.streamingText = ''
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
    this.isProcessing = !enabled
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
    return this.streamingText
  }

  /**
   * Get pending diffs.
   */
  getPendingDiffs(): DiffBlock[] {
    return this.pendingDiffs
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
   * Render a message that contains diff blocks.
   * Shows a summary with clickable file links that open the diff viewer modal.
   */
  private renderMessageWithDiffs(container: HTMLElement, content: string): void {
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

  /**
   * Render a clickable file link for a diff block.
   */
  private renderDiffFileLink(container: HTMLElement, diffBlock: DiffBlock): void {
    const linkEl = container.createDiv({ cls: 'lachesis-diff-file-link' })
    diffBlock.element = linkEl

    // File icon
    const iconEl = linkEl.createSpan({ cls: 'lachesis-diff-file-icon' })
    iconEl.setText('\uD83D\uDCC4') // 📄

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
  private openDiffViewer(diffBlock: DiffBlock): void {
    const modal = new DiffViewerModal(
      this.app,
      diffBlock,
      this.projectPath,
      (updatedDiff, action) => this.handleDiffAction(updatedDiff, action),
      { viewOnly: this.isViewingLoadedChat }
    )
    modal.open()
  }

  /**
   * Handle when a diff is accepted or rejected from the viewer modal.
   */
  private handleDiffAction(diffBlock: DiffBlock, action: DiffAction): void {
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

    // Notify parent
    this.callbacks.onDiffAction(diffBlock, action)
  }

  /**
   * Render a message that contains ideas-groom JSON response.
   * Shows a summary with a "View Ideas" button that opens the modal.
   */
  private renderMessageWithIdeasGroom(container: HTMLElement, content: string): void {
    const tasks = parseIdeasGroomResponse(content)

    if (tasks.length === 0) {
      // Couldn't parse tasks, render as plain text
      this.renderMarkdown(content, container)
      return
    }

    // Render summary message
    const summaryEl = container.createDiv({ cls: 'lachesis-ideas-groom-summary' })

    const uniqueHeadings = new Set(tasks.map((t) => t.ideaHeading))
    summaryEl.createEl('p', {
      text: `Found ${tasks.length} potential task${tasks.length === 1 ? '' : 's'} from ${uniqueHeadings.size} idea${uniqueHeadings.size === 1 ? '' : 's'} in Ideas.md.`,
    })

    // View Ideas button
    const btnContainer = summaryEl.createDiv({ cls: 'lachesis-ideas-groom-button-container' })
    const viewBtn = btnContainer.createEl('button', {
      text: 'View Ideas',
      cls: 'lachesis-ideas-groom-view-btn',
    })
    viewBtn.addEventListener('click', () => {
      this.callbacks.onViewIdeasGroom(content)
    })
  }

  /**
   * Render a message that contains sync-commits JSON response.
   * Shows a summary with a "View Matches" button that opens the modal.
   */
  private renderMessageWithSyncCommits(container: HTMLElement, content: string): void {
    const summary = extractSyncCommitsSummary(content)

    if (!summary) {
      // Couldn't parse summary, render as plain text
      this.renderMarkdown(content, container)
      return
    }

    // Render summary message
    const summaryEl = container.createDiv({ cls: 'lachesis-sync-commits-summary' })

    if (summary.matchedCount > 0) {
      let summaryText = `Found ${summary.matchedCount} commit${summary.matchedCount === 1 ? '' : 's'} matching tasks`
      if (summary.highCount > 0 || summary.mediumCount > 0 || summary.lowCount > 0) {
        const parts: string[] = []
        if (summary.highCount > 0) parts.push(`${summary.highCount} high`)
        if (summary.mediumCount > 0) parts.push(`${summary.mediumCount} medium`)
        if (summary.lowCount > 0) parts.push(`${summary.lowCount} low`)
        summaryText += ` (${parts.join(', ')} confidence)`
      }
      summaryText += '.'
      summaryEl.createEl('p', { text: summaryText })
    } else {
      summaryEl.createEl('p', { text: 'No commits matched any unchecked tasks.' })
    }

    if (summary.unmatchedCount > 0) {
      summaryEl.createEl('p', {
        text: `${summary.unmatchedCount} commit${summary.unmatchedCount === 1 ? '' : 's'} did not match any task.`,
        cls: 'lachesis-sync-commits-note',
      })
    }

    // View button
    const btnContainer = summaryEl.createDiv({ cls: 'lachesis-sync-commits-button-container' })
    const btnText = summary.matchedCount > 0 ? 'View Matches' : 'View Results'
    const viewBtn = btnContainer.createEl('button', {
      text: btnText,
      cls: 'lachesis-sync-commits-view-btn',
    })
    viewBtn.addEventListener('click', () => {
      this.callbacks.onViewSyncCommits(content)
    })
  }
}
