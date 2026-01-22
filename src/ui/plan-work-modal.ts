/**
 * Plan Work Modal - Review and apply AI-generated tasks with enrichment
 */

import { App, Modal } from 'obsidian'
import type {
  PlannedTask,
  SuggestedSlice,
  PlannedTaskSelection,
  SuggestedSliceSelection,
} from '../utils/plan-work-parser'
import { formatPlannedTask, formatSuggestedSlice } from '../utils/plan-work-parser'

// ============================================================================
// Types
// ============================================================================

export type PlanWorkActionCallback = (
  taskSelections: PlannedTaskSelection[],
  sliceSelections: SuggestedSliceSelection[],
  confirmed: boolean,
) => Promise<void>

export interface PlanWorkModalOptions {
  viewOnly?: boolean
}

// ============================================================================
// Modal
// ============================================================================

export class PlanWorkModal extends Modal {
  private tasks: PlannedTask[]
  private slices: SuggestedSlice[]
  private projectPath: string
  private onAction: PlanWorkActionCallback
  private taskSelections: Map<string, { selected: boolean; destination: 'current' | 'later' | 'discard' }> = new Map()
  private sliceSelections: Map<string, boolean> = new Map()
  private viewOnly: boolean
  private expandedPreviews: Set<string> = new Set()

  constructor(
    app: App,
    tasks: PlannedTask[],
    slices: SuggestedSlice[],
    projectPath: string,
    onAction: PlanWorkActionCallback,
    options: PlanWorkModalOptions = {},
  ) {
    super(app)
    this.tasks = tasks
    this.slices = slices
    this.projectPath = projectPath
    this.onAction = onAction
    this.viewOnly = options.viewOnly ?? false

    // Initialize selections - all selected by default, destination current
    for (const task of tasks) {
      this.taskSelections.set(task.id, {
        selected: task.selected,
        destination: 'current',
      })
    }

    for (const slice of slices) {
      this.sliceSelections.set(slice.id, slice.selected)
    }
  }

  onOpen() {
    const { contentEl } = this
    contentEl.empty()

    // Style hooks
    this.modalEl.addClass('lachesis-plan-work-modal-root')
    contentEl.addClass('lachesis-plan-work-modal')

    this.render()
  }

  private render() {
    const { contentEl } = this
    contentEl.empty()

    // Header
    const header = contentEl.createDiv({ cls: 'lachesis-plan-work-header' })
    header.createEl('h2', {
      text: this.viewOnly ? 'Planned Work (History)' : 'Review Planned Work',
    })

    const selectedTaskCount = Array.from(this.taskSelections.values()).filter((s) => s.selected && s.destination !== 'discard').length
    const selectedSliceCount = Array.from(this.sliceSelections.values()).filter(Boolean).length

    header.createEl('p', {
      text: this.viewOnly
        ? `${this.tasks.length} task${this.tasks.length !== 1 ? 's' : ''} were generated`
        : `Generated ${this.tasks.length} task${this.tasks.length !== 1 ? 's' : ''}. ${selectedTaskCount} selected.`,
      cls: 'lachesis-plan-work-subtitle',
    })

    // Tasks section
    if (this.tasks.length > 0) {
      const tasksSection = contentEl.createDiv({ cls: 'lachesis-plan-work-section' })
      tasksSection.createEl('h3', { text: 'Tasks' })

      const tasksList = tasksSection.createDiv({ cls: 'lachesis-plan-work-list' })
      for (const task of this.tasks) {
        this.renderTaskCard(tasksList, task)
      }
    }

    // New Slices section (if any)
    if (this.slices.length > 0) {
      const slicesSection = contentEl.createDiv({ cls: 'lachesis-plan-work-section' })
      slicesSection.createEl('h3', { text: 'New Roadmap Slices' })

      const slicesInfo = slicesSection.createEl('p', {
        cls: 'lachesis-plan-work-slices-info',
      })
      slicesInfo.textContent = 'These slices will be added to Roadmap.md if selected.'

      const slicesList = slicesSection.createDiv({ cls: 'lachesis-plan-work-list' })
      for (const slice of this.slices) {
        this.renderSliceCard(slicesList, slice)
      }
    }

    // Footer with buttons
    this.renderFooter(contentEl)
  }

  private renderTaskCard(container: HTMLElement, task: PlannedTask) {
    const card = container.createDiv({ cls: 'lachesis-plan-work-card' })
    const selection = this.taskSelections.get(task.id)

    // Card header with checkbox and task text
    const cardHeader = card.createDiv({ cls: 'lachesis-plan-work-card-header' })

    if (!this.viewOnly) {
      const checkbox = cardHeader.createEl('input', {
        type: 'checkbox',
        cls: 'lachesis-plan-work-checkbox',
      })
      checkbox.checked = selection?.selected ?? true
      checkbox.addEventListener('change', () => {
        const current = this.taskSelections.get(task.id)
        this.taskSelections.set(task.id, {
          selected: checkbox.checked,
          destination: current?.destination ?? 'current',
        })
        this.render()
      })
    }

    const taskInfo = cardHeader.createDiv({ cls: 'lachesis-plan-work-task-info' })

    // Task text
    taskInfo.createEl('div', {
      text: task.text,
      cls: 'lachesis-plan-work-task-text',
    })

    // Slice link if present
    if (task.sliceLink) {
      const sliceBadge = taskInfo.createEl('span', {
        text: task.isNewSlice ? `${task.sliceLink} (new)` : task.sliceLink,
        cls: `lachesis-plan-work-slice-badge ${task.isNewSlice ? 'new-slice' : ''}`,
      })
    }

    // Destination selector (if not view only and task is selected)
    if (!this.viewOnly && selection?.selected) {
      const destinationDiv = card.createDiv({ cls: 'lachesis-plan-work-destination' })
      destinationDiv.createEl('span', { text: 'Add to: ', cls: 'lachesis-destination-label' })

      const select = destinationDiv.createEl('select', { cls: 'lachesis-destination-select' })

      const currentOption = select.createEl('option', { text: 'Current', value: 'current' })
      const laterOption = select.createEl('option', { text: 'Later', value: 'later' })

      select.value = selection.destination
      select.addEventListener('change', () => {
        this.taskSelections.set(task.id, {
          selected: true,
          destination: select.value as 'current' | 'later',
        })
      })
    }

    // Preview toggle
    const isExpanded = this.expandedPreviews.has(task.id)
    const toggleBtn = card.createEl('button', {
      text: isExpanded ? '▼ Hide Preview' : '▶ Show Preview',
      cls: 'lachesis-plan-work-preview-toggle',
    })
    toggleBtn.addEventListener('click', () => {
      if (this.expandedPreviews.has(task.id)) {
        this.expandedPreviews.delete(task.id)
      } else {
        this.expandedPreviews.add(task.id)
      }
      this.render()
    })

    // Preview content
    if (isExpanded) {
      const preview = card.createDiv({ cls: 'lachesis-plan-work-preview' })
      const taskBlock = formatPlannedTask(task)

      const previewContent = preview.createEl('pre', {
        cls: 'lachesis-plan-work-preview-content',
      })
      previewContent.textContent = taskBlock
    }
  }

  private renderSliceCard(container: HTMLElement, slice: SuggestedSlice) {
    const card = container.createDiv({ cls: 'lachesis-plan-work-card lachesis-slice-card' })

    // Card header with checkbox and slice name
    const cardHeader = card.createDiv({ cls: 'lachesis-plan-work-card-header' })

    if (!this.viewOnly) {
      const checkbox = cardHeader.createEl('input', {
        type: 'checkbox',
        cls: 'lachesis-plan-work-checkbox',
      })
      checkbox.checked = this.sliceSelections.get(slice.id) ?? true
      checkbox.addEventListener('change', () => {
        this.sliceSelections.set(slice.id, checkbox.checked)
        this.render()
      })
    }

    const sliceInfo = cardHeader.createDiv({ cls: 'lachesis-plan-work-slice-info' })

    // Slice name with VS number
    sliceInfo.createEl('div', {
      text: `${slice.vsNumber} — ${slice.name}`,
      cls: 'lachesis-plan-work-slice-name',
    })

    // Milestone if present
    if (slice.milestone) {
      sliceInfo.createEl('div', {
        text: `Under: ${slice.milestone}`,
        cls: 'lachesis-plan-work-slice-milestone',
      })
    }

    // Preview toggle
    const previewId = `slice-${slice.id}`
    const isExpanded = this.expandedPreviews.has(previewId)
    const toggleBtn = card.createEl('button', {
      text: isExpanded ? '▼ Hide Preview' : '▶ Show Preview',
      cls: 'lachesis-plan-work-preview-toggle',
    })
    toggleBtn.addEventListener('click', () => {
      if (this.expandedPreviews.has(previewId)) {
        this.expandedPreviews.delete(previewId)
      } else {
        this.expandedPreviews.add(previewId)
      }
      this.render()
    })

    // Preview content
    if (isExpanded) {
      const preview = card.createDiv({ cls: 'lachesis-plan-work-preview' })
      const sliceBlock = formatSuggestedSlice(slice)

      const previewContent = preview.createEl('pre', {
        cls: 'lachesis-plan-work-preview-content',
      })
      previewContent.textContent = sliceBlock
    }
  }

  private renderFooter(container: HTMLElement) {
    const footer = container.createDiv({ cls: 'lachesis-plan-work-footer' })

    if (this.viewOnly) {
      const closeBtn = footer.createEl('button', {
        text: 'Close',
        cls: 'lachesis-btn',
      })
      closeBtn.addEventListener('click', () => this.close())
    } else {
      // Select all / none buttons
      const bulkActions = footer.createDiv({ cls: 'lachesis-plan-work-bulk-actions' })

      const selectAllBtn = bulkActions.createEl('button', {
        text: 'Select All',
        cls: 'lachesis-btn lachesis-btn-secondary',
      })
      selectAllBtn.addEventListener('click', () => {
        for (const task of this.tasks) {
          const current = this.taskSelections.get(task.id)
          this.taskSelections.set(task.id, {
            selected: true,
            destination: current?.destination ?? 'current',
          })
        }
        for (const slice of this.slices) {
          this.sliceSelections.set(slice.id, true)
        }
        this.render()
      })

      const selectNoneBtn = bulkActions.createEl('button', {
        text: 'Select None',
        cls: 'lachesis-btn lachesis-btn-secondary',
      })
      selectNoneBtn.addEventListener('click', () => {
        for (const task of this.tasks) {
          const current = this.taskSelections.get(task.id)
          this.taskSelections.set(task.id, {
            selected: false,
            destination: current?.destination ?? 'current',
          })
        }
        for (const slice of this.slices) {
          this.sliceSelections.set(slice.id, false)
        }
        this.render()
      })

      // Main action buttons
      const mainActions = footer.createDiv({ cls: 'lachesis-plan-work-main-actions' })

      const cancelBtn = mainActions.createEl('button', {
        text: 'Cancel',
        cls: 'lachesis-btn lachesis-btn-secondary',
      })
      cancelBtn.addEventListener('click', () => {
        this.onAction([], [], false)
        this.close()
      })

      const selectedTaskCount = Array.from(this.taskSelections.values()).filter((s) => s.selected && s.destination !== 'discard').length
      const selectedSliceCount = Array.from(this.sliceSelections.values()).filter(Boolean).length
      const totalSelected = selectedTaskCount + selectedSliceCount

      const applyBtn = mainActions.createEl('button', {
        text: `Apply ${totalSelected} Item${totalSelected !== 1 ? 's' : ''}`,
        cls: 'lachesis-btn lachesis-btn-primary',
      })
      applyBtn.disabled = totalSelected === 0
      applyBtn.addEventListener('click', () => {
        const taskSelections: PlannedTaskSelection[] = this.tasks.map((t) => {
          const sel = this.taskSelections.get(t.id)
          return {
            taskId: t.id,
            selected: sel?.selected ?? false,
            destination: sel?.destination ?? 'current',
          }
        })
        const sliceSelections: SuggestedSliceSelection[] = this.slices.map((s) => ({
          sliceId: s.id,
          selected: this.sliceSelections.get(s.id) ?? false,
        }))
        this.onAction(taskSelections, sliceSelections, true)
        this.close()
      })
    }
  }

  onClose() {
    const { contentEl } = this
    contentEl.empty()
  }
}

// ============================================================================
// Input Modal
// ============================================================================

export type PlanWorkInputCallback = (workDescription: string, confirmed: boolean) => void

/**
 * Modal for collecting work description before running Plan Work workflow
 */
export class PlanWorkInputModal extends Modal {
  private onSubmit: PlanWorkInputCallback

  constructor(app: App, onSubmit: PlanWorkInputCallback) {
    super(app)
    this.onSubmit = onSubmit
  }

  onOpen() {
    const { contentEl } = this
    contentEl.empty()

    this.modalEl.addClass('lachesis-plan-work-input-modal-root')
    contentEl.addClass('lachesis-plan-work-input-modal')

    // Header
    contentEl.createEl('h2', { text: 'Plan Work' })
    contentEl.createEl('p', {
      text: 'Describe the work you want to do. The AI will generate enriched tasks ready for implementation.',
      cls: 'lachesis-plan-work-input-description',
    })

    // Text area
    const textArea = contentEl.createEl('textarea', {
      cls: 'lachesis-plan-work-input-textarea',
      placeholder: 'Example: I need to implement user authentication with OAuth support for Google and GitHub...',
    })
    textArea.rows = 6

    // Footer
    const footer = contentEl.createDiv({ cls: 'lachesis-plan-work-input-footer' })

    const cancelBtn = footer.createEl('button', {
      text: 'Cancel',
      cls: 'lachesis-btn lachesis-btn-secondary',
    })
    cancelBtn.addEventListener('click', () => {
      this.onSubmit('', false)
      this.close()
    })

    const submitBtn = footer.createEl('button', {
      text: 'Generate Tasks',
      cls: 'lachesis-btn lachesis-btn-primary',
    })
    submitBtn.addEventListener('click', () => {
      const value = textArea.value.trim()
      if (value) {
        this.onSubmit(value, true)
        this.close()
      }
    })

    // Focus the textarea
    setTimeout(() => textArea.focus(), 50)
  }

  onClose() {
    const { contentEl } = this
    contentEl.empty()
  }
}
