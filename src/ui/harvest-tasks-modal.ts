/**
 * Harvest Tasks Modal - Review and place AI-harvested tasks
 */

import { App, Modal } from 'obsidian'
import type {
  HarvestedTask,
  HarvestTaskSelection,
  TaskDestination,
  RoadmapSlice,
} from '../utils/harvest-tasks-parser'
import { getDestinationLabel, destinationSupportsSliceLink, formatSliceLink, formatSliceDisplay } from '../utils/harvest-tasks-parser'

// ============================================================================
// Types
// ============================================================================

export type HarvestTasksActionCallback = (
  selections: HarvestTaskSelection[],
  confirmed: boolean,
) => Promise<void>

// ============================================================================
// Modal
// ============================================================================

export class HarvestTasksModal extends Modal {
  private tasks: HarvestedTask[]
  private projectPath: string
  private roadmapSlices: RoadmapSlice[]
  private onAction: HarvestTasksActionCallback
  private selections: Map<string, HarvestTaskSelection> = new Map()
  private activeFilter: 'all' | 'log' | 'ideas' | 'other' = 'all'

  constructor(
    app: App,
    tasks: HarvestedTask[],
    projectPath: string,
    roadmapSlices: RoadmapSlice[],
    onAction: HarvestTasksActionCallback,
  ) {
    super(app)
    this.tasks = tasks
    this.projectPath = projectPath
    this.roadmapSlices = roadmapSlices
    this.onAction = onAction

    // Initialize selections with AI suggestions
    for (const task of tasks) {
      this.selections.set(task.id, {
        taskId: task.id,
        destination: task.suggestedDestination,
        sliceLink: task.suggestedSliceLink || this.getDefaultSliceLink(task.suggestedDestination),
        customText: null,
      })
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

    // Style hooks
    this.modalEl.addClass('lachesis-harvest-tasks-modal-root')
    contentEl.addClass('lachesis-harvest-tasks-modal')

    this.render()
  }

  private render() {
    const { contentEl } = this
    contentEl.empty()

    // Header
    this.renderHeader(contentEl)

    // Filter bar
    this.renderFilterBar(contentEl)

    // Content area (scrollable)
    const content = contentEl.createDiv({ cls: 'lachesis-harvest-tasks-content' })
    this.renderTaskGroups(content)

    // Footer with actions
    this.renderFooter(contentEl)
  }

  private renderHeader(container: HTMLElement) {
    const header = container.createDiv({ cls: 'lachesis-harvest-tasks-header' })
    header.createEl('h2', { text: 'Harvest Tasks Review' })

    const stats = this.getStats()
    header.createEl('p', {
      text: `Found ${this.tasks.length} potential tasks across ${stats.fileCount} files`,
      cls: 'lachesis-harvest-tasks-subtitle',
    })

    if (stats.duplicatesSkipped > 0) {
      header.createEl('p', {
        text: `(${stats.duplicatesSkipped} similar to existing tasks)`,
        cls: 'lachesis-harvest-tasks-note',
      })
    }

    if (this.roadmapSlices.length > 0) {
      header.createEl('p', {
        text: `${this.roadmapSlices.length} slices available from Roadmap.md`,
        cls: 'lachesis-harvest-tasks-note',
      })
    }
  }

  private renderFilterBar(container: HTMLElement) {
    const filterBar = container.createDiv({ cls: 'lachesis-harvest-filter-bar' })

    type FilterKey = 'all' | 'log' | 'ideas' | 'other'
    const filters: Array<{ key: FilterKey; label: string }> = [
      { key: 'all', label: 'All' },
      { key: 'log', label: 'Log' },
      { key: 'ideas', label: 'Ideas' },
      { key: 'other', label: 'Other' },
    ]

    for (const filter of filters) {
      const btn = filterBar.createEl('button', {
        text: filter.label,
        cls: `lachesis-filter-btn${this.activeFilter === filter.key ? ' active' : ''}`,
      })
      btn.addEventListener('click', () => {
        this.activeFilter = filter.key
        this.render()
      })
    }
  }

  private renderTaskGroups(container: HTMLElement) {
    const filteredTasks = this.getFilteredTasks()
    const groups = this.groupTasks(filteredTasks)

    if (groups.size === 0) {
      container.createEl('p', {
        text: 'No tasks match the current filter.',
        cls: 'lachesis-no-tasks-message',
      })
      return
    }

    for (const [groupKey, tasks] of groups) {
      this.renderTaskGroup(container, groupKey, tasks)
    }
  }

  private getFilteredTasks(): HarvestedTask[] {
    if (this.activeFilter === 'all') return this.tasks

    return this.tasks.filter((task) => {
      const file = task.sourceFile.toLowerCase()
      if (this.activeFilter === 'log') return file.includes('log')
      if (this.activeFilter === 'ideas') return file.includes('ideas')
      return !file.includes('log') && !file.includes('ideas')
    })
  }

  private groupTasks(tasks: HarvestedTask[]): Map<string, HarvestedTask[]> {
    const groups = new Map<string, HarvestedTask[]>()

    for (const task of tasks) {
      const key = task.sourceFile
      if (!groups.has(key)) {
        groups.set(key, [])
      }
      groups.get(key)!.push(task)
    }

    return groups
  }

  private renderTaskGroup(container: HTMLElement, groupKey: string, tasks: HarvestedTask[]) {
    const groupEl = container.createDiv({ cls: 'lachesis-harvest-task-group' })

    // Group header
    const headerEl = groupEl.createDiv({ cls: 'lachesis-harvest-group-header' })
    headerEl.createEl('span', {
      text: `FROM ${groupKey.toUpperCase()}`,
      cls: 'lachesis-harvest-group-title',
    })
    headerEl.createEl('span', {
      text: `(${tasks.length} tasks)`,
      cls: 'lachesis-harvest-group-count',
    })

    // Tasks list
    const tasksEl = groupEl.createDiv({ cls: 'lachesis-harvest-task-list' })
    for (const task of tasks) {
      this.renderTaskItem(tasksEl, task)
    }
  }

  private renderTaskItem(container: HTMLElement, task: HarvestedTask) {
    const selection = this.selections.get(task.id)!
    const itemEl = container.createDiv({ cls: 'lachesis-harvest-task-item' })
    itemEl.dataset.taskId = task.id

    // Task content row
    const contentRow = itemEl.createDiv({ cls: 'lachesis-harvest-task-content' })

    // Checkbox icon
    const checkboxEl = contentRow.createSpan({ cls: 'lachesis-harvest-task-checkbox' })
    if (selection.destination === 'discard') {
      checkboxEl.setText('✗')
      checkboxEl.addClass('discarded')
    } else {
      checkboxEl.setText('☐')
    }

    // Task text
    const textEl = contentRow.createSpan({ cls: 'lachesis-harvest-task-text' })
    textEl.setText(task.text)

    // Source context (collapsible)
    if (task.sourceContext) {
      const contextEl = itemEl.createDiv({ cls: 'lachesis-harvest-task-context' })
      contextEl.createEl('span', {
        text: `"${task.sourceContext}"`,
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
        similarEl.setText(`⚠️ Similar: ${task.existingSimilar}`)
      }
    }

    // Controls row
    const controlsRow = itemEl.createDiv({ cls: 'lachesis-harvest-controls' })

    // Destination dropdown
    this.renderDestinationDropdown(controlsRow, task, selection)

    // Slice link dropdown (conditional)
    if (destinationSupportsSliceLink(selection.destination) && this.roadmapSlices.length > 0) {
      this.renderSliceLinkDropdown(controlsRow, task, selection)
    }
  }

  private renderDestinationDropdown(
    container: HTMLElement,
    task: HarvestedTask,
    selection: HarvestTaskSelection,
  ) {
    const wrapper = container.createDiv({ cls: 'lachesis-harvest-dropdown-wrapper' })
    wrapper.createEl('label', { text: 'Destination:', cls: 'lachesis-harvest-label' })

    const select = wrapper.createEl('select', { cls: 'lachesis-harvest-dropdown' })

    const destinations: TaskDestination[] = [
      'discard',
      'future-tasks',
      'active-tasks',
      'next-actions',
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
    task: HarvestedTask,
    selection: HarvestTaskSelection,
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

  private updateSelection(taskId: string, selection: HarvestTaskSelection) {
    this.selections.set(taskId, selection)
  }

  private renderFooter(container: HTMLElement) {
    const footer = container.createDiv({ cls: 'lachesis-harvest-tasks-footer' })

    const cancelBtn = footer.createEl('button', {
      text: 'Cancel',
      cls: 'lachesis-harvest-cancel-btn',
    })
    cancelBtn.addEventListener('click', () => this.handleCancel())

    const selectedCount = this.getSelectedCount()
    const confirmBtn = footer.createEl('button', {
      text: selectedCount > 0 ? `Apply ${selectedCount} Task${selectedCount === 1 ? '' : 's'}` : 'Apply',
      cls: 'lachesis-harvest-confirm-btn mod-cta',
    })
    confirmBtn.addEventListener('click', () => this.handleConfirm())
  }

  private getStats() {
    const files = new Set(this.tasks.map((t) => t.sourceFile))
    const duplicatesSkipped = this.tasks.filter((t) => t.existingSimilar).length
    return {
      fileCount: files.size,
      duplicatesSkipped,
    }
  }

  private getSelectedCount(): number {
    let count = 0
    for (const selection of this.selections.values()) {
      if (selection.destination !== 'discard') {
        count++
      }
    }
    return count
  }

  private async handleConfirm() {
    const selections: HarvestTaskSelection[] = []
    for (const selection of this.selections.values()) {
      selections.push(selection)
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
