/**
 * Title Entry Modal - Focused modal for titling a single log entry.
 * Used by the "Title Current Entry" context menu feature.
 */

import { App, Modal, Notice } from 'obsidian'
import type LachesisPlugin from '../main'
import type { ProjectSnapshot } from '../core/project/snapshot'
import type { LogEntryAtCursor } from '../utils/log-entry-finder'
import { getProvider, isProviderAvailable } from '../ai/providers/factory'
import type { AIProvider } from '../ai/providers/types'

export class TitleEntryModal extends Modal {
  private plugin: LachesisPlugin
  private projectPath: string
  private snapshot: ProjectSnapshot
  private entryInfo: LogEntryAtCursor
  private onConfirm: (updatedTimeLine: string) => Promise<void>
  private provider: AIProvider | null = null

  // UI State
  private suggestedTitle: string | null = null
  private isProcessing = false
  private errorMessage: string | null = null

  // UI Elements
  private statusEl: HTMLElement | null = null
  private resultEl: HTMLElement | null = null
  private titleInputEl: HTMLInputElement | null = null
  private confirmBtn: HTMLButtonElement | null = null

  constructor(
    app: App,
    plugin: LachesisPlugin,
    projectPath: string,
    snapshot: ProjectSnapshot,
    entryInfo: LogEntryAtCursor,
    onConfirm: (updatedTimeLine: string) => Promise<void>
  ) {
    super(app)
    this.plugin = plugin
    this.projectPath = projectPath
    this.snapshot = snapshot
    this.entryInfo = entryInfo
    this.onConfirm = onConfirm
  }

  async onOpen() {
    const { contentEl } = this
    contentEl.empty()
    this.modalEl.addClass('lachesis-title-entry-modal-root')
    contentEl.addClass('lachesis-title-entry-modal')

    // Check provider availability
    if (!isProviderAvailable(this.plugin.settings.provider, this.plugin.settings)) {
      this.renderProviderMissing()
      return
    }

    // Create provider
    this.provider = getProvider(this.plugin.settings)

    this.render()

    // Start AI generation
    await this.generateTitle()
  }

  onClose() {
    const { contentEl } = this
    contentEl.empty()
    this.provider = null
    this.suggestedTitle = null
    this.isProcessing = false
    this.errorMessage = null
  }

  private renderProviderMissing() {
    const { contentEl } = this

    contentEl.createEl('h2', { text: 'Title Current Entry' })
    contentEl.createEl('p', {
      text: 'Please configure your AI provider API key in the plugin settings.',
      cls: 'lachesis-message-text',
    })

    const buttonContainer = contentEl.createDiv({ cls: 'lachesis-button-container' })
    const button = buttonContainer.createEl('button', {
      text: 'Close',
      cls: 'mod-cta',
    })
    button.addEventListener('click', () => this.close())
  }

  private render() {
    const { contentEl } = this
    contentEl.empty()

    // Header
    const header = contentEl.createDiv({ cls: 'lachesis-title-entry-header' })
    header.createEl('h2', { text: 'Title Current Entry' })
    if (this.entryInfo.dateHeader) {
      header.createEl('span', {
        text: this.entryInfo.dateHeader,
        cls: 'lachesis-title-entry-date',
      })
    }

    // Entry preview
    const previewContainer = contentEl.createDiv({ cls: 'lachesis-title-entry-preview' })
    previewContainer.createEl('label', { text: 'Entry content:' })
    const previewEl = previewContainer.createEl('pre', { cls: 'lachesis-title-entry-content' })
    previewEl.setText(this.entryInfo.entryContent.trim())

    // Status area
    this.statusEl = contentEl.createDiv({ cls: 'lachesis-title-entry-status' })
    this.updateStatusUI()

    // Result area
    this.resultEl = contentEl.createDiv({ cls: 'lachesis-title-entry-result' })
    this.updateResultUI()

    // Footer with actions
    const footer = contentEl.createDiv({ cls: 'lachesis-title-entry-footer' })

    const cancelBtn = footer.createEl('button', {
      text: 'Cancel',
      cls: 'lachesis-title-entry-cancel-btn',
    })
    cancelBtn.addEventListener('click', () => this.close())

    this.confirmBtn = footer.createEl('button', {
      text: 'Apply Title',
      cls: 'lachesis-title-entry-confirm-btn mod-cta',
    })
    this.confirmBtn.disabled = true
    this.confirmBtn.addEventListener('click', () => this.handleConfirm())
  }

  private updateStatusUI() {
    if (!this.statusEl) return

    this.statusEl.empty()

    if (this.isProcessing) {
      this.statusEl.createSpan({
        text: 'Generating title...',
        cls: 'lachesis-title-entry-loading',
      })
    } else if (this.errorMessage) {
      this.statusEl.createSpan({
        text: `Error: ${this.errorMessage}`,
        cls: 'lachesis-title-entry-error',
      })
    }
  }

  private updateResultUI() {
    if (!this.resultEl) return

    this.resultEl.empty()

    if (this.suggestedTitle) {
      this.resultEl.createEl('label', { text: 'Suggested title:' })

      this.titleInputEl = this.resultEl.createEl('input', {
        type: 'text',
        cls: 'lachesis-title-entry-input',
        value: this.suggestedTitle,
      })
      this.titleInputEl.style.width = '100%'

      // Enable confirm button
      if (this.confirmBtn) {
        this.confirmBtn.disabled = false
      }
    }
  }

  private async generateTitle() {
    if (!this.provider) return

    this.isProcessing = true
    this.errorMessage = null
    this.updateStatusUI()

    // Build the prompt for title generation
    const prompt = this.buildTitlePrompt()

    try {
      const result = await this.provider.generateText(
        this.buildSystemPrompt(),
        prompt
      )

      this.isProcessing = false

      if (result.success && result.content) {
        // Parse the AI response to extract the title
        const parsedTitle = this.parseAIResponse(result.content)
        if (parsedTitle) {
          this.suggestedTitle = parsedTitle
        } else {
          this.errorMessage = 'Could not parse title from AI response'
        }
      } else {
        this.errorMessage = result.error || 'Failed to generate title'
      }
    } catch (err) {
      this.isProcessing = false
      this.errorMessage = err instanceof Error ? err.message : 'Unknown error'
    }

    this.updateStatusUI()
    this.updateResultUI()
  }

  private buildSystemPrompt(): string {
    return `You are Lachesis, a project management assistant. Your task is to generate a short, descriptive title for a log entry. The title should:
- Be 1-5 words
- Capture the main topic or activity
- Be concise and informative
- Use title case

Respond with ONLY the updated timestamp line in the format:
"HH:MMam/pm - Title Here" or "HH:MM am/pm - Title Here"

If the entry covers multiple topics, use comma-separated titles like:
"10:30am - Bug Fix, Code Review"

Do not include any explanation or additional text.`
  }

  private buildTitlePrompt(): string {
    const dateContext = this.entryInfo.dateHeader
      ? `Date: ${this.entryInfo.dateHeader}\n\n`
      : ''

    return `Title this single log entry. Generate a short title (1-5 words) that captures the main topic.

${dateContext}Entry:
${this.entryInfo.entryContent}

Respond with ONLY the updated timestamp line including the title.
Format: "HH:MMam/pm - Title Here" or "HH:MM am/pm - Title Here"
Example: "10:30am - Morning Planning" or "2:15 pm - Bug Fix, Code Review"`
  }

  private parseAIResponse(response: string): string | null {
    // Clean up the response
    const trimmed = response.trim()

    // The response should be a timestamp line like "10:30am - Title Here"
    // or just the title if the AI didn't follow instructions exactly

    // Check if it looks like a full timestamp line
    const timestampPattern = /^\d{1,2}:\d{2}(?:\s*(?:am|pm))?\s*-\s*.+/i
    if (timestampPattern.test(trimmed)) {
      // Extract just the title part
      const match = trimmed.match(/^\d{1,2}:\d{2}(?:\s*(?:am|pm))?\s*-\s*(.+)/i)
      if (match) {
        return match[1].trim()
      }
    }

    // If it's just a title without timestamp, use it directly
    // But filter out anything that looks like an explanation
    const lines = trimmed.split('\n')
    const firstLine = lines[0].trim()

    // Filter out common non-title patterns
    if (
      firstLine.toLowerCase().startsWith('here') ||
      firstLine.toLowerCase().startsWith('the title') ||
      firstLine.toLowerCase().startsWith('title:') ||
      firstLine.length > 50
    ) {
      // Try to extract a quoted title
      const quoted = firstLine.match(/"([^"]+)"|'([^']+)'/)
      if (quoted) {
        return (quoted[1] || quoted[2]).trim()
      }
      return null
    }

    return firstLine
  }

  private async handleConfirm() {
    if (!this.titleInputEl) return

    const title = this.titleInputEl.value.trim()
    if (!title) {
      new Notice('Please enter a title')
      return
    }

    // Build the updated timestamp line
    const updatedLine = this.buildUpdatedTimestampLine(title)

    try {
      await this.onConfirm(updatedLine)
      new Notice(`Title applied: "${title}"`)
      this.close()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to apply title'
      new Notice(`Error: ${message}`)
    }
  }

  private buildUpdatedTimestampLine(title: string): string {
    // Get the original timestamp from the entry
    const originalLine = this.entryInfo.entry.timestampLine

    // Extract just the timestamp portion
    const timestampMatch = originalLine.match(/^(\d{1,2}:\d{2}(?:\s*(?:am|pm))?)/i)
    if (timestampMatch) {
      const timestamp = timestampMatch[1]
      return `${timestamp} - ${title}`
    }

    // Fallback: just prepend to existing line if we can't parse
    return `${originalLine} - ${title}`
  }
}
