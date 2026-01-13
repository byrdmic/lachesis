/**
 * Init from Summary Modal - Input modal for pasting design summary
 *
 * This modal collects a design summary from the user before triggering
 * the init-from-summary workflow to batch-fill project files.
 */

import { App, Modal, TextAreaComponent } from 'obsidian'

export type InitSummaryCallback = (summary: string, confirmed: boolean) => void

export class InitSummaryInputModal extends Modal {
  private summary = ''
  private onSubmit: InitSummaryCallback

  constructor(app: App, onSubmit: InitSummaryCallback) {
    super(app)
    this.onSubmit = onSubmit
  }

  onOpen() {
    const { contentEl } = this
    contentEl.empty()
    this.modalEl.addClass('lachesis-init-summary-modal-root')
    contentEl.addClass('lachesis-init-summary-modal')

    // Header
    contentEl.createEl('h2', { text: 'Initialize from Summary' })
    contentEl.createEl('p', {
      text: 'Paste your design summary from an external AI conversation or planning document. The AI will extract project details and generate Overview, Roadmap, and Tasks files.',
      cls: 'lachesis-init-summary-subtitle',
    })

    // Textarea
    const textareaWrapper = contentEl.createDiv({ cls: 'lachesis-init-summary-textarea-wrapper' })
    const textarea = new TextAreaComponent(textareaWrapper)
    textarea.inputEl.addClass('lachesis-init-summary-textarea')
    textarea.inputEl.rows = 20
    textarea.inputEl.placeholder = `Paste your project summary here...

Include as much as possible:
- Project description / elevator pitch
- Problem being solved
- Target users
- Features / milestones / phases
- Specific tasks or TODOs
- Constraints (time, tech, etc.)

The more detail you provide, the better the generated files will be.`

    const wordCountEl = contentEl.createEl('p', {
      text: '0 words',
      cls: 'lachesis-init-summary-word-count',
    })

    textarea.onChange((value) => {
      this.summary = value
      this.updateWordCount(wordCountEl, value)
    })

    // Footer
    const footer = contentEl.createDiv({ cls: 'lachesis-init-summary-footer' })

    const cancelBtn = footer.createEl('button', {
      text: 'Cancel',
      cls: 'lachesis-init-summary-cancel-btn',
    })
    cancelBtn.addEventListener('click', () => {
      this.onSubmit('', false)
      this.close()
    })

    const analyzeBtn = footer.createEl('button', {
      text: 'Analyze & Generate',
      cls: 'lachesis-init-summary-analyze-btn mod-cta',
    })
    analyzeBtn.addEventListener('click', () => {
      if (this.summary.trim().length > 50) {
        this.onSubmit(this.summary, true)
        this.close()
      }
    })

    // Focus the textarea
    setTimeout(() => textarea.inputEl.focus(), 50)
  }

  private updateWordCount(el: HTMLElement, text: string): void {
    const words = text
      .trim()
      .split(/\s+/)
      .filter((w) => w.length > 0).length
    el.setText(`${words} word${words === 1 ? '' : 's'}`)
  }

  onClose() {
    this.contentEl.empty()
  }
}
