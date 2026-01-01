// Existing Project Modal - Chat interface for continuing work on existing projects

import { App, Modal, Notice } from 'obsidian'
import type LachesisPlugin from '../main'
import type { ProjectSnapshot } from '../core/project/snapshot'
import { buildProjectSnapshot, formatProjectSnapshotForModel } from '../core/project/snapshot-builder'
import { getProvider } from '../ai/providers/factory'
import { isProviderAvailable } from '../ai/providers/factory'
import type { AIProvider, ConversationMessage } from '../ai/providers/types'
import { buildSystemPrompt } from '../ai/prompts'

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

  // DOM Elements
  private messagesContainer: HTMLElement | null = null
  private inputEl: HTMLInputElement | null = null
  private statusEl: HTMLElement | null = null

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
    contentEl.addClass('lachesis-modal')

    // Check if provider is configured
    if (!isProviderAvailable(this.plugin.settings.provider, this.plugin.settings)) {
      this.renderApiKeyMissing()
      return
    }

    // Create provider
    this.provider = getProvider(this.plugin.settings)

    // Render chat interface
    this.phase = 'chat'
    this.renderChatPhase()

    // Generate opening message
    await this.generateOpeningMessage()
  }

  onClose() {
    const { contentEl } = this
    contentEl.empty()
    this.provider = null
    this.messages = []
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

    // Header with project name
    const header = contentEl.createDiv({ cls: 'lachesis-header' })
    header.createEl('h2', { text: this.snapshot.projectName })

    // Status badge
    const statusBadge = header.createEl('span', {
      cls: `lachesis-status-badge ${this.snapshot.readiness.isReady ? 'ready' : 'needs-work'}`,
    })
    statusBadge.setText(this.snapshot.readiness.isReady ? 'Ready' : 'Needs attention')

    // Messages container
    this.messagesContainer = contentEl.createDiv({ cls: 'lachesis-messages' })

    // Render existing messages
    for (const msg of this.messages) {
      this.addMessageToUI(msg.role, msg.content)
    }

    // Input area
    const inputContainer = contentEl.createDiv({ cls: 'lachesis-input-area' })

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
    this.statusEl = contentEl.createDiv({ cls: 'lachesis-status' })
    this.updateStatus('Ready')
  }

  private addMessageToUI(role: 'assistant' | 'user', content: string, isStreaming = false) {
    if (!this.messagesContainer) return

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

    const streamingEl = this.messagesContainer.querySelector('.lachesis-message.streaming')
    if (streamingEl) {
      streamingEl.removeClass('streaming')

      // Re-render with hint styling
      const content = streamingEl.textContent || ''
      const hintMatch = this.streamingText.match(/\{\{hint\}\}([\s\S]*?)\{\{\/hint\}\}/)
      if (hintMatch) {
        const mainContent = this.streamingText.replace(/\{\{hint\}\}[\s\S]*?\{\{\/hint\}\}/, '').trim()
        streamingEl.textContent = mainContent

        const hintEl = streamingEl.createDiv({ cls: 'lachesis-hint' })
        hintEl.setText(hintMatch[1].trim())
      }
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

    // Add user message
    const userMessage: ConversationMessage = {
      role: 'user',
      content: message,
      timestamp: new Date().toISOString(),
    }
    this.messages.push(userMessage)
    this.addMessageToUI('user', message)

    // Generate response
    this.setInputEnabled(false)
    this.updateStatus('Lachesis is thinking...')
    this.addMessageToUI('assistant', '', true)

    const snapshotSummary = formatProjectSnapshotForModel(this.snapshot)

    const systemPrompt = buildSystemPrompt({
      sessionType: 'existing',
      projectName: this.snapshot.projectName,
      isFirstMessage: false,
      snapshotSummary,
    })

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
}
