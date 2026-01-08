/**
 * Harvest Tasks Modal - Review and place AI-harvested tasks
 */

import { App, Modal, setIcon } from 'obsidian'
import type {
  HarvestedTask,
  HarvestTaskSelection,
  TaskDestination,
  ParsedTasksStructure,
  ActiveSlice,
  PlannedSlice,
} from '../utils/harvest-tasks-parser'
import { getDestinationLabel, destinationRequiresTarget, destinationRequiresSliceName } from '../utils/harvest-tasks-parser'

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
  private tasksStructure: ParsedTasksStructure
  private onAction: HarvestTasksActionCallback
  private selections: Map<string, HarvestTaskSelection> = new Map()
  private expandedGroups: Set<string> = new Set()
  private activeFilter: 'all' | 'log' | 'ideas' | 'other' = 'all' as const

  constructor(
    app: App,
    tasks: HarvestedTask[],
    projectPath: string,
    tasksStructure: ParsedTasksStructure,
    onAction: HarvestTasksActionCallback,
  ) {
    super(app)
    this.tasks = tasks
    this.projectPath = projectPath
    this.tasksStructure = tasksStructure
    this.onAction = onAction

    // Initialize selections with AI suggestions
    for (const task of tasks) {
      this.selections.set(task.id, {
        taskId: task.id,
        destination: task.suggestedDestination,
        targetVS: this.getDefaultTargetVS(task.suggestedDestination),
        sliceName: task.suggestedVSName,
        customText: null,
      })
    }
  }

  private getDefaultTargetVS(destination: TaskDestination): string | null {
    if (destination === 'active-vs' || destination === 'next-actions') {
      // Default to first active slice if available
      if (this.tasksStructure.activeSlices.length > 0) {
        return this.tasksStructure.activeSlices[0].id
      }
    }
    if (destination === 'existing-planned-slice') {
      if (this.tasksStructure.plannedSlices.length > 0) {
        return this.tasksStructure.plannedSlices[0].id
      }
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

    // Target VS dropdown (conditional)
    if (destinationRequiresTarget(selection.destination)) {
      this.renderTargetDropdown(controlsRow, task, selection)
    }

    // Slice name input (conditional)
    if (destinationRequiresSliceName(selection.destination)) {
      this.renderSliceNameInput(controlsRow, task, selection)
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
      'active-vs',
      'next-actions',
      'new-planned-slice',
      'existing-planned-slice',
    ]

    for (const dest of destinations) {
      // Skip existing-planned-slice if no planned slices exist
      if (dest === 'existing-planned-slice' && this.tasksStructure.plannedSlices.length === 0) {
        continue
      }
      // Skip active-vs/next-actions if no active slices exist
      if ((dest === 'active-vs' || dest === 'next-actions') && this.tasksStructure.activeSlices.length === 0) {
        continue
      }

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
        targetVS: this.getDefaultTargetVS(newDest),
        sliceName: newDest === 'new-planned-slice' ? task.suggestedVSName : null,
      })
      this.render()
    })
  }

  private renderTargetDropdown(
    container: HTMLElement,
    task: HarvestedTask,
    selection: HarvestTaskSelection,
  ) {
    const wrapper = container.createDiv({ cls: 'lachesis-harvest-dropdown-wrapper' })
    wrapper.createEl('label', { text: 'Target:', cls: 'lachesis-harvest-label' })

    const select = wrapper.createEl('select', { cls: 'lachesis-harvest-dropdown' })

    let options: Array<{ id: string; name: string }> = []

    if (selection.destination === 'active-vs' || selection.destination === 'next-actions') {
      options = this.tasksStructure.activeSlices.map((s) => ({
        id: s.id,
        name: `${s.id} — ${s.name}`,
      }))
    } else if (selection.destination === 'existing-planned-slice') {
      options = this.tasksStructure.plannedSlices.map((s) => ({
        id: s.id,
        name: `${s.id} — ${s.name}`,
      }))
    }

    for (const opt of options) {
      const option = select.createEl('option', {
        text: opt.name,
        value: opt.id,
      })
      if (opt.id === selection.targetVS) {
        option.selected = true
      }
    }

    select.addEventListener('change', () => {
      this.updateSelection(task.id, {
        ...selection,
        targetVS: select.value,
      })
    })
  }

  private renderSliceNameInput(
    container: HTMLElement,
    task: HarvestedTask,
    selection: HarvestTaskSelection,
  ) {
    const wrapper = container.createDiv({ cls: 'lachesis-harvest-input-wrapper' })
    wrapper.createEl('label', { text: 'Slice Name:', cls: 'lachesis-harvest-label' })

    const input = wrapper.createEl('input', {
      type: 'text',
      cls: 'lachesis-harvest-text-input',
      value: selection.sliceName || task.suggestedVSName || '',
      placeholder: 'Enter slice name...',
    })

    input.addEventListener('input', () => {
      this.updateSelection(task.id, {
        ...selection,
        sliceName: input.value || null,
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
