/**
 * Diff Viewer Modal - Displays a single file diff with accept/reject actions
 */

import { App, Modal, Notice, TFile } from 'obsidian'
import type { DiffBlock, ParsedDiff } from '../utils/diff'
import { applyDiff } from '../utils/diff'

export type DiffAction = 'accepted' | 'rejected'

export type DiffActionCallback = (diffBlock: DiffBlock, action: DiffAction) => void

export type DiffViewerOptions = {
  viewOnly?: boolean // When true, only show "Go back" button (for saved conversations)
}

export class DiffViewerModal extends Modal {
  private diffBlock: DiffBlock
  private projectPath: string
  private onAction: DiffActionCallback
  private viewOnly: boolean

  constructor(
    app: App,
    diffBlock: DiffBlock,
    projectPath: string,
    onAction: DiffActionCallback,
    options?: DiffViewerOptions,
  ) {
    super(app)
    this.diffBlock = diffBlock
    this.projectPath = projectPath
    this.onAction = onAction
    this.viewOnly = options?.viewOnly ?? false
  }

  onOpen() {
    const { contentEl } = this
    contentEl.empty()
    // Style hook: Obsidian sizes modals via the root `.modal` element
    this.modalEl.addClass('lachesis-diff-modal-root')
    contentEl.addClass('lachesis-diff-modal')

    // Header
    const header = contentEl.createDiv({ cls: 'lachesis-diff-modal-header' })
    header.createEl('h2', { text: 'Proposed Changes' })
    header.createEl('span', {
      text: this.diffBlock.fileName,
      cls: 'lachesis-diff-modal-filename',
    })

    // Diff content
    const diffContent = contentEl.createDiv({ cls: 'lachesis-diff-modal-content' })
    this.renderDiffContent(diffContent)

    // Footer with actions
    const footer = contentEl.createDiv({ cls: 'lachesis-diff-modal-footer' })

    if (this.viewOnly) {
      // View-only mode for saved conversations - just show Go back button
      const goBackBtn = footer.createEl('button', {
        text: 'Go back',
        cls: 'lachesis-diff-modal-back-btn',
      })
      goBackBtn.addEventListener('click', () => this.close())
    } else if (this.diffBlock.status === 'pending') {
      const rejectBtn = footer.createEl('button', {
        text: 'Reject',
        cls: 'lachesis-diff-modal-reject-btn',
      })
      rejectBtn.addEventListener('click', () => this.handleReject())

      const acceptBtn = footer.createEl('button', {
        text: 'Accept Changes',
        cls: 'lachesis-diff-modal-accept-btn mod-cta',
      })
      acceptBtn.addEventListener('click', () => this.handleAccept())
    } else {
      const statusText = this.diffBlock.status === 'accepted' ? 'Changes applied' : 'Changes rejected'
      footer.createEl('span', {
        text: statusText,
        cls: `lachesis-diff-modal-status ${this.diffBlock.status}`,
      })

      const closeBtn = footer.createEl('button', {
        text: 'Close',
        cls: 'mod-cta',
      })
      closeBtn.addEventListener('click', () => this.close())
    }
  }

  private renderDiffContent(container: HTMLElement) {
    const pre = container.createEl('pre', { cls: 'lachesis-diff-modal-pre' })

    if (this.diffBlock.parsed) {
      for (const hunk of this.diffBlock.parsed.hunks) {
        // Hunk header
        pre.createEl('div', {
          cls: 'lachesis-diff-hunk-header',
          text: `@@ -${hunk.oldStart},${hunk.oldCount} +${hunk.newStart},${hunk.newCount} @@`,
        })

        // Diff lines
        for (const line of hunk.lines) {
          const prefix = line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' '
          pre.createEl('div', {
            cls: `lachesis-diff-line lachesis-diff-${line.type}`,
            text: prefix + line.content,
          })
        }
      }
    } else {
      // Fallback: show raw diff if parsing failed
      pre.setText(this.diffBlock.rawDiff)
    }
  }

  private async handleAccept() {
    if (!this.diffBlock.parsed) {
      new Notice('Cannot apply diff: parsing failed')
      return
    }

    try {
      // Get the file from vault
      const filePath = `${this.projectPath}/${this.diffBlock.fileName}`
      const abstractFile = this.app.vault.getAbstractFileByPath(filePath)

      if (!abstractFile || !(abstractFile instanceof TFile)) {
        new Notice(`File not found: ${this.diffBlock.fileName}`)
        return
      }

      // Read current content
      const currentContent = await this.app.vault.read(abstractFile)

      // Apply the diff
      const newContent = applyDiff(currentContent, this.diffBlock.parsed)

      // Write back to file
      await this.app.vault.modify(abstractFile, newContent)

      // Update status
      this.diffBlock.status = 'accepted'
      this.onAction(this.diffBlock, 'accepted')

      new Notice(`Applied changes to ${this.diffBlock.fileName}`)
      this.close()
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Failed to apply diff'
      new Notice(`Error: ${error}`)
      console.error('Diff application error:', err)
    }
  }

  private handleReject() {
    this.diffBlock.status = 'rejected'
    this.onAction(this.diffBlock, 'rejected')
    this.close()
  }

  onClose() {
    const { contentEl } = this
    contentEl.empty()
  }
}
