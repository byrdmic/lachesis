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
  private hunkSelections: Map<number, boolean> = new Map()
  private acceptBtn: HTMLButtonElement | null = null

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

    // Initialize all hunks as selected by default
    if (this.diffBlock.parsed) {
      this.diffBlock.parsed.hunks.forEach((_, idx) => {
        this.hunkSelections.set(idx, true)
      })
    }

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

      this.acceptBtn = footer.createEl('button', {
        text: 'Accept Changes',
        cls: 'lachesis-diff-modal-accept-btn mod-cta',
      })
      this.acceptBtn.addEventListener('click', () => this.handleAccept())
      this.updateAcceptButton()
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
    if (this.diffBlock.parsed) {
      const hunks = this.diffBlock.parsed.hunks
      const showCheckboxes = !this.viewOnly && this.diffBlock.status === 'pending' && hunks.length > 1

      for (let idx = 0; idx < hunks.length; idx++) {
        const hunk = hunks[idx]
        const hunkContainer = container.createDiv({ cls: 'lachesis-diff-hunk-container' })

        // Checkbox row (only show if multiple hunks and not view-only)
        if (showCheckboxes) {
          const checkboxRow = hunkContainer.createDiv({ cls: 'lachesis-diff-hunk-checkbox-row' })
          const checkbox = checkboxRow.createEl('input', {
            type: 'checkbox',
            cls: 'lachesis-diff-hunk-checkbox',
          })
          checkbox.checked = this.hunkSelections.get(idx) ?? true
          checkbox.dataset.hunkIdx = String(idx)
          checkbox.addEventListener('change', () => this.handleHunkToggle(idx, checkbox.checked, hunkContainer))

          checkboxRow.createEl('span', {
            cls: 'lachesis-diff-hunk-header',
            text: `@@ -${hunk.oldStart},${hunk.oldCount} +${hunk.newStart},${hunk.newCount} @@`,
          })
        }

        // Diff content
        const pre = hunkContainer.createEl('pre', { cls: 'lachesis-diff-modal-pre' })

        // Hunk header (only if not already shown with checkbox)
        if (!showCheckboxes) {
          pre.createEl('div', {
            cls: 'lachesis-diff-hunk-header',
            text: `@@ -${hunk.oldStart},${hunk.oldCount} +${hunk.newStart},${hunk.newCount} @@`,
          })
        }

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
      const pre = container.createEl('pre', { cls: 'lachesis-diff-modal-pre' })
      pre.setText(this.diffBlock.rawDiff)
    }
  }

  private handleHunkToggle(idx: number, checked: boolean, container: HTMLElement) {
    this.hunkSelections.set(idx, checked)
    container.toggleClass('lachesis-diff-hunk-deselected', !checked)
    this.updateAcceptButton()
  }

  private updateAcceptButton() {
    if (!this.acceptBtn || !this.diffBlock.parsed) return

    const total = this.diffBlock.parsed.hunks.length
    const selected = Array.from(this.hunkSelections.values()).filter(Boolean).length

    if (total > 1) {
      this.acceptBtn.textContent = `Accept Selected (${selected}/${total})`
    } else {
      this.acceptBtn.textContent = 'Accept Changes'
    }
    this.acceptBtn.disabled = selected === 0
  }

  private async handleAccept() {
    if (!this.diffBlock.parsed) {
      new Notice('Cannot apply diff: parsing failed')
      return
    }

    // Filter to only selected hunks
    const selectedHunks = this.diffBlock.parsed.hunks.filter(
      (_, idx) => this.hunkSelections.get(idx)
    )

    if (selectedHunks.length === 0) {
      new Notice('No changes selected')
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

      // Apply only the selected hunks
      const filteredDiff: ParsedDiff = {
        fileName: this.diffBlock.parsed.fileName,
        hunks: selectedHunks,
      }
      const newContent = applyDiff(currentContent, filteredDiff)

      // Write back to file
      await this.app.vault.modify(abstractFile, newContent)

      // Update status
      this.diffBlock.status = 'accepted'
      this.onAction(this.diffBlock, 'accepted')

      const countMsg = selectedHunks.length < this.diffBlock.parsed.hunks.length
        ? ` (${selectedHunks.length}/${this.diffBlock.parsed.hunks.length} changes)`
        : ''
      new Notice(`Applied changes to ${this.diffBlock.fileName}${countMsg}`)
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
