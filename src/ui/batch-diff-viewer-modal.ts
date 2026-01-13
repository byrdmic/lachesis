/**
 * Batch Diff Viewer Modal - Review multiple file diffs at once
 *
 * Used by the init-from-summary workflow to present all proposed
 * changes (Overview.md, Roadmap.md, Tasks.md) for review together.
 */

import { App, Modal, Notice } from 'obsidian'
import type { DiffBlock } from '../utils/diff'
import { applyDiffToFile } from '../utils/diff'
import type { InitSummaryFile } from '../utils/init-summary-parser'

export type BatchDiffAction = 'accepted' | 'rejected' | 'partial'

export type BatchDiffActionCallback = (
  results: Map<InitSummaryFile, 'accepted' | 'rejected'>,
  action: BatchDiffAction,
) => void

export class BatchDiffViewerModal extends Modal {
  private diffs: Map<InitSummaryFile, DiffBlock>
  private projectPath: string
  private onAction: BatchDiffActionCallback
  private fileStatuses: Map<InitSummaryFile, 'pending' | 'accepted' | 'rejected'>
  private expandedFiles: Set<InitSummaryFile> = new Set()

  constructor(
    app: App,
    diffs: Map<InitSummaryFile, DiffBlock>,
    projectPath: string,
    onAction: BatchDiffActionCallback,
  ) {
    super(app)
    this.diffs = diffs
    this.projectPath = projectPath
    this.onAction = onAction
    this.fileStatuses = new Map()

    // Initialize all as pending and expanded
    for (const file of diffs.keys()) {
      this.fileStatuses.set(file, 'pending')
      this.expandedFiles.add(file)
    }
  }

  onOpen() {
    const { contentEl } = this
    contentEl.empty()
    this.modalEl.addClass('lachesis-batch-diff-modal-root')
    contentEl.addClass('lachesis-batch-diff-modal')

    this.render()
  }

  private render() {
    const { contentEl } = this
    contentEl.empty()

    // Header
    const header = contentEl.createDiv({ cls: 'lachesis-batch-diff-header' })
    header.createEl('h2', { text: 'Review Proposed Changes' })
    header.createEl('p', {
      text: `${this.diffs.size} file${this.diffs.size === 1 ? '' : 's'} will be updated`,
      cls: 'lachesis-batch-diff-subtitle',
    })

    // File sections
    const filesContainer = contentEl.createDiv({ cls: 'lachesis-batch-diff-files' })

    const fileOrder: InitSummaryFile[] = ['Overview.md', 'Roadmap.md', 'Tasks.md']
    for (const fileName of fileOrder) {
      const diff = this.diffs.get(fileName)
      if (diff) {
        this.renderFileSection(filesContainer, fileName, diff)
      }
    }

    // Footer
    this.renderFooter(contentEl)
  }

  private renderFileSection(
    container: HTMLElement,
    fileName: InitSummaryFile,
    diff: DiffBlock,
  ) {
    const section = container.createDiv({ cls: 'lachesis-batch-diff-file-section' })
    const status = this.fileStatuses.get(fileName) || 'pending'
    section.addClass(`status-${status}`)

    const isExpanded = this.expandedFiles.has(fileName)

    // File header (clickable to expand/collapse)
    const fileHeader = section.createDiv({ cls: 'lachesis-batch-diff-file-header' })
    fileHeader.addEventListener('click', () => this.toggleExpand(fileName))

    // Expand/collapse indicator
    const expandIcon = fileHeader.createEl('span', {
      text: isExpanded ? '▼' : '▶',
      cls: 'lachesis-batch-diff-expand-icon',
    })

    fileHeader.createEl('span', {
      text: fileName,
      cls: 'lachesis-batch-diff-file-name',
    })

    // Change summary
    if (diff.parsed) {
      let adds = 0
      let removes = 0
      for (const hunk of diff.parsed.hunks) {
        for (const line of hunk.lines) {
          if (line.type === 'add') adds++
          if (line.type === 'remove') removes++
        }
      }
      fileHeader.createEl('span', {
        text: `+${adds} / -${removes}`,
        cls: 'lachesis-batch-diff-changes',
      })
    }

    // Status badge
    fileHeader.createEl('span', {
      text: status,
      cls: `lachesis-batch-diff-status ${status}`,
    })

    // Diff content (collapsible)
    if (isExpanded) {
      const diffContent = section.createDiv({ cls: 'lachesis-batch-diff-content' })
      this.renderDiffContent(diffContent, diff)

      // Per-file actions (if pending)
      if (status === 'pending') {
        const actions = section.createDiv({ cls: 'lachesis-batch-diff-file-actions' })

        const rejectBtn = actions.createEl('button', {
          text: 'Reject',
          cls: 'lachesis-batch-diff-reject-btn',
        })
        rejectBtn.addEventListener('click', (e) => {
          e.stopPropagation()
          this.handleFileAction(fileName, diff, 'rejected')
        })

        const acceptBtn = actions.createEl('button', {
          text: 'Accept',
          cls: 'lachesis-batch-diff-accept-btn mod-cta',
        })
        acceptBtn.addEventListener('click', (e) => {
          e.stopPropagation()
          this.handleFileAction(fileName, diff, 'accepted')
        })
      }
    }
  }

  private toggleExpand(fileName: InitSummaryFile) {
    if (this.expandedFiles.has(fileName)) {
      this.expandedFiles.delete(fileName)
    } else {
      this.expandedFiles.add(fileName)
    }
    this.render()
  }

  private renderDiffContent(container: HTMLElement, diff: DiffBlock) {
    if (!diff.parsed) {
      const pre = container.createEl('pre', { cls: 'lachesis-batch-diff-pre' })
      pre.setText(diff.rawDiff)
      return
    }

    for (const hunk of diff.parsed.hunks) {
      const pre = container.createEl('pre', { cls: 'lachesis-batch-diff-pre' })

      // Hunk header
      pre.createEl('div', {
        cls: 'lachesis-diff-hunk-header',
        text: `@@ -${hunk.oldStart},${hunk.oldCount} +${hunk.newStart},${hunk.newCount} @@`,
      })

      // Lines
      for (const line of hunk.lines) {
        const prefix = line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' '
        pre.createEl('div', {
          cls: `lachesis-diff-line lachesis-diff-${line.type}`,
          text: prefix + line.content,
        })
      }
    }
  }

  private async handleFileAction(
    fileName: InitSummaryFile,
    diff: DiffBlock,
    action: 'accepted' | 'rejected',
  ) {
    if (action === 'accepted') {
      const result = await applyDiffToFile(this.app, diff, this.projectPath)
      if (!result.success) {
        new Notice(`Failed to apply ${fileName}: ${result.error}`)
        return
      }
      new Notice(`Applied changes to ${fileName}`)
    }

    this.fileStatuses.set(fileName, action)
    diff.status = action
    this.render()
    this.checkAllProcessed()
  }

  private renderFooter(container: HTMLElement) {
    const footer = container.createDiv({ cls: 'lachesis-batch-diff-footer' })

    const pendingCount = Array.from(this.fileStatuses.values()).filter(
      (s) => s === 'pending',
    ).length
    const allProcessed = pendingCount === 0

    if (allProcessed) {
      const acceptedCount = Array.from(this.fileStatuses.values()).filter(
        (s) => s === 'accepted',
      ).length
      const rejectedCount = Array.from(this.fileStatuses.values()).filter(
        (s) => s === 'rejected',
      ).length

      footer.createEl('span', {
        text: `${acceptedCount} accepted, ${rejectedCount} rejected`,
        cls: 'lachesis-batch-diff-summary-text',
      })

      const closeBtn = footer.createEl('button', {
        text: 'Done',
        cls: 'lachesis-batch-diff-done-btn mod-cta',
      })
      closeBtn.addEventListener('click', () => this.handleClose())
    } else {
      // Reject All / Accept All buttons
      const rejectAllBtn = footer.createEl('button', {
        text: 'Reject All',
        cls: 'lachesis-batch-diff-reject-all-btn',
      })
      rejectAllBtn.addEventListener('click', () => this.handleBulkAction('rejected'))

      const acceptAllBtn = footer.createEl('button', {
        text: 'Accept All',
        cls: 'lachesis-batch-diff-accept-all-btn mod-cta',
      })
      acceptAllBtn.addEventListener('click', () => this.handleBulkAction('accepted'))
    }
  }

  private async handleBulkAction(action: 'accepted' | 'rejected') {
    const fileOrder: InitSummaryFile[] = ['Overview.md', 'Roadmap.md', 'Tasks.md']
    for (const fileName of fileOrder) {
      const diff = this.diffs.get(fileName)
      if (diff && this.fileStatuses.get(fileName) === 'pending') {
        await this.handleFileAction(fileName, diff, action)
      }
    }
  }

  private checkAllProcessed() {
    const pendingCount = Array.from(this.fileStatuses.values()).filter(
      (s) => s === 'pending',
    ).length
    if (pendingCount === 0) {
      // All files processed - render will show Done button
    }
  }

  private handleClose() {
    const results = new Map(this.fileStatuses) as Map<
      InitSummaryFile,
      'accepted' | 'rejected'
    >
    const accepted = Array.from(results.values()).filter((s) => s === 'accepted').length
    const rejected = Array.from(results.values()).filter((s) => s === 'rejected').length

    let action: BatchDiffAction = 'partial'
    if (accepted === results.size) action = 'accepted'
    if (rejected === results.size) action = 'rejected'

    this.onAction(results, action)
    this.close()
  }

  onClose() {
    this.contentEl.empty()
  }
}
