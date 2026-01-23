// Workflow Executor Component
// UI bindings for workflows - delegates logic to WorkflowEngine

import type { App } from 'obsidian'
import { Notice, TFile } from 'obsidian'
import type { WorkflowDefinition, CombinedWorkflowState } from '../../core/workflows/types'
import { getAllWorkflows, getWorkflowDefinition } from '../../core/workflows/definitions'
import type { ProjectSnapshot, ExpectedCoreFile } from '../../core/project/snapshot'
import type { TaskSelection } from '../potential-tasks-modal'
import { PotentialTasksModal } from '../potential-tasks-modal'
import type { HarvestTaskSelection, RoadmapSlice } from '../../utils/harvest-tasks-parser'
import { HarvestTasksModal } from '../harvest-tasks-modal'
import type { GroomedIdeaSelection } from '../../utils/ideas-groom-parser'
import { IdeasGroomModal } from '../ideas-groom-modal'
import type { SyncCommitSelection, GitCommit } from '../../utils/sync-commits-parser'
import { SyncCommitsModal } from '../sync-commits-modal'
import type { ArchiveSelection } from '../../utils/archive-completed-parser'
import { ArchiveCompletedModal } from '../archive-completed-modal'
import type { EnrichTaskSelection } from '../../utils/enrich-tasks-parser'
import { EnrichTasksModal } from '../enrich-tasks-modal'
import type { PlannedTaskSelection, SuggestedSliceSelection } from '../../utils/plan-work-parser'
import { PlanWorkModal, PlanWorkInputModal } from '../plan-work-modal'
import type { PromoteSelection } from '../../utils/promote-next-parser'
import { PromoteNextModal } from '../promote-next-modal'
import { fetchCommits } from '../../github'
import { GitLogModal } from '../git-log-modal'
import { InitSummaryInputModal } from '../init-summary-modal'
import { BatchDiffViewerModal, type BatchDiffAction } from '../batch-diff-viewer-modal'
import type { InitSummaryFile } from '../../utils/init-summary-parser'
import type { DiffBlock } from '../../utils/diff'
import { WorkflowEngine, type WorkflowEngineCallbacks } from './workflow-engine'
import { generateWorkflowHint, type WorkflowHint } from '../../core/workflows/hints'

// ============================================================================
// Types
// ============================================================================

export type WorkflowExecutorCallbacks = {
  /** Called when a workflow needs AI processing */
  onTriggerAIWorkflow: (workflow: WorkflowDefinition, message: string) => void
  /** Called when a workflow sets a focused file (for fill workflows) */
  onSetFocusedFile: (file: ExpectedCoreFile, message: string) => void
  /** Called after workflow actions are applied to refresh the snapshot */
  onSnapshotRefresh: () => Promise<ProjectSnapshot>
  /** Called to add a message to the UI */
  onAddMessage: (role: 'assistant' | 'user', content: string) => void
  /** Called to set processing state */
  onSetProcessing: (processing: boolean, status: string) => void
  /** Called when planning mode is toggled */
  onPlanningModeToggle?: (enabled: boolean) => void
  /** Called when a workflow hint should be shown */
  onShowHint?: (hint: WorkflowHint) => void
}

// ============================================================================
// Workflow Executor Component
// ============================================================================

export class WorkflowExecutor {
  private app: App
  private projectPath: string
  private callbacks: WorkflowExecutorCallbacks
  private githubToken: string
  private engine: WorkflowEngine
  private planningModeBtn: HTMLButtonElement | null = null
  private _planningMode = false

  constructor(
    app: App,
    projectPath: string,
    snapshot: ProjectSnapshot,
    callbacks: WorkflowExecutorCallbacks,
    githubToken?: string,
  ) {
    this.app = app
    this.projectPath = projectPath
    this.callbacks = callbacks
    this.githubToken = githubToken ?? ''

    // Create engine callbacks (subset of executor callbacks)
    const engineCallbacks: WorkflowEngineCallbacks = {
      onTriggerAIWorkflow: callbacks.onTriggerAIWorkflow,
      onSetFocusedFile: callbacks.onSetFocusedFile,
      onAddMessage: callbacks.onAddMessage,
      onSetProcessing: callbacks.onSetProcessing,
    }

    this.engine = new WorkflowEngine(projectPath, snapshot, engineCallbacks)
  }

  /**
   * Update the snapshot reference.
   */
  setSnapshot(snapshot: ProjectSnapshot): void {
    this.engine.setSnapshot(snapshot)
  }

  /**
   * Get planning mode state.
   */
  get planningMode(): boolean {
    return this._planningMode
  }

  /**
   * Set planning mode state and update UI.
   */
  setPlanningMode(enabled: boolean): void {
    this._planningMode = enabled
    this.updatePlanningModeButton()
  }

  /**
   * Update the planning mode button appearance.
   */
  private updatePlanningModeButton(): void {
    if (!this.planningModeBtn) return
    if (this._planningMode) {
      this.planningModeBtn.addClass('active')
      this.planningModeBtn.setText('Planning Mode')
    } else {
      this.planningModeBtn.removeClass('active')
      this.planningModeBtn.setText('Planning Mode')
    }
  }

  /**
   * Render workflow buttons into the container.
   */
  renderWorkflowButtons(container: HTMLElement, onStartChat: () => void): void {
    const snapshot = this.engine.getSnapshot()

    // Start Chat button - triggers the opening message
    const startChatBtn = container.createEl('button', {
      text: 'Start Chat',
      cls: 'lachesis-workflow-button lachesis-start-chat-button',
    })
    startChatBtn.addEventListener('click', onStartChat)

    // Planning Mode toggle button
    this.planningModeBtn = container.createEl('button', {
      text: 'Planning Mode',
      cls: 'lachesis-workflow-button lachesis-planning-mode-button',
    })
    this.updatePlanningModeButton()
    this.planningModeBtn.addEventListener('click', () => {
      this._planningMode = !this._planningMode
      this.updatePlanningModeButton()
      this.callbacks.onPlanningModeToggle?.(this._planningMode)
    })

    // Git Log button - show recent commits if GitHub repo is configured
    if (snapshot.aiConfig?.github_repo) {
      const gitLogBtn = container.createEl('button', {
        text: 'Git Log',
        cls: 'lachesis-workflow-button lachesis-git-log-button',
      })
      gitLogBtn.addEventListener('click', () => {
        const modal = new GitLogModal(
          this.app,
          snapshot.aiConfig!.github_repo!,
          this.githubToken
        )
        modal.open()
      })
    }

    // Workflow buttons (filter out hidden workflows)
    for (const workflow of getAllWorkflows()) {
      if (workflow.hidden) continue
      const btn = container.createEl('button', {
        text: workflow.displayName,
        cls: 'lachesis-workflow-button',
      })
      btn.addEventListener('click', () => {
        this.triggerWorkflow(workflow.displayName)
      })
    }
  }

  /**
   * Detect if a user message is requesting a workflow.
   * Returns the workflow definition if detected, null otherwise.
   */
  detectWorkflowFromMessage(message: string): WorkflowDefinition | null {
    return this.engine.detectWorkflowFromMessage(message)
  }

  /**
   * Trigger a workflow by display name.
   */
  triggerWorkflow(workflowDisplayName: string): void {
    // Find the workflow by display name
    const workflow = getAllWorkflows().find((w) => w.displayName === workflowDisplayName)
    if (!workflow) return

    const action = this.engine.getWorkflowTriggerAction(workflow)

    switch (action.type) {
      case 'non-ai':
        this.handleNonAIWorkflow(workflow)
        break
      case 'focused-file':
        this.callbacks.onSetFocusedFile(action.focusedFile!, action.focusedMessage!)
        break
      case 'input-modal':
        if (workflow.name === 'plan-work') {
          this.openPlanWorkInputModal(workflow)
        } else {
          this.openInitSummaryInputModal(workflow)
        }
        break
      case 'ai':
        this.callbacks.onTriggerAIWorkflow(workflow, action.aiMessage!)
        break
    }
  }

  /**
   * Handle workflows that don't require AI processing.
   */
  async handleNonAIWorkflow(_workflow: WorkflowDefinition): Promise<void> {
    // No non-AI workflows currently active
  }

  /**
   * Advance to the next step in the combined workflow.
   * @deprecated Combined workflows removed
   */
  advanceCombinedWorkflow(): void {
    // Combined workflows removed - no-op
  }

  /**
   * Check if a combined workflow is currently active.
   * @deprecated Combined workflows removed
   */
  isCombinedWorkflowActive(): boolean {
    return false
  }

  /**
   * Get the current combined workflow state.
   * @deprecated Combined workflows removed
   */
  getCombinedWorkflowState(): CombinedWorkflowState | null {
    return null
  }

  // ============================================================================
  // Init From Summary Workflow
  // ============================================================================

  /**
   * Handle the AI response from archive-completed workflow.
   */
  async handleArchiveCompletedResponse(content: string): Promise<void> {
    try {
      const tasksPath = `${this.projectPath}/Tasks.md`
      const tasksFile = this.app.vault.getAbstractFileByPath(tasksPath)

      if (!tasksFile || !(tasksFile instanceof TFile)) {
        new Notice('Tasks.md not found')
        return
      }

      const tasksContent = await this.app.vault.read(tasksFile)
      const completedTasks = this.engine.extractCompletedTasks(tasksContent)

      if (completedTasks.length === 0) {
        new Notice('No completed tasks found to archive.')
        return
      }

      const result = this.engine.parseArchiveCompleted(content, completedTasks)

      if (!result.success) {
        new Notice(`Failed to parse response: ${result.error}`)
        return
      }

      this.openArchiveCompletedModal()
    } catch (err) {
      console.error('Failed to process archive completed response:', err)
      new Notice(`Failed to process completed tasks: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  /**
   * Open the archive completed review modal.
   */
  private openArchiveCompletedModal(): void {
    const modal = new ArchiveCompletedModal(
      this.app,
      this.engine.getPendingSliceGroups(),
      this.engine.getPendingStandaloneTasks(),
      this.projectPath,
      (selections, confirmed) => this.handleArchiveCompletedAction(selections, confirmed)
    )
    modal.open()
  }

  /**
   * Open the archive completed modal for viewing from chat history.
   */
  async openArchiveCompletedModalForHistory(content: string): Promise<void> {
    try {
      const tasksPath = `${this.projectPath}/Tasks.md`
      const tasksFile = this.app.vault.getAbstractFileByPath(tasksPath)

      if (!tasksFile || !(tasksFile instanceof TFile)) {
        new Notice('Tasks.md not found')
        return
      }

      const tasksContent = await this.app.vault.read(tasksFile)
      const completedTasks = this.engine.extractCompletedTasks(tasksContent)

      if (completedTasks.length === 0) {
        new Notice('No completed tasks found. They may have already been archived.')
        return
      }

      const result = this.engine.parseArchiveCompleted(content, completedTasks)

      const modal = new ArchiveCompletedModal(
        this.app,
        result.sliceGroups,
        result.standaloneTasks,
        this.projectPath,
        (selections, confirmed) => this.handleArchiveCompletedAction(selections, confirmed)
      )
      modal.open()
    } catch (err) {
      console.error('Failed to open archive completed modal for history:', err)
      new Notice(`Failed to open tasks: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  /**
   * Handle actions from the archive completed modal.
   */
  private async handleArchiveCompletedAction(
    selections: ArchiveSelection[],
    confirmed: boolean
  ): Promise<void> {
    if (!confirmed) return

    const archiveSelections = selections.filter((s) => s.action === 'archive')

    if (archiveSelections.length === 0) {
      new Notice('No tasks selected for archiving.')
      return
    }

    try {
      const tasksPath = `${this.projectPath}/Tasks.md`
      const archivePath = `${this.projectPath}/Archive.md`
      const tasksFile = this.app.vault.getAbstractFileByPath(tasksPath)
      const archiveFile = this.app.vault.getAbstractFileByPath(archivePath)

      if (!tasksFile || !(tasksFile instanceof TFile)) {
        new Notice('Tasks.md not found')
        return
      }

      const tasksContent = await this.app.vault.read(tasksFile)
      const archiveContent = archiveFile instanceof TFile
        ? await this.app.vault.read(archiveFile)
        : ''

      const result = this.engine.applyArchiveSelections(tasksContent, archiveContent, selections)

      await this.app.vault.modify(tasksFile, result.newTasksContent)

      if (archiveFile instanceof TFile) {
        await this.app.vault.modify(archiveFile, result.newArchiveContent)
      }

      new Notice(`Archived ${result.archivedCount} task${result.archivedCount === 1 ? '' : 's'}`)

      this.engine.clearArchiveCompletedState()
      await this.callbacks.onSnapshotRefresh()
    } catch (err) {
      console.error('Failed to apply archive selections:', err)
      new Notice(`Failed to archive tasks: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  // ============================================================================
  // Promote Next Task Workflow
  // ============================================================================

  /**
   * Handle the AI response from the promote-next-task workflow.
   */
  async handlePromoteNextResponse(content: string): Promise<void> {
    try {
      const result = this.engine.parsePromoteNext(content)

      if (result.status === 'already_active') {
        this.callbacks.onAddMessage('assistant', 'Current section already has tasks. No promotion needed.')
        this.engine.advanceCombinedWorkflow()
        this.advanceCombinedWorkflow()
        return
      }

      if (result.status === 'no_tasks') {
        this.callbacks.onAddMessage('assistant', result.message || 'No tasks available to promote. Later section is empty.')
        this.engine.advanceCombinedWorkflow()
        this.advanceCombinedWorkflow()
        return
      }

      // Show selection in chat and wait for keyword
      this.showPromoteSelectionInChat()
    } catch (err) {
      console.error('Failed to process promote next response:', err)
      new Notice(`Failed to process response: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  /**
   * Show the promote task selection in chat.
   */
  private showPromoteSelectionInChat(): void {
    const message = this.engine.buildPromoteSelectionMessage()
    if (!message) {
      this.engine.advanceCombinedWorkflow()
      this.advanceCombinedWorkflow()
      return
    }

    this.callbacks.onAddMessage('assistant', message)
    this.engine.setAwaitingPromoteKeyword(true)
  }

  /**
   * Check if user input contains the promote keyword.
   */
  async checkPromoteKeyword(userInput: string): Promise<boolean> {
    if (!this.engine.isAwaitingPromoteKeyword()) {
      return false
    }

    const result = this.engine.checkPromoteKeywordInput(userInput)

    if (result === 'confirm') {
      this.engine.setAwaitingPromoteKeyword(false)
      const selectedTask = this.engine.getPendingSelectedTask()
      if (selectedTask) {
        const selection: PromoteSelection = {
          action: 'promote',
          selectedTask,
        }
        await this.handlePromoteNextAction(selection, true)
      } else {
        this.engine.advanceCombinedWorkflow()
        this.advanceCombinedWorkflow()
      }
      return true
    }

    if (result === 'skip') {
      this.engine.setAwaitingPromoteKeyword(false)
      this.callbacks.onAddMessage('assistant', 'Skipping task promotion.')
      this.engine.clearPromoteNextState()
      this.engine.advanceCombinedWorkflow()
      this.advanceCombinedWorkflow()
      return true
    }

    // Not recognized - remind user
    this.callbacks.onAddMessage(
      'assistant',
      `Please say **${WorkflowEngine.PROMOTE_KEYWORD}**, **YES**, or **CONFIRM** to promote the task, or **SKIP** to continue without promoting.`
    )
    return true
  }

  /**
   * Check if we're awaiting the promote keyword.
   */
  isAwaitingPromoteKeyword(): boolean {
    return this.engine.isAwaitingPromoteKeyword()
  }

  /**
   * Open the promote next task modal for viewing from history.
   */
  async openPromoteNextModalForHistory(content: string): Promise<void> {
    try {
      const result = this.engine.parsePromoteNext(content)

      // Check if already promoted
      if (result.status === 'success' && result.selectedTask) {
        const tasksPath = `${this.projectPath}/Tasks.md`
        const tasksFile = this.app.vault.getAbstractFileByPath(tasksPath)

        if (tasksFile && tasksFile instanceof TFile) {
          const tasksContent = await this.app.vault.read(tasksFile)
          if (this.engine.checkTaskAlreadyPromoted(tasksContent)) {
            this.engine.setPendingPromoteMessage('Task has already been promoted to Current section.')
          }
        }
      }

      const modal = new PromoteNextModal(
        this.app,
        this.engine.getPendingPromoteStatus(),
        this.engine.getPendingSelectedTask(),
        this.engine.getPendingPromoteReasoning(),
        this.engine.getPendingPromoteCandidates(),
        this.engine.getPendingExistingCurrentTask(),
        this.engine.getPendingPromoteMessage(),
        this.projectPath,
        (selection, confirmed) => this.handlePromoteNextAction(selection, confirmed),
        { viewOnly: true }
      )
      modal.open()
    } catch (err) {
      console.error('Failed to open promote next modal for history:', err)
      new Notice(`Failed to open promotion: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  /**
   * Handle actions from the promote next modal.
   */
  private async handlePromoteNextAction(
    selection: PromoteSelection,
    confirmed: boolean
  ): Promise<void> {
    if (!confirmed || selection.action === 'skip' || !selection.selectedTask) {
      this.engine.clearPromoteNextState()
      this.engine.advanceCombinedWorkflow()
      this.advanceCombinedWorkflow()
      return
    }

    try {
      const tasksPath = `${this.projectPath}/Tasks.md`
      const roadmapPath = `${this.projectPath}/Roadmap.md`
      const tasksFile = this.app.vault.getAbstractFileByPath(tasksPath)
      const roadmapFile = this.app.vault.getAbstractFileByPath(roadmapPath)

      if (!tasksFile || !(tasksFile instanceof TFile)) {
        new Notice('Tasks.md not found')
        return
      }

      const tasksContent = await this.app.vault.read(tasksFile)
      const roadmapContent = roadmapFile instanceof TFile
        ? await this.app.vault.read(roadmapFile)
        : null

      const result = this.engine.applyTaskPromotion(tasksContent, roadmapContent)

      await this.app.vault.modify(tasksFile, result.newTasksContent)

      if (result.newRoadmapContent && roadmapFile instanceof TFile) {
        await this.app.vault.modify(roadmapFile, result.newRoadmapContent)
      }

      if (result.roadmapUpdated) {
        new Notice('Task promoted to Current. Roadmap focus updated.')
      } else {
        new Notice('Task promoted to Current section')
      }

      this.engine.clearPromoteNextState()
      await this.callbacks.onSnapshotRefresh()
    } catch (err) {
      console.error('Failed to promote task:', err)
      new Notice(`Failed to promote task: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }

    this.engine.advanceCombinedWorkflow()
    this.advanceCombinedWorkflow()
  }

  // ============================================================================
  // Enrich Tasks Workflow
  // ============================================================================

  /**
   * Handle the AI response from the enrich-tasks workflow.
   */
  async handleEnrichTasksResponse(content: string): Promise<void> {
    try {
      const result = this.engine.parseEnrichTasks(content)

      if (!result.success || result.enrichments.length === 0) {
        new Notice('No tasks found to enrich.')
        return
      }

      this.openEnrichTasksModal()
    } catch (err) {
      console.error('Failed to process enrich tasks response:', err)
      new Notice(`Failed to process tasks: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  /**
   * Open the enrich tasks review modal.
   */
  private openEnrichTasksModal(): void {
    const modal = new EnrichTasksModal(
      this.app,
      this.engine.getPendingEnrichments(),
      this.projectPath,
      (selections, confirmed) => this.handleEnrichTasksAction(selections, confirmed)
    )
    modal.open()
  }

  /**
   * Handle actions from the enrich tasks modal.
   */
  private async handleEnrichTasksAction(
    selections: EnrichTaskSelection[],
    confirmed: boolean
  ): Promise<void> {
    if (!confirmed) return

    const selectedCount = selections.filter((s) => s.selected).length

    if (selectedCount === 0) {
      new Notice('No enrichments selected.')
      return
    }

    try {
      const tasksPath = `${this.projectPath}/Tasks.md`
      const tasksFile = this.app.vault.getAbstractFileByPath(tasksPath)

      if (!tasksFile || !(tasksFile instanceof TFile)) {
        new Notice('Tasks.md not found')
        return
      }

      const tasksContent = await this.app.vault.read(tasksFile)
      const newContent = this.engine.applyEnrichSelections(tasksContent, selections)
      await this.app.vault.modify(tasksFile, newContent)

      new Notice(`Applied ${selectedCount} enrichment${selectedCount !== 1 ? 's' : ''} to Tasks.md`)

      this.engine.clearEnrichTasksState()
      await this.callbacks.onSnapshotRefresh()
    } catch (err) {
      console.error('Failed to apply enrichments:', err)
      new Notice(`Failed to apply enrichments: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  /**
   * Open the enrich tasks modal for viewing history.
   */
  async openEnrichTasksModalForHistory(content: string): Promise<void> {
    try {
      const result = this.engine.parseEnrichTasks(content)

      if (!result.success || result.enrichments.length === 0) {
        new Notice('Could not parse enrichments from response.')
        return
      }

      const modal = new EnrichTasksModal(
        this.app,
        this.engine.getPendingEnrichments(),
        this.projectPath,
        (selections, confirmed) => this.handleEnrichTasksAction(selections, confirmed),
        { viewOnly: true }
      )
      modal.open()
    } catch (err) {
      console.error('Failed to open enrich tasks modal for history:', err)
      new Notice(`Failed to open enrichments: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  // ============================================================================
  // Init From Summary Workflow
  // ============================================================================

  /**
   * Open the init summary input modal.
   */
  private openInitSummaryInputModal(workflow: WorkflowDefinition): void {
    const inputModal = new InitSummaryInputModal(
      this.app,
      (summary, confirmed) => {
        if (confirmed && summary.trim()) {
          this.callbacks.onTriggerAIWorkflow(
            workflow,
            `Initialize project from this design summary:\n\n${summary}`
          )
        }
      }
    )
    inputModal.open()
  }

  /**
   * Handle the AI response from the init-from-summary workflow.
   */
  async handleInitFromSummaryResponse(content: string): Promise<void> {
    try {
      const result = this.engine.parseInitFromSummary(content)

      if (!result.hasDiffs) {
        // No diffs - AI is probably asking clarifying questions
        return
      }

      if (result.diffs.size === 0) {
        new Notice('Could not parse diffs from response.')
        return
      }

      const modal = new BatchDiffViewerModal(
        this.app,
        result.diffs,
        this.projectPath,
        (results, action) => this.handleInitFromSummaryAction(results, action)
      )
      modal.open()
    } catch (err) {
      console.error('Failed to process init from summary response:', err)
      new Notice(`Failed to process response: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  /**
   * Handle actions from the batch diff viewer modal.
   */
  private async handleInitFromSummaryAction(
    results: Map<InitSummaryFile, 'accepted' | 'rejected'>,
    action: BatchDiffAction
  ): Promise<void> {
    const accepted = Array.from(results.values()).filter((s) => s === 'accepted').length

    if (accepted > 0) {
      new Notice(`Applied ${accepted} file${accepted === 1 ? '' : 's'}`)

      // Show hint for next workflow
      const hint = generateWorkflowHint('init-from-summary', { snapshot: this.engine.getSnapshot() }, accepted)
      if (hint?.shouldShow) {
        this.callbacks.onShowHint?.(hint)
      }
    }

    await this.callbacks.onSnapshotRefresh()
  }

  // ============================================================================
  // Plan Work Workflow
  // ============================================================================

  /**
   * Open the plan work input modal.
   */
  private openPlanWorkInputModal(workflow: WorkflowDefinition): void {
    const inputModal = new PlanWorkInputModal(
      this.app,
      (workDescription, confirmed) => {
        if (confirmed && workDescription.trim()) {
          this.callbacks.onTriggerAIWorkflow(
            workflow,
            `Plan work for: ${workDescription}`
          )
        }
      }
    )
    inputModal.open()
  }

  /**
   * Handle the AI response from the plan-work workflow.
   */
  async handlePlanWorkResponse(content: string): Promise<void> {
    try {
      const result = this.engine.parsePlanWork(content)

      if (!result.success || (result.tasks.length === 0 && result.slices.length === 0)) {
        new Notice('No tasks or slices generated.')
        return
      }

      this.openPlanWorkModal()
    } catch (err) {
      console.error('Failed to process plan work response:', err)
      new Notice(`Failed to process response: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  /**
   * Open the plan work review modal.
   */
  private openPlanWorkModal(): void {
    const modal = new PlanWorkModal(
      this.app,
      this.engine.getPendingPlannedTasks(),
      this.engine.getPendingSuggestedSlices(),
      this.projectPath,
      (taskSelections, sliceSelections, confirmed) =>
        this.handlePlanWorkAction(taskSelections, sliceSelections, confirmed)
    )
    modal.open()
  }

  /**
   * Handle actions from the plan work modal.
   */
  private async handlePlanWorkAction(
    taskSelections: PlannedTaskSelection[],
    sliceSelections: SuggestedSliceSelection[],
    confirmed: boolean
  ): Promise<void> {
    if (!confirmed) return

    const selectedTasks = taskSelections.filter((s) => s.selected && s.destination !== 'discard')
    const selectedSlices = sliceSelections.filter((s) => s.selected)

    if (selectedTasks.length === 0 && selectedSlices.length === 0) {
      new Notice('No items selected.')
      return
    }

    try {
      const tasksPath = `${this.projectPath}/Tasks.md`
      const roadmapPath = `${this.projectPath}/Roadmap.md`
      const tasksFile = this.app.vault.getAbstractFileByPath(tasksPath)
      const roadmapFile = this.app.vault.getAbstractFileByPath(roadmapPath)

      if (!tasksFile || !(tasksFile instanceof TFile)) {
        new Notice('Tasks.md not found')
        return
      }

      const tasksContent = await this.app.vault.read(tasksFile)
      const roadmapContent = roadmapFile instanceof TFile
        ? await this.app.vault.read(roadmapFile)
        : ''

      const result = this.engine.applyPlanWorkSelections(
        tasksContent,
        roadmapContent,
        taskSelections,
        sliceSelections
      )

      await this.app.vault.modify(tasksFile, result.newTasksContent)

      if (result.newRoadmapContent && roadmapFile instanceof TFile) {
        await this.app.vault.modify(roadmapFile, result.newRoadmapContent)
      }

      const parts: string[] = []
      if (result.tasksAdded > 0) parts.push(`${result.tasksAdded} task${result.tasksAdded !== 1 ? 's' : ''} added`)
      if (result.slicesAdded > 0) parts.push(`${result.slicesAdded} slice${result.slicesAdded !== 1 ? 's' : ''} added`)
      new Notice(parts.join(', '))

      // Show hint for next workflow
      if (result.tasksAdded > 0) {
        const hint = generateWorkflowHint('plan-work', { snapshot: this.engine.getSnapshot() }, result.tasksAdded)
        if (hint?.shouldShow) {
          this.callbacks.onShowHint?.(hint)
        }
      }

      this.engine.clearPlanWorkState()
      await this.callbacks.onSnapshotRefresh()
    } catch (err) {
      console.error('Failed to apply plan work selections:', err)
      new Notice(`Failed to apply changes: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  /**
   * Open the plan work modal for viewing history.
   */
  async openPlanWorkModalForHistory(content: string): Promise<void> {
    try {
      const result = this.engine.parsePlanWork(content)

      if (!result.success || (result.tasks.length === 0 && result.slices.length === 0)) {
        new Notice('Could not parse plan work from response.')
        return
      }

      const modal = new PlanWorkModal(
        this.app,
        this.engine.getPendingPlannedTasks(),
        this.engine.getPendingSuggestedSlices(),
        this.projectPath,
        (taskSelections, sliceSelections, confirmed) =>
          this.handlePlanWorkAction(taskSelections, sliceSelections, confirmed),
        { viewOnly: true }
      )
      modal.open()
    } catch (err) {
      console.error('Failed to open plan work modal for history:', err)
      new Notice(`Failed to open plan: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }
}
