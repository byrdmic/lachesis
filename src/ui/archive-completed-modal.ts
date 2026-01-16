/**
 * Archive Completed Modal - Review and archive completed tasks
 */

import { App, Modal } from 'obsidian'
import type {
  CompletedTask,
  SliceGroup,
  ArchiveAction,
  ArchiveSelection,
} from '../utils/archive-completed-parser'
import {
  ARCHIVE_ACTION_LABELS,
  getDefaultArchiveAction,
  getTaskSectionLabel,
} from '../utils/archive-completed-parser'

// ============================================================================
// Types
// ============================================================================

export type ArchiveCompletedActionCallback = (
  selections: ArchiveSelection[],
  confirmed: boolean,
) => Promise<void>

export interface ArchiveCompletedModalOptions {
  viewOnly?: boolean // Whether modal is in view-only mode (for history)
}

// ============================================================================
// Modal
// ============================================================================

export class ArchiveCompletedModal extends Modal {
  private sliceGroups: SliceGroup[]
  private standaloneTasks: CompletedTask[]
  private projectPath: string
  private onAction: ArchiveCompletedActionCallback
  private selections: Map<string, ArchiveSelection> = new Map()
  private viewOnly: boolean
  private footerEl: HTMLElement | null = null

  constructor(
    app: App,
    sliceGroups: SliceGroup[],
    standaloneTasks: CompletedTask[],
    projectPath: string,
    onAction: ArchiveCompletedActionCallback,
    options: ArchiveCompletedModalOptions = {},
  ) {
    super(app)
    this.sliceGroups = sliceGroups
    this.standaloneTasks = standaloneTasks
    this.projectPath = projectPath
    this.onAction = onAction
    this.viewOnly = options.viewOnly ?? false

    // Initialize selections with default action (archive)
    for (const group of sliceGroups) {
      for (const task of group.tasks) {
        this.selections.set(task.id, {
          taskId: task.id,
          action: getDefaultArchiveAction(),
        })
      }
    }
    for (const task of standaloneTasks) {
      this.selections.set(task.id, {
        taskId: task.id,
        action: getDefaultArchiveAction(),
      })
    }
  }

  onOpen() {
    const { contentEl } = this
    contentEl.empty()

    // Style hooks
    this.modalEl.addClass('lachesis-archive-completed-modal-root')
    contentEl.addClass('lachesis-archive-completed-modal')

    this.render()
  }

  private render() {
    const { contentEl } = this
    contentEl.empty()

    // Header
    this.renderHeader(contentEl)

    // Content area (scrollable)
    const content = contentEl.createDiv({ cls: 'lachesis-archive-completed-content' })

    const totalTasks = this.getTotalTaskCount()
    if (totalTasks === 0) {
      content.createEl('p', {
        text: 'No completed tasks found to archive.',
        cls: 'lachesis-no-tasks-message',
      })
    } else {
      // Slice groups
      if (this.sliceGroups.length > 0) {
        this.renderSliceGroups(content)
      }

      // Standalone tasks
      if (this.standaloneTasks.length > 0) {
        this.renderStandaloneTasks(content)
      }
    }

    // Footer with actions
    this.footerEl = contentEl.createDiv()
    this.renderFooter(this.footerEl)
  }

  private renderHeader(container: HTMLElement) {
    const header = container.createDiv({ cls: 'lachesis-archive-completed-header' })

    header.createEl('h2', { text: 'Archive Completed Tasks' })

    const totalTasks = this.getTotalTaskCount()
    const sliceCount = this.sliceGroups.length
    const standaloneCount = this.standaloneTasks.length

    let subtitle = `Found ${totalTasks} completed task${totalTasks === 1 ? '' : 's'}`
    if (sliceCount > 0) {
      subtitle += ` in ${sliceCount} slice${sliceCount === 1 ? '' : 's'}`
    }
    if (standaloneCount > 0) {
      subtitle += ` (${standaloneCount} standalone)`
    }

    header.createEl('p', {
      text: subtitle,
      cls: 'lachesis-archive-completed-subtitle',
    })

    // Bulk action buttons
    if (!this.viewOnly && totalTasks > 0) {
      const bulkActions = header.createDiv({ cls: 'lachesis-archive-completed-bulk-actions' })

      const archiveAllBtn = bulkActions.createEl('button', {
        text: 'Archive All',
        cls: 'lachesis-archive-bulk-btn',
      })
      archiveAllBtn.addEventListener('click', () => this.setAllActions('archive'))

      const keepAllBtn = bulkActions.createEl('button', {
        text: 'Keep All',
        cls: 'lachesis-archive-bulk-btn',
      })
      keepAllBtn.addEventListener('click', () => this.setAllActions('keep'))
    }
  }

  private renderSliceGroups(container: HTMLElement) {
    for (const group of this.sliceGroups) {
      const groupEl = container.createDiv({ cls: 'lachesis-archive-slice-group' })

      // Slice header
      const headerEl = groupEl.createDiv({ cls: 'lachesis-archive-slice-header' })
      headerEl.createEl('h3', {
        text: group.sliceRef,
        cls: 'lachesis-archive-slice-title',
      })

      if (group.summary) {
        headerEl.createEl('p', {
          text: group.summary,
          cls: 'lachesis-archive-slice-summary',
        })
      }

      // Tasks in this slice
      const tasksEl = groupEl.createDiv({ cls: 'lachesis-archive-slice-tasks' })
      for (const task of group.tasks) {
        this.renderTaskItem(tasksEl, task)
      }
    }
  }

  private renderStandaloneTasks(container: HTMLElement) {
    const groupEl = container.createDiv({ cls: 'lachesis-archive-slice-group lachesis-archive-standalone-group' })

    // Header
    const headerEl = groupEl.createDiv({ cls: 'lachesis-archive-slice-header' })
    headerEl.createEl('h3', {
      text: 'Standalone Tasks',
      cls: 'lachesis-archive-slice-title',
    })
    headerEl.createEl('p', {
      text: 'Tasks without a vertical slice reference',
      cls: 'lachesis-archive-slice-summary',
    })

    // Tasks
    const tasksEl = groupEl.createDiv({ cls: 'lachesis-archive-slice-tasks' })
    for (const task of this.standaloneTasks) {
      this.renderTaskItem(tasksEl, task)
    }
  }

  private renderTaskItem(container: HTMLElement, task: CompletedTask) {
    const selection = this.selections.get(task.id)!

    const itemEl = container.createDiv({ cls: 'lachesis-archive-task-item' })
    itemEl.dataset.taskId = task.id

    // Task info row
    const taskRow = itemEl.createDiv({ cls: 'lachesis-archive-task-row' })

    // Checkbox icon (completed)
    taskRow.createSpan({
      text: '[x]',
      cls: 'lachesis-archive-task-checkbox',
    })

    // Task text
    const textEl = taskRow.createDiv({ cls: 'lachesis-archive-task-text' })
    textEl.createEl('span', {
      text: task.text,
      cls: 'lachesis-archive-task-description',
    })

    // Section badge
    taskRow.createSpan({
      text: getTaskSectionLabel(task.section),
      cls: 'lachesis-archive-task-section-badge',
    })

    // Sub-items preview if any
    if (task.subItems.length > 0) {
      const subItemsEl = itemEl.createDiv({ cls: 'lachesis-archive-task-subitems' })
      const previewText = task.subItems.length === 1
        ? '1 sub-item'
        : `${task.subItems.length} sub-items`
      subItemsEl.createSpan({
        text: previewText,
        cls: 'lachesis-archive-subitems-count',
      })
    }

    // Action dropdown row
    if (!this.viewOnly) {
      const controlsRow = itemEl.createDiv({ cls: 'lachesis-archive-controls' })
      this.renderActionDropdown(controlsRow, task, selection)
    }
  }

  private renderActionDropdown(
    container: HTMLElement,
    task: CompletedTask,
    selection: ArchiveSelection,
  ) {
    const wrapper = container.createDiv({ cls: 'lachesis-archive-dropdown-wrapper' })
    wrapper.createEl('label', { text: 'Action:', cls: 'lachesis-archive-label' })

    const select = wrapper.createEl('select', { cls: 'lachesis-archive-dropdown' })

    const actions: ArchiveAction[] = ['archive', 'keep']

    for (const action of actions) {
      const option = select.createEl('option', {
        text: ARCHIVE_ACTION_LABELS[action],
        value: action,
      })
      if (action === selection.action) {
        option.selected = true
      }
    }

    select.addEventListener('change', () => {
      this.updateSelection(task.id, {
        ...selection,
        action: select.value as ArchiveAction,
      })
      // Only re-render the footer to update stats, not the entire list
      if (this.footerEl) {
        this.renderFooter(this.footerEl)
      }
    })
  }

  private renderFooter(container: HTMLElement) {
    container.empty()
    const footer = container.createDiv({ cls: 'lachesis-archive-completed-footer' })

    // Stats summary
    const stats = this.getActionStats()

    if (stats.archiveCount > 0 || stats.keepCount > 0) {
      const summaryEl = footer.createDiv({ cls: 'lachesis-archive-footer-summary' })
      const parts: string[] = []
      if (stats.archiveCount > 0) {
        parts.push(`${stats.archiveCount} to archive`)
      }
      if (stats.keepCount > 0 && !this.viewOnly) {
        parts.push(`${stats.keepCount} to keep`)
      }
      if (parts.length > 0) {
        summaryEl.setText(parts.join(', '))
      }
    }

    // Buttons
    const buttonsEl = footer.createDiv({ cls: 'lachesis-archive-footer-buttons' })

    const cancelBtn = buttonsEl.createEl('button', {
      text: this.viewOnly ? 'Close' : 'Cancel',
      cls: 'lachesis-archive-cancel-btn',
    })
    cancelBtn.addEventListener('click', () => this.handleCancel())

    // Only show Apply button if there are actions to apply
    if (stats.archiveCount > 0 || !this.viewOnly) {
      const confirmBtn = buttonsEl.createEl('button', {
        text: stats.archiveCount > 0 ? `Archive ${stats.archiveCount} Task${stats.archiveCount === 1 ? '' : 's'}` : 'Apply',
        cls: 'lachesis-archive-confirm-btn mod-cta',
      })
      confirmBtn.addEventListener('click', () => this.handleConfirm())

      // Disable if no actions to apply
      if (stats.archiveCount === 0) {
        confirmBtn.setAttr('disabled', 'true')
        confirmBtn.addClass('lachesis-btn-disabled')
      }
    }
  }

  private updateSelection(taskId: string, selection: ArchiveSelection) {
    this.selections.set(taskId, selection)
  }

  private setAllActions(action: ArchiveAction) {
    for (const [taskId, selection] of this.selections.entries()) {
      this.selections.set(taskId, { ...selection, action })
    }
    this.render()
  }

  private getTotalTaskCount(): number {
    let count = 0
    for (const group of this.sliceGroups) {
      count += group.tasks.length
    }
    count += this.standaloneTasks.length
    return count
  }

  private getActionStats() {
    let archiveCount = 0
    let keepCount = 0

    for (const selection of this.selections.values()) {
      switch (selection.action) {
        case 'archive':
          archiveCount++
          break
        case 'keep':
          keepCount++
          break
      }
    }

    return { archiveCount, keepCount }
  }

  private async handleConfirm() {
    const selections = Array.from(this.selections.values())
    await this.onAction(selections, true)
    this.close()
  }

  private async handleCancel() {
    await this.onAction([], false)
    this.close()
  }

  onClose() {
    const { contentEl } = this
    contentEl.empty()
  }
}
