/**
 * Enrich Tasks Modal - Review and apply AI-generated task enrichments
 */

import { App, Modal } from 'obsidian'
import type {
  TaskEnrichment,
  EnrichTaskSelection,
} from '../utils/enrich-tasks-parser'
import {
  formatEnrichmentBlock,
  getConfidenceLabel,
  getConfidenceColorClass,
} from '../utils/enrich-tasks-parser'

// ============================================================================
// Types
// ============================================================================

export type EnrichTasksActionCallback = (
  selections: EnrichTaskSelection[],
  confirmed: boolean,
) => Promise<void>

export interface EnrichTasksModalOptions {
  viewOnly?: boolean
}

// ============================================================================
// Modal
// ============================================================================

export class EnrichTasksModal extends Modal {
  private enrichments: TaskEnrichment[]
  private projectPath: string
  private onAction: EnrichTasksActionCallback
  private selections: Map<string, boolean> = new Map()
  private viewOnly: boolean
  private expandedPreviews: Set<string> = new Set()

  constructor(
    app: App,
    enrichments: TaskEnrichment[],
    projectPath: string,
    onAction: EnrichTasksActionCallback,
    options: EnrichTasksModalOptions = {},
  ) {
    super(app)
    this.enrichments = enrichments
    this.projectPath = projectPath
    this.onAction = onAction
    this.viewOnly = options.viewOnly ?? false

    // Initialize selections - all selected by default
    for (const enrichment of enrichments) {
      this.selections.set(enrichment.id, enrichment.selected)
    }
  }

  onOpen() {
    const { contentEl } = this
    contentEl.empty()

    // Style hooks
    this.modalEl.addClass('lachesis-enrich-tasks-modal-root')
    contentEl.addClass('lachesis-enrich-tasks-modal')

    this.render()
  }

  private render() {
    const { contentEl } = this
    contentEl.empty()

    // Header
    const header = contentEl.createDiv({ cls: 'lachesis-enrich-tasks-header' })
    header.createEl('h2', {
      text: this.viewOnly ? 'Task Enrichments (History)' : 'Review Task Enrichments',
    })

    const selectedCount = Array.from(this.selections.values()).filter(Boolean).length
    header.createEl('p', {
      text: this.viewOnly
        ? `${this.enrichments.length} task${this.enrichments.length !== 1 ? 's' : ''} were enriched`
        : `Found ${this.enrichments.length} task${this.enrichments.length !== 1 ? 's' : ''} that could use more context. ${selectedCount} selected.`,
      cls: 'lachesis-enrich-tasks-subtitle',
    })

    // Enrichments list
    const listContainer = contentEl.createDiv({ cls: 'lachesis-enrich-tasks-list' })

    for (const enrichment of this.enrichments) {
      this.renderEnrichmentCard(listContainer, enrichment)
    }

    // Footer with buttons
    this.renderFooter(contentEl)
  }

  private renderEnrichmentCard(container: HTMLElement, enrichment: TaskEnrichment) {
    const card = container.createDiv({ cls: 'lachesis-enrich-task-card' })

    // Card header with checkbox and task text
    const cardHeader = card.createDiv({ cls: 'lachesis-enrich-task-header' })

    if (!this.viewOnly) {
      const checkbox = cardHeader.createEl('input', {
        type: 'checkbox',
        cls: 'lachesis-enrich-task-checkbox',
      })
      checkbox.checked = this.selections.get(enrichment.id) ?? true
      checkbox.addEventListener('change', () => {
        this.selections.set(enrichment.id, checkbox.checked)
        this.render()
      })
    }

    const taskInfo = cardHeader.createDiv({ cls: 'lachesis-enrich-task-info' })

    // Task text
    taskInfo.createEl('div', {
      text: enrichment.taskText,
      cls: 'lachesis-enrich-task-text',
    })

    // Slice link if present
    if (enrichment.sliceLink) {
      taskInfo.createEl('div', {
        text: enrichment.sliceLink,
        cls: 'lachesis-enrich-task-slice',
      })
    }

    // Confidence indicator
    const confidenceLabel = getConfidenceLabel(enrichment.confidenceScore)
    const confidenceClass = getConfidenceColorClass(enrichment.confidenceScore)
    const confidenceBadge = cardHeader.createEl('span', {
      text: `${confidenceLabel} (${Math.round(enrichment.confidenceScore * 100)}%)`,
      cls: `lachesis-enrich-confidence-badge ${confidenceClass}`,
    })
    if (enrichment.confidenceNote) {
      confidenceBadge.title = enrichment.confidenceNote
    }

    // Preview toggle
    const isExpanded = this.expandedPreviews.has(enrichment.id)
    const toggleBtn = card.createEl('button', {
      text: isExpanded ? '▼ Hide Preview' : '▶ Show Preview',
      cls: 'lachesis-enrich-preview-toggle',
    })
    toggleBtn.addEventListener('click', () => {
      if (this.expandedPreviews.has(enrichment.id)) {
        this.expandedPreviews.delete(enrichment.id)
      } else {
        this.expandedPreviews.add(enrichment.id)
      }
      this.render()
    })

    // Preview content
    if (isExpanded) {
      const preview = card.createDiv({ cls: 'lachesis-enrich-preview' })
      const enrichmentBlock = formatEnrichmentBlock(enrichment)

      // Render as markdown-like blockquote
      const previewContent = preview.createEl('pre', {
        cls: 'lachesis-enrich-preview-content',
      })
      previewContent.textContent = enrichmentBlock
    }
  }

  private renderFooter(container: HTMLElement) {
    const footer = container.createDiv({ cls: 'lachesis-enrich-tasks-footer' })

    if (this.viewOnly) {
      const closeBtn = footer.createEl('button', {
        text: 'Close',
        cls: 'lachesis-btn',
      })
      closeBtn.addEventListener('click', () => this.close())
    } else {
      // Select all / none buttons
      const bulkActions = footer.createDiv({ cls: 'lachesis-enrich-bulk-actions' })

      const selectAllBtn = bulkActions.createEl('button', {
        text: 'Select All',
        cls: 'lachesis-btn lachesis-btn-secondary',
      })
      selectAllBtn.addEventListener('click', () => {
        for (const enrichment of this.enrichments) {
          this.selections.set(enrichment.id, true)
        }
        this.render()
      })

      const selectNoneBtn = bulkActions.createEl('button', {
        text: 'Select None',
        cls: 'lachesis-btn lachesis-btn-secondary',
      })
      selectNoneBtn.addEventListener('click', () => {
        for (const enrichment of this.enrichments) {
          this.selections.set(enrichment.id, false)
        }
        this.render()
      })

      // Main action buttons
      const mainActions = footer.createDiv({ cls: 'lachesis-enrich-main-actions' })

      const cancelBtn = mainActions.createEl('button', {
        text: 'Cancel',
        cls: 'lachesis-btn lachesis-btn-secondary',
      })
      cancelBtn.addEventListener('click', () => {
        this.onAction([], false)
        this.close()
      })

      const selectedCount = Array.from(this.selections.values()).filter(Boolean).length
      const applyBtn = mainActions.createEl('button', {
        text: `Apply ${selectedCount} Enrichment${selectedCount !== 1 ? 's' : ''}`,
        cls: 'lachesis-btn lachesis-btn-primary',
      })
      applyBtn.disabled = selectedCount === 0
      applyBtn.addEventListener('click', () => {
        const selections: EnrichTaskSelection[] = this.enrichments.map((e) => ({
          taskId: e.id,
          selected: this.selections.get(e.id) ?? false,
        }))
        this.onAction(selections, true)
        this.close()
      })
    }
  }

  onClose() {
    const { contentEl } = this
    contentEl.empty()
  }
}
