/**
 * Potential Tasks Modal - Review and act on AI-generated potential tasks
 */

import { App, Modal } from 'obsidian'
import type { PotentialTask } from '../utils/potential-tasks-parser'

// ============================================================================
// Types
// ============================================================================

export type TaskAction = 'keep' | 'reject' | 'move-to-future'

export interface TaskSelection {
  taskId: string
  action: TaskAction
}

export type PotentialTasksActionCallback = (
  selections: TaskSelection[],
  confirmed: boolean,
) => Promise<void>

// ============================================================================
// Modal
// ============================================================================

export class PotentialTasksModal extends Modal {
  private tasks: PotentialTask[]
  private projectPath: string
  private onAction: PotentialTasksActionCallback
  private selections: Map<string, TaskAction> = new Map()
  private expandedGroups: Set<string> = new Set()

  constructor(
    app: App,
    tasks: PotentialTask[],
    projectPath: string,
    onAction: PotentialTasksActionCallback,
  ) {
    super(app)
    this.tasks = tasks
    this.projectPath = projectPath
    this.onAction = onAction

    // Initialize all selections to 'keep' (default)
    for (const task of tasks) {
      this.selections.set(task.id, 'keep')
    }
  }

  onOpen() {
    const { contentEl } = this
    contentEl.empty()

    // Style hooks
    this.modalEl.addClass('lachesis-potential-tasks-modal-root')
    contentEl.addClass('lachesis-potential-tasks-modal')

    // Header
    const header = contentEl.createDiv({ cls: 'lachesis-potential-tasks-header' })
    header.createEl('h2', { text: 'Review Potential Tasks' })
    header.createEl('p', {
      text: 'Choose what to do with each AI-generated task from your log entries.',
      cls: 'lachesis-potential-tasks-subtitle',
    })

    // Content area (scrollable)
    const content = contentEl.createDiv({ cls: 'lachesis-potential-tasks-content' })
    this.renderTaskGroups(content)

    // Footer with actions
    const footer = contentEl.createDiv({ cls: 'lachesis-potential-tasks-footer' })

    const cancelBtn = footer.createEl('button', {
      text: 'Cancel',
      cls: 'lachesis-potential-tasks-cancel-btn',
    })
    cancelBtn.addEventListener('click', () => this.handleCancel())

    const confirmBtn = footer.createEl('button', {
      text: 'Apply Changes',
      cls: 'lachesis-potential-tasks-confirm-btn mod-cta',
    })
    confirmBtn.addEventListener('click', () => this.handleConfirm())
  }

  private renderTaskGroups(container: HTMLElement) {
    // Group tasks by date and entry header
    const groups = this.groupTasks()

    for (const [groupKey, tasks] of groups) {
      this.renderTaskGroup(container, groupKey, tasks)
    }
  }

  private groupTasks(): Map<string, PotentialTask[]> {
    const groups = new Map<string, PotentialTask[]>()

    for (const task of this.tasks) {
      // Create a group key from date and header
      const datePart = task.logEntryDate || 'Unknown Date'
      const headerPart = task.logEntryHeader || 'Unknown Entry'
      const key = `${datePart}|||${headerPart}`

      if (!groups.has(key)) {
        groups.set(key, [])
      }
      groups.get(key)!.push(task)
    }

    return groups
  }

  private renderTaskGroup(container: HTMLElement, groupKey: string, tasks: PotentialTask[]) {
    const [datePart, headerPart] = groupKey.split('|||')
    const entryContent = tasks[0]?.logEntryContent || null

    const groupEl = container.createDiv({ cls: 'lachesis-task-group' })

    // Date header (if available)
    if (datePart && datePart !== 'Unknown Date') {
      groupEl.createEl('div', {
        text: datePart,
        cls: 'lachesis-task-group-date',
      })
    }

    // Entry header (clickable if there's content)
    if (headerPart && headerPart !== 'Unknown Entry') {
      const headerEl = groupEl.createDiv({ cls: 'lachesis-task-group-entry' })

      if (entryContent) {
        headerEl.addClass('lachesis-clickable')

        // Toggle icon
        const toggleIcon = headerEl.createSpan({ cls: 'lachesis-entry-toggle' })
        toggleIcon.setText('▶')

        // Header text
        headerEl.createSpan({ text: headerPart })

        // Content accordion (hidden by default)
        const contentEl = groupEl.createDiv({ cls: 'lachesis-entry-content collapsed' })
        contentEl.setText(entryContent)

        // Click handler
        headerEl.addEventListener('click', () => {
          this.toggleGroupContent(groupKey, toggleIcon, contentEl)
        })
      } else {
        headerEl.setText(headerPart)
      }
    }

    // Tasks list
    const tasksEl = groupEl.createDiv({ cls: 'lachesis-task-list' })
    for (const task of tasks) {
      this.renderTaskItem(tasksEl, task)
    }
  }

  private toggleGroupContent(groupKey: string, toggleIcon: HTMLElement, contentEl: HTMLElement) {
    const isExpanded = this.expandedGroups.has(groupKey)

    if (isExpanded) {
      this.expandedGroups.delete(groupKey)
      toggleIcon.setText('▶')
      toggleIcon.removeClass('expanded')
      contentEl.addClass('collapsed')
    } else {
      this.expandedGroups.add(groupKey)
      toggleIcon.setText('▼')
      toggleIcon.addClass('expanded')
      contentEl.removeClass('collapsed')
    }
  }

  private renderTaskItem(container: HTMLElement, task: PotentialTask) {
    const itemEl = container.createDiv({ cls: 'lachesis-task-item' })
    itemEl.dataset.taskId = task.id

    // Task content (checkbox icon + text)
    const contentEl = itemEl.createDiv({ cls: 'lachesis-task-content' })

    const checkboxEl = contentEl.createSpan({ cls: 'lachesis-task-checkbox' })
    checkboxEl.setText('☐')

    const textEl = contentEl.createSpan({ cls: 'lachesis-task-text' })
    textEl.setText(task.text)

    // Action buttons
    const actionsEl = itemEl.createDiv({ cls: 'lachesis-task-actions' })

    const rejectBtn = actionsEl.createEl('button', {
      text: 'Reject',
      cls: 'lachesis-task-action-btn reject',
    })
    rejectBtn.addEventListener('click', () => this.selectAction(task.id, 'reject'))

    const keepBtn = actionsEl.createEl('button', {
      text: 'Keep',
      cls: 'lachesis-task-action-btn keep selected', // Default selected
    })
    keepBtn.addEventListener('click', () => this.selectAction(task.id, 'keep'))

    const moveBtn = actionsEl.createEl('button', {
      text: 'Move to Future',
      cls: 'lachesis-task-action-btn move',
    })
    moveBtn.addEventListener('click', () => this.selectAction(task.id, 'move-to-future'))
  }

  private selectAction(taskId: string, action: TaskAction) {
    this.selections.set(taskId, action)
    this.updateButtonStates(taskId)
  }

  private updateButtonStates(taskId: string) {
    const selectedAction = this.selections.get(taskId)
    const itemEl = this.contentEl.querySelector(`[data-task-id="${taskId}"]`)
    if (!itemEl) return

    const buttons = itemEl.querySelectorAll('.lachesis-task-action-btn')
    buttons.forEach((btn) => {
      btn.removeClass('selected')
      const isReject = btn.hasClass('reject') && selectedAction === 'reject'
      const isKeep = btn.hasClass('keep') && selectedAction === 'keep'
      const isMove = btn.hasClass('move') && selectedAction === 'move-to-future'
      if (isReject || isKeep || isMove) {
        btn.addClass('selected')
      }
    })
  }

  private async handleConfirm() {
    const selections: TaskSelection[] = []
    for (const [taskId, action] of this.selections) {
      selections.push({ taskId, action })
    }

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
