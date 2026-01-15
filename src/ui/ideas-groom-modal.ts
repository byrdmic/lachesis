/**
 * Ideas Groom Modal - Review and place tasks extracted from Ideas.md
 */

import { App, Modal } from 'obsidian'
import type {
  GroomedIdeaTask,
  GroomedIdeaSelection,
  TaskDestination,
  RoadmapSlice,
} from '../utils/ideas-groom-parser'
import { getDestinationLabel, destinationSupportsSliceLink, formatSliceLink, formatSliceDisplay, MOVED_EMOJIS } from '../utils/ideas-groom-parser'

// ============================================================================
// Types
// ============================================================================

export type IdeasGroomActionCallback = (
  selections: GroomedIdeaSelection[],
  confirmed: boolean,
) => Promise<void>

export interface IdeasGroomModalOptions {
  viewOnly?: boolean // When true, modal is read-only (viewing history)
}

// ============================================================================
// Modal
// ============================================================================

export class IdeasGroomModal extends Modal {
  private tasks: GroomedIdeaTask[]
  private projectPath: string
  private roadmapSlices: RoadmapSlice[]
  private onAction: IdeasGroomActionCallback
  private selections: Map<string, GroomedIdeaSelection> = new Map()
  private viewOnly: boolean

  constructor(
    app: App,
    tasks: GroomedIdeaTask[],
    projectPath: string,
    roadmapSlices: RoadmapSlice[],
    onAction: IdeasGroomActionCallback,
    options: IdeasGroomModalOptions = {},
  ) {
    super(app)
    this.tasks = tasks
    this.projectPath = projectPath
    this.roadmapSlices = roadmapSlices
    this.onAction = onAction
    this.viewOnly = options.viewOnly ?? false

    // Initialize selections based on moved state (for history) or AI suggestions
    for (const task of tasks) {
      if (task.movedTo) {
        // Task was already moved - show that destination
        this.selections.set(task.id, {
          taskId: task.id,
          destination: task.movedTo,
          sliceLink: task.suggestedSliceLink || null,
          customText: null,
        })
      } else {
        // Task not moved yet - use AI suggestion
        this.selections.set(task.id, {
          taskId: task.id,
          destination: task.suggestedDestination,
          sliceLink: task.suggestedSliceLink || this.getDefaultSliceLink(task.suggestedDestination),
          customText: null,
        })
      }
    }
  }

  private getDefaultSliceLink(destination: TaskDestination): string | null {
    if (destinationSupportsSliceLink(destination) && this.roadmapSlices.length > 0) {
      // Default to first slice if available
      return formatSliceLink(this.roadmapSlices[0])
    }
    return null
  }

  onOpen() {
    const { contentEl } = this

    contentEl.empty()

    // Style hooks - reuse harvest-tasks styles
    this.modalEl.addClass('lachesis-harvest-tasks-modal-root')
    this.modalEl.addClass('lachesis-ideas-groom-modal-root')
    contentEl.addClass('lachesis-harvest-tasks-modal')
    contentEl.addClass('lachesis-ideas-groom-modal')

    this.render()
  }

  private render() {
    const { contentEl } = this
    contentEl.empty()

    // Header
    this.renderHeader(contentEl)

    // Content area (scrollable)
    const content = contentEl.createDiv({ cls: 'lachesis-harvest-tasks-content' })
    this.renderTaskGroups(content)

    // Footer with actions
    this.renderFooter(contentEl)
  }

  private renderHeader(container: HTMLElement) {
    const header = container.createDiv({ cls: 'lachesis-harvest-tasks-header' })

    const movedCount = this.tasks.filter((t) => t.movedTo).length
    const pendingCount = this.tasks.length - movedCount
    const uniqueHeadings = new Set(this.tasks.map((t) => t.ideaHeading))

    if (this.viewOnly) {
      header.createEl('h2', { text: 'Ideas: Groom Tasks (History)' })

      if (pendingCount > 0) {
        // Some tasks are still actionable
        header.createEl('p', {
          text: `${movedCount} of ${this.tasks.length} task${this.tasks.length === 1 ? '' : 's'} already moved. ${pendingCount} still pending.`,
          cls: 'lachesis-harvest-tasks-subtitle',
        })
        header.createEl('p', {
          text: 'You can still act on pending tasks that have not been moved yet.',
          cls: 'lachesis-harvest-tasks-note',
        })
      } else {
        // All tasks have been moved - fully view-only
        header.createEl('p', {
          text: `All ${this.tasks.length} task${this.tasks.length === 1 ? '' : 's'} from ${uniqueHeadings.size} idea${uniqueHeadings.size === 1 ? '' : 's'} have been moved.`,
          cls: 'lachesis-harvest-tasks-subtitle',
        })
        header.createEl('p', {
          text: 'View-only mode. All tasks from this session have been processed.',
          cls: 'lachesis-harvest-tasks-note',
        })
      }
    } else {
      header.createEl('h2', { text: 'Ideas: Groom Tasks' })

      header.createEl('p', {
        text: `Found ${this.tasks.length} potential task${this.tasks.length === 1 ? '' : 's'} from ${uniqueHeadings.size} idea${uniqueHeadings.size === 1 ? '' : 's'}`,
        cls: 'lachesis-harvest-tasks-subtitle',
      })

      const duplicatesCount = this.tasks.filter((t) => t.existingSimilar).length
      if (duplicatesCount > 0) {
        header.createEl('p', {
          text: `(${duplicatesCount} similar to existing tasks)`,
          cls: 'lachesis-harvest-tasks-note',
        })
      }

      if (this.roadmapSlices.length > 0) {
        header.createEl('p', {
          text: `${this.roadmapSlices.length} slice${this.roadmapSlices.length === 1 ? '' : 's'} available from Roadmap.md`,
          cls: 'lachesis-harvest-tasks-note',
        })
      }
    }
  }

  private renderTaskGroups(container: HTMLElement) {
    const groups = this.groupTasks()

    if (groups.size === 0) {
      container.createEl('p', {
        text: 'No tasks found from ideas.',
        cls: 'lachesis-no-tasks-message',
      })
      return
    }

    for (const [groupKey, tasks] of groups) {
      this.renderTaskGroup(container, groupKey, tasks)
    }
  }

  private groupTasks(): Map<string, GroomedIdeaTask[]> {
    const groups = new Map<string, GroomedIdeaTask[]>()

    for (const task of this.tasks) {
      const key = task.ideaHeading
      if (!groups.has(key)) {
        groups.set(key, [])
      }
      groups.get(key)!.push(task)
    }

    return groups
  }

  private renderTaskGroup(container: HTMLElement, groupKey: string, tasks: GroomedIdeaTask[]) {
    const groupEl = container.createDiv({ cls: 'lachesis-harvest-task-group' })

    // Group header - show the idea heading
    const headerEl = groupEl.createDiv({ cls: 'lachesis-harvest-group-header' })
    const cleanedHeading = groupKey.replace(/^#+\s*/, '')
    headerEl.createEl('span', {
      text: cleanedHeading,
      cls: 'lachesis-harvest-group-title',
    })
    headerEl.createEl('span', {
      text: `(${tasks.length} task${tasks.length === 1 ? '' : 's'})`,
      cls: 'lachesis-harvest-group-count',
    })

    // Tasks list
    const tasksEl = groupEl.createDiv({ cls: 'lachesis-harvest-task-list' })
    for (const task of tasks) {
      this.renderTaskItem(tasksEl, task)
    }
  }

  private renderTaskItem(container: HTMLElement, task: GroomedIdeaTask) {
    const selection = this.selections.get(task.id)!
    const itemEl = container.createDiv({ cls: 'lachesis-harvest-task-item' })
    itemEl.dataset.taskId = task.id

    // Add moved styling if task was moved
    if (task.movedTo) {
      itemEl.addClass('lachesis-ideas-task-moved')
    }

    // Task content row
    const contentRow = itemEl.createDiv({ cls: 'lachesis-harvest-task-content' })

    // Status icon - shows moved emoji or checkbox
    const statusEl = contentRow.createSpan({ cls: 'lachesis-harvest-task-checkbox' })
    if (task.movedTo) {
      // Show moved emoji
      statusEl.setText(MOVED_EMOJIS[task.movedTo])
      statusEl.addClass('moved')
      statusEl.setAttribute('title', `Moved to ${getDestinationLabel(task.movedTo)}`)
    } else if (selection.destination === 'discard') {
      statusEl.setText('✗')
      statusEl.addClass('discarded')
    } else {
      statusEl.setText('☐')
    }

    // Task text
    const textEl = contentRow.createSpan({ cls: 'lachesis-harvest-task-text' })
    textEl.setText(task.text)

    // Moved badge for history view
    if (task.movedTo && this.viewOnly) {
      const badgeEl = contentRow.createSpan({ cls: 'lachesis-ideas-moved-badge' })
      badgeEl.setText(getDestinationLabel(task.movedTo))
    }

    // Idea context (collapsible)
    if (task.ideaContext) {
      const contextEl = itemEl.createDiv({ cls: 'lachesis-harvest-task-context' })
      contextEl.createEl('span', {
        text: `"${task.ideaContext}"`,
        cls: 'lachesis-harvest-context-quote',
      })
    }

    // AI suggestion row
    if (task.reasoning || task.existingSimilar) {
      const aiRow = itemEl.createDiv({ cls: 'lachesis-harvest-ai-row' })

      if (task.reasoning) {
        const reasoningEl = aiRow.createSpan({ cls: 'lachesis-harvest-reasoning' })
        reasoningEl.setText(`AI: ${task.reasoning}`)
      }

      if (task.existingSimilar) {
        const similarEl = aiRow.createSpan({ cls: 'lachesis-harvest-similar-warning' })
        similarEl.setText(`Similar: ${task.existingSimilar}`)
      }
    }

    // Controls row - show if not view-only, OR if view-only but task hasn't been moved yet
    const isTaskActionable = !task.movedTo
    if (!this.viewOnly || isTaskActionable) {
      const controlsRow = itemEl.createDiv({ cls: 'lachesis-harvest-controls' })

      // Destination dropdown
      this.renderDestinationDropdown(controlsRow, task, selection)

      // Slice link dropdown (conditional)
      if (destinationSupportsSliceLink(selection.destination) && this.roadmapSlices.length > 0) {
        this.renderSliceLinkDropdown(controlsRow, task, selection)
      }
    }
  }

  private renderDestinationDropdown(
    container: HTMLElement,
    task: GroomedIdeaTask,
    selection: GroomedIdeaSelection,
  ) {
    const wrapper = container.createDiv({ cls: 'lachesis-harvest-dropdown-wrapper' })
    wrapper.createEl('label', { text: 'Destination:', cls: 'lachesis-harvest-label' })

    const select = wrapper.createEl('select', { cls: 'lachesis-harvest-dropdown' })

    const destinations: TaskDestination[] = [
      'discard',
      'later',
      'current',
    ]

    for (const dest of destinations) {
      const option = select.createEl('option', {
        text: getDestinationLabel(dest),
        value: dest,
      })
      if (dest === selection.destination) {
        option.selected = true
      }
    }

    select.addEventListener('change', () => {
      const newDest = select.value as TaskDestination
      this.updateSelection(task.id, {
        ...selection,
        destination: newDest,
        sliceLink: this.getDefaultSliceLink(newDest),
      })
      this.render()
    })
  }

  private renderSliceLinkDropdown(
    container: HTMLElement,
    task: GroomedIdeaTask,
    selection: GroomedIdeaSelection,
  ) {
    const wrapper = container.createDiv({ cls: 'lachesis-harvest-dropdown-wrapper' })
    wrapper.createEl('label', { text: 'Slice:', cls: 'lachesis-harvest-label' })

    const select = wrapper.createEl('select', { cls: 'lachesis-harvest-dropdown' })

    // Add "No slice (standalone)" option
    const standaloneOption = select.createEl('option', {
      text: '(No slice - standalone)',
      value: '',
    })
    if (!selection.sliceLink) {
      standaloneOption.selected = true
    }

    // Add all roadmap slices as options
    for (const slice of this.roadmapSlices) {
      const sliceLink = formatSliceLink(slice)
      const option = select.createEl('option', {
        text: formatSliceDisplay(slice),
        value: sliceLink,
      })
      if (sliceLink === selection.sliceLink) {
        option.selected = true
      }
    }

    select.addEventListener('change', () => {
      this.updateSelection(task.id, {
        ...selection,
        sliceLink: select.value || null,
      })
    })
  }

  private updateSelection(taskId: string, selection: GroomedIdeaSelection) {
    this.selections.set(taskId, selection)
  }

  private renderFooter(container: HTMLElement) {
    const footer = container.createDiv({ cls: 'lachesis-harvest-tasks-footer' })

    // Count pending (non-moved) tasks that can still be acted upon
    const pendingCount = this.getPendingCount()
    const hasActionableTasks = pendingCount > 0

    if (this.viewOnly && !hasActionableTasks) {
      // Fully view-only mode - all tasks have been moved, just show close button
      const closeBtn = footer.createEl('button', {
        text: 'Close',
        cls: 'lachesis-harvest-confirm-btn mod-cta',
      })
      closeBtn.addEventListener('click', () => this.close())
    } else {
      // Has actionable tasks - show cancel and apply buttons
      const cancelBtn = footer.createEl('button', {
        text: this.viewOnly ? 'Close' : 'Cancel',
        cls: 'lachesis-harvest-cancel-btn',
      })
      cancelBtn.addEventListener('click', () => this.viewOnly ? this.close() : this.handleCancel())

      const selectedCount = this.getSelectedCount()
      const confirmBtn = footer.createEl('button', {
        text: selectedCount > 0 ? `Apply ${selectedCount} Task${selectedCount === 1 ? '' : 's'}` : 'Apply',
        cls: 'lachesis-harvest-confirm-btn mod-cta',
      })
      confirmBtn.addEventListener('click', () => this.handleConfirm())
    }
  }

  private getPendingCount(): number {
    return this.tasks.filter((t) => !t.movedTo).length
  }

  private getSelectedCount(): number {
    let count = 0
    for (const task of this.tasks) {
      // Only count tasks that haven't been moved yet and are not set to discard
      if (!task.movedTo) {
        const selection = this.selections.get(task.id)
        if (selection && selection.destination !== 'discard') {
          count++
        }
      }
    }
    return count
  }

  private async handleConfirm() {
    const selections: GroomedIdeaSelection[] = []

    // Only include selections for tasks that haven't been moved yet
    for (const task of this.tasks) {
      if (!task.movedTo) {
        const selection = this.selections.get(task.id)
        if (selection) {
          selections.push(selection)
        }
      }
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
