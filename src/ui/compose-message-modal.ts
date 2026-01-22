/**
 * Compose Message Modal - Large textarea for composing multi-line messages
 *
 * Opens a modal with a larger textarea for writing multi-line messages,
 * useful when pasting text that would be condensed in the single-line input.
 */

import { App, Modal, TextAreaComponent } from 'obsidian'

export type ComposeMessageCallback = (message: string, confirmed: boolean) => void

export class ComposeMessageModal extends Modal {
  private messageContent: string
  private onSubmit: ComposeMessageCallback

  constructor(app: App, initialText: string, onSubmit: ComposeMessageCallback) {
    super(app)
    this.messageContent = initialText
    this.onSubmit = onSubmit
  }

  onOpen() {
    const { contentEl } = this
    contentEl.empty()
    this.modalEl.addClass('lachesis-compose-message-modal-root')
    contentEl.addClass('lachesis-compose-message-modal')

    // Header
    contentEl.createEl('h2', { text: 'Compose Message' })

    // Textarea
    const textareaWrapper = contentEl.createDiv({ cls: 'lachesis-compose-message-textarea-wrapper' })
    const textarea = new TextAreaComponent(textareaWrapper)
    textarea.inputEl.addClass('lachesis-compose-message-textarea')
    textarea.inputEl.rows = 10
    textarea.inputEl.placeholder = 'Compose your message...'
    textarea.setValue(this.messageContent)
    textarea.onChange((value) => {
      this.messageContent = value
    })

    // Handle Ctrl+Enter to send
    textarea.inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        this.submitMessage()
      }
    })

    // Footer
    const footer = contentEl.createDiv({ cls: 'lachesis-compose-message-footer' })

    // Hint text
    footer.createEl('span', {
      text: 'Press Ctrl + Enter to send',
      cls: 'lachesis-compose-message-hint',
    })

    // Button container
    const buttonContainer = footer.createDiv({ cls: 'lachesis-compose-message-buttons' })

    const cancelBtn = buttonContainer.createEl('button', {
      text: 'Cancel',
      cls: 'lachesis-compose-message-cancel-btn',
    })
    cancelBtn.addEventListener('click', () => {
      this.onSubmit('', false)
      this.close()
    })

    const sendBtn = buttonContainer.createEl('button', {
      text: 'Send',
      cls: 'lachesis-compose-message-send-btn mod-cta',
    })
    sendBtn.addEventListener('click', () => {
      this.submitMessage()
    })

    // Focus the textarea
    setTimeout(() => textarea.inputEl.focus(), 50)
  }

  private submitMessage(): void {
    const message = this.messageContent.trim()
    if (message) {
      this.onSubmit(message, true)
      this.close()
    }
  }

  onClose() {
    this.contentEl.empty()
  }
}
