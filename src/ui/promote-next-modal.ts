/**
 * Promote Next Modal - Review AI's task selection and confirm promotion
 */

import { App, Modal } from 'obsidian'
import type {
  SelectedTask,
  CandidateTask,
  PromoteAction,
  PromoteSelection,
  PromoteStatus,
  TaskSourceSection,
} from '../utils/promote-next-parser'
import {
  PROMOTE_ACTION_LABELS,
  getDefaultPromoteAction,
  getSourceSectionLabel,
} from '../utils/promote-next-parser'

// ============================================================================
// Types
// ============================================================================

export type PromoteNextActionCallback = (
  selection: PromoteSelection,
  confirmed: boolean,
) => Promise<void>

export interface PromoteNextModalOptions {
  viewOnly?: boolean // Whether modal is in view-only mode (for history)
}

// ============================================================================
// Modal
// ============================================================================

export class PromoteNextModal extends Modal {
  private status: PromoteStatus
  private selectedTask: SelectedTask | null
  private reasoning: string | null
  private candidates: CandidateTask[]
  private currentNowTask: string | null
  private message: string | null
  private projectPath: string
  private onAction: PromoteNextActionCallback
  private viewOnly: boolean
  private currentAction: PromoteAction

  constructor(
    app: App,
    status: PromoteStatus,
    selectedTask: SelectedTask | null,
    reasoning: string | null,
    candidates: CandidateTask[],
    currentNowTask: string | null,
    message: string | null,
    projectPath: string,
    onAction: PromoteNextActionCallback,
    options: PromoteNextModalOptions = {},
  ) {
    super(app)
    this.status = status
    this.selectedTask = selectedTask
    this.reasoning = reasoning
    this.candidates = candidates
    this.currentNowTask = currentNowTask
    this.message = message
    this.projectPath = projectPath
    this.onAction = onAction
    this.viewOnly = options.viewOnly ?? false
    this.currentAction = getDefaultPromoteAction()
  }

  onOpen() {
    const { contentEl } = this
    contentEl.empty()

    // Style hooks
    this.modalEl.addClass('lachesis-promote-next-modal-root')
    contentEl.addClass('lachesis-promote-next-modal')

    this.render()
  }

  private render() {
    const { contentEl } = this
    contentEl.empty()

    // Header
    this.renderHeader(contentEl)

    // Content area
    const content = contentEl.createDiv({ cls: 'lachesis-promote-next-content' })

    if (this.status === 'already_active') {
      this.renderAlreadyActive(content)
    } else if (this.status === 'no_tasks') {
      this.renderNoTasks(content)
    } else if (this.status === 'success' && this.selectedTask) {
      this.renderSelectedTask(content)
      if (this.candidates.length > 0) {
        this.renderCandidates(content)
      }
    }

    // Footer
    this.renderFooter(contentEl)
  }

  private renderHeader(container: HTMLElement) {
    const header = container.createDiv({ cls: 'lachesis-promote-next-header' })
    header.createEl('h2', { text: 'Promote Task to Current' })

    let subtitle = ''
    if (this.status === 'success' && this.selectedTask) {
      subtitle = 'AI selected a task from Later'
    } else if (this.status === 'already_active') {
      subtitle = 'Current section already has tasks'
    } else {
      subtitle = 'No tasks available to promote'
    }

    header.createEl('p', { text: subtitle, cls: 'lachesis-promote-next-subtitle' })
  }

  private renderAlreadyActive(container: HTMLElement) {
    const messageEl = container.createDiv({ cls: 'lachesis-promote-next-message' })

    const iconEl = messageEl.createDiv({ cls: 'lachesis-promote-next-icon' })
    iconEl.setText('i')

    const textEl = messageEl.createDiv({ cls: 'lachesis-promote-next-message-text' })
    textEl.createEl('p', {
      text: 'The Current section already has tasks. Complete or archive them before promoting more.',
    })

    if (this.currentNowTask) {
      const currentTaskEl = textEl.createDiv({ cls: 'lachesis-promote-current-task' })
      currentTaskEl.createEl('strong', { text: 'Current task: ' })
      currentTaskEl.createSpan({ text: this.currentNowTask })
    }
  }

  private renderNoTasks(container: HTMLElement) {
    const messageEl = container.createDiv({ cls: 'lachesis-promote-next-message' })

    const iconEl = messageEl.createDiv({ cls: 'lachesis-promote-next-icon' })
    iconEl.setText('i')

    const textEl = messageEl.createDiv({ cls: 'lachesis-promote-next-message-text' })
    textEl.createEl('p', {
      text: this.message || 'Later section is empty. Add tasks to have something to promote.',
    })
  }

  private renderSelectedTask(container: HTMLElement) {
    if (!this.selectedTask) return

    const taskEl = container.createDiv({ cls: 'lachesis-promote-next-selected' })
    taskEl.createEl('h3', { text: 'Selected Task' })

    const taskRow = taskEl.createDiv({ cls: 'lachesis-promote-next-task-row' })

    // Task checkbox (unchecked)
    taskRow.createSpan({
      text: '[ ]',
      cls: 'lachesis-promote-task-checkbox',
    })

    // Task text
    taskRow.createEl('div', {
      text: this.selectedTask.text,
      cls: 'lachesis-promote-next-task-text',
    })

    // Source badge
    taskRow.createSpan({
      text: 'From Later',
      cls: 'lachesis-promote-next-source-badge',
    })

    // Slice link if present
    if (this.selectedTask.sliceLink) {
      const sliceEl = taskEl.createDiv({ cls: 'lachesis-promote-next-slice-link' })
      sliceEl.createSpan({ text: this.selectedTask.sliceLink })
    }

    // Reasoning
    if (this.reasoning) {
      const reasoningEl = taskEl.createDiv({ cls: 'lachesis-promote-next-reasoning' })
      reasoningEl.createEl('strong', { text: 'Why this task: ' })
      reasoningEl.createSpan({ text: this.reasoning })
    }

    // Action dropdown (if not view-only)
    if (!this.viewOnly) {
      const controlsEl = taskEl.createDiv({ cls: 'lachesis-promote-next-controls' })
      this.renderActionDropdown(controlsEl)
    }
  }

  private renderActionDropdown(container: HTMLElement) {
    const wrapper = container.createDiv({ cls: 'lachesis-promote-next-dropdown-wrapper' })
    wrapper.createEl('label', { text: 'Action:', cls: 'lachesis-promote-next-label' })

    const select = wrapper.createEl('select', { cls: 'lachesis-promote-next-dropdown' })

    const actions: PromoteAction[] = ['promote', 'skip']

    for (const action of actions) {
      const option = select.createEl('option', {
        text: PROMOTE_ACTION_LABELS[action],
        value: action,
      })
      if (action === this.currentAction) {
        option.selected = true
      }
    }

    select.addEventListener('change', () => {
      this.currentAction = select.value as PromoteAction
    })
  }

  private renderCandidates(container: HTMLElement) {
    const candidatesEl = container.createDiv({ cls: 'lachesis-promote-next-candidates' })

    // Collapsible header
    const headerEl = candidatesEl.createDiv({ cls: 'lachesis-promote-candidates-header' })
    headerEl.createEl('h4', { text: `Other Candidates (${this.candidates.length})` })

    // Candidates list (collapsed by default, we'll show it expanded for now)
    const list = candidatesEl.createEl('ul', { cls: 'lachesis-promote-next-candidates-list' })

    for (const candidate of this.candidates) {
      const item = list.createEl('li', { cls: 'lachesis-promote-candidate-item' })

      // Score badge
      const scoreBadge = item.createSpan({
        cls: `lachesis-candidate-score lachesis-score-${candidate.score}`,
      })
      scoreBadge.setText(`${candidate.score}/5`)

      // Task text (truncated)
      const textEl = item.createSpan({ cls: 'lachesis-candidate-text' })
      const displayText = candidate.text.length > 60
        ? candidate.text.slice(0, 60) + '...'
        : candidate.text
      textEl.setText(displayText)

      // Source section
      item.createSpan({
        text: getSourceSectionLabel(candidate.sourceSection),
        cls: 'lachesis-candidate-source',
      })

      // Note (why this score)
      if (candidate.note) {
        const noteEl = item.createDiv({ cls: 'lachesis-candidate-note' })
        noteEl.setText(candidate.note)
      }
    }
  }

  private renderFooter(container: HTMLElement) {
    const footer = container.createDiv({ cls: 'lachesis-promote-next-footer' })

    const buttonsEl = footer.createDiv({ cls: 'lachesis-promote-next-buttons' })

    const cancelBtn = buttonsEl.createEl('button', {
      text: this.viewOnly ? 'Close' : 'Cancel',
      cls: 'lachesis-promote-cancel-btn',
    })
    cancelBtn.addEventListener('click', () => this.handleCancel())

    // Only show Promote button if there's a task to promote and we're not view-only
    if (this.status === 'success' && this.selectedTask && !this.viewOnly) {
      const confirmBtn = buttonsEl.createEl('button', {
        text: 'Promote Task',
        cls: 'lachesis-promote-confirm-btn mod-cta',
      })
      confirmBtn.addEventListener('click', () => this.handleConfirm())
    }
  }

  private async handleConfirm() {
    const selection: PromoteSelection = {
      action: this.currentAction,
      selectedTask: this.currentAction === 'promote' ? this.selectedTask : null,
    }
    await this.onAction(selection, true)
    this.close()
  }

  private async handleCancel() {
    const selection: PromoteSelection = {
      action: 'skip',
      selectedTask: null,
    }
    await this.onAction(selection, false)
    this.close()
  }

  onClose() {
    const { contentEl } = this
    contentEl.empty()
  }
}
