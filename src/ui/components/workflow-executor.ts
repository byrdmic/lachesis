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
import type { PromoteSelection } from '../../utils/promote-next-parser'
import { PromoteNextModal } from '../promote-next-modal'
import { fetchCommits } from '../../github'
import { GitLogModal } from '../git-log-modal'
import { InitSummaryInputModal } from '../init-summary-modal'
import { BatchDiffViewerModal, type BatchDiffAction } from '../batch-diff-viewer-modal'
import type { InitSummaryFile } from '../../utils/init-summary-parser'
import type { DiffBlock } from '../../utils/diff'
import { WorkflowEngine, type WorkflowEngineCallbacks } from './workflow-engine'

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
      case 'combined':
        this.startCombinedWorkflow(workflow)
        break
      case 'focused-file':
        this.callbacks.onSetFocusedFile(action.focusedFile!, action.focusedMessage!)
        break
      case 'input-modal':
        this.openInitSummaryInputModal(workflow)
        break
      case 'ai':
        this.callbacks.onTriggerAIWorkflow(workflow, action.aiMessage!)
        break
    }
  }

  /**
   * Handle workflows that don't require AI processing.
   */
  async handleNonAIWorkflow(workflow: WorkflowDefinition): Promise<void> {
    if (workflow.name === 'groom-tasks') {
      await this.handleGroomTasksWorkflow()
    }
  }

  // ============================================================================
  // Combined Workflow Execution
  // ============================================================================

  /**
   * Start a combined workflow.
   */
  private startCombinedWorkflow(workflow: WorkflowDefinition): void {
    const state = this.engine.initCombinedWorkflow(workflow)
    if (!state) return
    this.runCurrentCombinedStep()
  }

  /**
   * Run the current step in the combined workflow.
   */
  private runCurrentCombinedStep(): void {
    const current = this.engine.getCurrentCombinedStep()
    if (!current) {
      this.completeCombinedWorkflow()
      return
    }

    this.engine.markCurrentStepRunning()

    // Show step indicator
    const stepLabel = `Step ${current.index + 1} of ${current.total}: ${current.workflow.displayName}`
    this.callbacks.onAddMessage('assistant', `**${stepLabel}**`)

    const state = this.engine.getCombinedWorkflowState()
    if (!state) return

    // Handle different combined workflows
    if (state.combinedName === 'log-refine') {
      this.runLogRefineStep(current.step, current.workflow)
    } else if (state.combinedName === 'tasks-harvest') {
      this.runTasksHarvestStep(current.step, current.workflow)
    } else if (state.combinedName === 'tasks-maintenance') {
      this.runTasksMaintenanceStep(current.step, current.workflow)
    }
  }

  /**
   * Run a step in the log-refine combined workflow.
   */
  private runLogRefineStep(step: { workflowName: string; status: string }, workflow: WorkflowDefinition): void {
    if (step.workflowName === 'title-entries' || step.workflowName === 'generate-tasks') {
      if (step.workflowName === 'title-entries') {
        const combinedWorkflow = getWorkflowDefinition('log-refine')
        this.callbacks.onTriggerAIWorkflow(combinedWorkflow, 'Refine the log: add titles and extract potential tasks')
      } else {
        this.engine.advanceCombinedWorkflow()
        this.advanceCombinedWorkflow()
      }
    } else if (step.workflowName === 'groom-tasks') {
      this.handleGroomTasksWorkflow().then(() => {
        this.engine.advanceCombinedWorkflow()
        this.advanceCombinedWorkflow()
      })
    }
  }

  /**
   * Run a step in the tasks-harvest combined workflow.
   */
  private runTasksHarvestStep(step: { workflowName: string; status: string }, workflow: WorkflowDefinition): void {
    if (step.workflowName === 'harvest-tasks') {
      const combinedWorkflow = getWorkflowDefinition('tasks-harvest')
      this.callbacks.onTriggerAIWorkflow(combinedWorkflow, 'Harvest actionable tasks from all project files')
    } else if (step.workflowName === 'ideas-groom') {
      this.engine.advanceCombinedWorkflow()
      this.advanceCombinedWorkflow()
    }
  }

  /**
   * Run a step in the tasks-maintenance combined workflow.
   */
  private async runTasksMaintenanceStep(step: { workflowName: string; status: string }, workflow: WorkflowDefinition): Promise<void> {
    const snapshot = this.engine.getSnapshot()

    if (step.workflowName === 'sync-commits') {
      if (!snapshot.aiConfig?.github_repo) {
        this.engine.skipCurrentStep('No GitHub repository configured')
        this.callbacks.onAddMessage('assistant', `*Skipping sync commits: No GitHub repository configured*`)
        this.engine.advanceCombinedWorkflow()
        this.advanceCombinedWorkflow()
        return
      }

      const syncWorkflow = getWorkflowDefinition('sync-commits')
      this.callbacks.onTriggerAIWorkflow(syncWorkflow, 'Sync recent commits to tasks')
    } else if (step.workflowName === 'archive-completed') {
      const archiveWorkflow = getWorkflowDefinition('archive-completed')
      this.callbacks.onTriggerAIWorkflow(archiveWorkflow, 'Archive completed tasks')
    } else if (step.workflowName === 'promote-next-task') {
      const tasksPath = `${this.projectPath}/Tasks.md`
      const tasksFile = this.app.vault.getAbstractFileByPath(tasksPath)

      if (tasksFile && tasksFile instanceof TFile) {
        const tasksContent = await this.app.vault.read(tasksFile)
        if (this.engine.checkHasTasksInCurrent(tasksContent)) {
          this.engine.skipCurrentStep('Current section already has tasks')
          this.callbacks.onAddMessage('assistant', `*Skipping task promotion: Current section already has tasks*`)
          this.engine.advanceCombinedWorkflow()
          this.advanceCombinedWorkflow()
          return
        }
      }

      const promoteWorkflow = getWorkflowDefinition('promote-next-task')
      this.callbacks.onTriggerAIWorkflow(promoteWorkflow, 'Select the best task to promote to Current')
    }
  }

  /**
   * Advance to the next step in the combined workflow.
   */
  advanceCombinedWorkflow(): void {
    if (this.engine.isCombinedWorkflowComplete()) {
      this.completeCombinedWorkflow()
    } else {
      this.runCurrentCombinedStep()
    }
  }

  /**
   * Complete the combined workflow.
   */
  private completeCombinedWorkflow(): void {
    const summary = this.engine.getCombinedWorkflowSummary()
    if (summary) {
      const message = summary.skipped > 0
        ? `Completed ${summary.displayName}: ${summary.completed} steps completed, ${summary.skipped} skipped`
        : `Completed ${summary.displayName}`
      this.callbacks.onAddMessage('assistant', `**${message}**`)
    }
    this.engine.clearCombinedWorkflowState()
  }

  /**
   * Check if a combined workflow is currently active.
   */
  isCombinedWorkflowActive(): boolean {
    return this.engine.isCombinedWorkflowActive()
  }

  /**
   * Get the current combined workflow state.
   */
  getCombinedWorkflowState(): CombinedWorkflowState | null {
    return this.engine.getCombinedWorkflowState()
  }

  // ============================================================================
  // Groom Tasks Workflow
  // ============================================================================

  /**
   * Handle the Groom Tasks workflow.
   */
  private async handleGroomTasksWorkflow(): Promise<void> {
    try {
      this.callbacks.onSetProcessing(true, 'Scanning Log.md for potential tasks...')

      const logPath = `${this.projectPath}/Log.md`
      const logFile = this.app.vault.getAbstractFileByPath(logPath)

      if (!logFile || !(logFile instanceof TFile)) {
        this.callbacks.onSetProcessing(false, 'Log.md not found')
        new Notice('Log.md not found in project')
        return
      }

      const content = await this.app.vault.read(logFile)
      const result = this.engine.parseGroomTasks(content)

      if (!result.success || result.actionableCount === 0) {
        this.callbacks.onSetProcessing(false, 'No potential tasks found')
        new Notice('No actionable potential tasks found in Log.md. Run "Generate Tasks" first to create some.')
        return
      }

      this.callbacks.onAddMessage(
        'assistant',
        `Found ${result.actionableCount} potential task${result.actionableCount > 1 ? 's' : ''} in Log.md. Opening review modal...`
      )

      this.openPotentialTasksModal()
      this.callbacks.onSetProcessing(false, 'Ready')
    } catch (err) {
      console.error('Failed to run Groom Tasks workflow:', err)
      this.callbacks.onSetProcessing(false, 'Error scanning for tasks')
      new Notice(`Failed to scan for tasks: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  /**
   * Open the potential tasks review modal.
   */
  private openPotentialTasksModal(): void {
    const modal = new PotentialTasksModal(
      this.app,
      this.engine.getPendingPotentialTasks(),
      this.projectPath,
      (selections, confirmed) => this.handlePotentialTasksAction(selections, confirmed)
    )
    modal.open()
  }

  /**
   * Handle actions from the potential tasks modal.
   */
  private async handlePotentialTasksAction(
    selections: TaskSelection[],
    confirmed: boolean
  ): Promise<void> {
    if (!confirmed) return

    const rejects = selections.filter((s) => s.action === 'reject')
    const moves = selections.filter((s) => s.action === 'move-to-future')

    try {
      if (rejects.length > 0 || moves.length > 0) {
        const logPath = `${this.projectPath}/Log.md`
        const tasksPath = `${this.projectPath}/Tasks.md`
        const logFile = this.app.vault.getAbstractFileByPath(logPath)
        const tasksFile = this.app.vault.getAbstractFileByPath(tasksPath)

        if (logFile && logFile instanceof TFile && tasksFile && tasksFile instanceof TFile) {
          const logContent = await this.app.vault.read(logFile)
          const tasksContent = await this.app.vault.read(tasksFile)

          const result = this.engine.applyGroomTaskActions(logContent, tasksContent, selections)

          if (result.newLogContent !== null) {
            await this.app.vault.modify(logFile, result.newLogContent)
          }
          if (result.newTasksContent !== null) {
            await this.app.vault.modify(tasksFile, result.newTasksContent)
          }
        }
      }

      this.engine.clearGroomTasksState()
      await this.callbacks.onSnapshotRefresh()
    } catch (err) {
      console.error('Failed to apply potential task actions:', err)
    }
  }

  // ============================================================================
  // Harvest Tasks Workflow
  // ============================================================================

  /**
   * Handle the AI response from the harvest-tasks workflow.
   */
  async handleHarvestTasksResponse(content: string): Promise<void> {
    try {
      const result = this.engine.parseHarvestTasks(content)

      if (!result.success || result.tasks.length === 0) {
        new Notice('No new tasks found to harvest.')
        return
      }

      // Read Roadmap.md for slices
      const roadmapPath = `${this.projectPath}/Roadmap.md`
      const roadmapFile = this.app.vault.getAbstractFileByPath(roadmapPath)

      if (roadmapFile && roadmapFile instanceof TFile) {
        const roadmapContent = await this.app.vault.read(roadmapFile)
        this.engine.parseRoadmapForSlices(roadmapContent)
      }

      this.openHarvestTasksModal()
    } catch (err) {
      console.error('Failed to process harvest tasks response:', err)
      new Notice(`Failed to process tasks: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  /**
   * Open the harvest tasks review modal.
   */
  private openHarvestTasksModal(): void {
    const modal = new HarvestTasksModal(
      this.app,
      this.engine.getPendingHarvestedTasks(),
      this.projectPath,
      this.engine.getRoadmapSlices(),
      (selections, confirmed) => this.handleHarvestTasksAction(selections, confirmed)
    )
    modal.open()
  }

  /**
   * Handle actions from the harvest tasks modal.
   */
  private async handleHarvestTasksAction(
    selections: HarvestTaskSelection[],
    confirmed: boolean
  ): Promise<void> {
    if (!confirmed) return

    const tasksToAdd = selections.filter((s) => s.destination !== 'discard')
    const tasksToDiscard = selections.filter((s) => s.destination === 'discard')

    if (tasksToAdd.length === 0 && tasksToDiscard.length === 0) {
      new Notice('No tasks to process.')
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
      const newContent = this.engine.applyHarvestSelections(tasksContent, selections)
      await this.app.vault.modify(tasksFile, newContent)

      const parts: string[] = []
      if (tasksToAdd.length > 0) parts.push(`${tasksToAdd.length} added`)
      if (tasksToDiscard.length > 0) parts.push(`${tasksToDiscard.length} discarded`)
      new Notice(`Tasks: ${parts.join(', ')}`)

      this.engine.clearHarvestTasksState()
      await this.callbacks.onSnapshotRefresh()
    } catch (err) {
      console.error('Failed to apply harvest task selections:', err)
      new Notice(`Failed to add tasks: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  /**
   * Open the harvest tasks modal for viewing history.
   */
  async openHarvestTasksModalForHistory(content: string): Promise<void> {
    try {
      const result = this.engine.parseHarvestTasks(content)

      if (!result.success || result.tasks.length === 0) {
        new Notice('Could not parse tasks from response.')
        return
      }

      // Detect moved tasks
      const tasksPath = `${this.projectPath}/Tasks.md`
      const tasksFile = this.app.vault.getAbstractFileByPath(tasksPath)

      if (tasksFile && tasksFile instanceof TFile) {
        const tasksContent = await this.app.vault.read(tasksFile)
        this.engine.detectMovedHarvestTasks(result.tasks, tasksContent)
      }

      // Load roadmap slices
      const roadmapPath = `${this.projectPath}/Roadmap.md`
      const roadmapFile = this.app.vault.getAbstractFileByPath(roadmapPath)

      if (roadmapFile && roadmapFile instanceof TFile) {
        const roadmapContent = await this.app.vault.read(roadmapFile)
        this.engine.parseRoadmapForSlices(roadmapContent)
      }

      const modal = new HarvestTasksModal(
        this.app,
        this.engine.getPendingHarvestedTasks(),
        this.projectPath,
        this.engine.getRoadmapSlices(),
        (selections, confirmed) => this.handleHarvestTasksAction(selections, confirmed),
        { viewOnly: true }
      )
      modal.open()
    } catch (err) {
      console.error('Failed to open harvest tasks modal for history:', err)
      new Notice(`Failed to open tasks: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  // ============================================================================
  // Ideas Groom Workflow
  // ============================================================================

  /**
   * Handle the AI response from the ideas-groom workflow.
   */
  async handleIdeasGroomResponse(content: string): Promise<void> {
    try {
      const result = this.engine.parseIdeasGroom(content)

      if (!result.success || result.tasks.length === 0) {
        new Notice('No actionable ideas found to convert to tasks.')
        return
      }

      // Load roadmap slices
      const roadmapPath = `${this.projectPath}/Roadmap.md`
      const roadmapFile = this.app.vault.getAbstractFileByPath(roadmapPath)

      if (roadmapFile && roadmapFile instanceof TFile) {
        const roadmapContent = await this.app.vault.read(roadmapFile)
        this.engine.parseRoadmapForSlices(roadmapContent)
      }

      this.openIdeasGroomModal()
    } catch (err) {
      console.error('Failed to process ideas groom response:', err)
      new Notice(`Failed to process ideas: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  /**
   * Open the ideas groom review modal.
   */
  private openIdeasGroomModal(): void {
    const modal = new IdeasGroomModal(
      this.app,
      this.engine.getPendingGroomedIdeaTasks(),
      this.projectPath,
      this.engine.getRoadmapSlices(),
      (selections, confirmed) => this.handleIdeasGroomAction(selections, confirmed)
    )
    modal.open()
  }

  /**
   * Open the ideas groom modal for viewing history.
   */
  async openIdeasGroomModalForHistory(content: string): Promise<void> {
    try {
      const result = this.engine.parseIdeasGroom(content)

      if (!result.success || result.tasks.length === 0) {
        new Notice('Could not parse ideas from response.')
        return
      }

      // Detect moved ideas
      const tasksPath = `${this.projectPath}/Tasks.md`
      const tasksFile = this.app.vault.getAbstractFileByPath(tasksPath)

      if (tasksFile && tasksFile instanceof TFile) {
        const tasksContent = await this.app.vault.read(tasksFile)
        this.engine.detectMovedIdeas(result.tasks, tasksContent)
      }

      // Load roadmap slices
      const roadmapPath = `${this.projectPath}/Roadmap.md`
      const roadmapFile = this.app.vault.getAbstractFileByPath(roadmapPath)

      if (roadmapFile && roadmapFile instanceof TFile) {
        const roadmapContent = await this.app.vault.read(roadmapFile)
        this.engine.parseRoadmapForSlices(roadmapContent)
      }

      const modal = new IdeasGroomModal(
        this.app,
        this.engine.getPendingGroomedIdeaTasks(),
        this.projectPath,
        this.engine.getRoadmapSlices(),
        (selections, confirmed) => this.handleIdeasGroomAction(selections, confirmed),
        { viewOnly: true }
      )
      modal.open()
    } catch (err) {
      console.error('Failed to open ideas groom modal for history:', err)
      new Notice(`Failed to open ideas: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  /**
   * Handle actions from the ideas groom modal.
   */
  private async handleIdeasGroomAction(
    selections: GroomedIdeaSelection[],
    confirmed: boolean
  ): Promise<void> {
    if (!confirmed) return

    const tasksToApply = selections.filter((s) => s.destination !== 'discard')

    if (tasksToApply.length === 0) {
      new Notice('No tasks selected to add.')
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
      const newContent = this.engine.applyIdeasGroomSelections(tasksContent, tasksToApply)
      await this.app.vault.modify(tasksFile, newContent)

      new Notice(`Added ${tasksToApply.length} task${tasksToApply.length > 1 ? 's' : ''} to Tasks.md`)

      this.engine.clearIdeasGroomState()
      await this.callbacks.onSnapshotRefresh()
    } catch (err) {
      console.error('Failed to apply ideas groom task selections:', err)
      new Notice(`Failed to add tasks: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  // ============================================================================
  // Sync Commits Workflow
  // ============================================================================

  /**
   * Set the recent git commits.
   */
  setRecentGitCommits(commits: GitCommit[]): void {
    this.engine.setRecentGitCommits(commits)
  }

  /**
   * Handle the AI response from the sync-commits workflow.
   */
  async handleSyncCommitsResponse(content: string): Promise<void> {
    try {
      const result = this.engine.parseSyncCommits(content)

      if (!result.success || result.matches.length === 0) {
        new Notice('No commits matched any unchecked tasks.')
        return
      }

      this.openSyncCommitsModal()
    } catch (err) {
      console.error('Failed to process sync commits response:', err)
      new Notice(`Failed to process commits: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  /**
   * Open the sync commits review modal.
   */
  private openSyncCommitsModal(): void {
    const modal = new SyncCommitsModal(
      this.app,
      this.engine.getPendingSyncCommitMatches(),
      this.engine.getPendingUnmatchedCommits(),
      this.projectPath,
      (selections, confirmed) => this.handleSyncCommitsAction(selections, confirmed)
    )
    modal.open()
  }

  /**
   * Open the sync commits modal for viewing history.
   */
  async openSyncCommitsModalForHistory(content: string): Promise<void> {
    try {
      // Fetch commits if not cached
      if (this.engine.getRecentGitCommits().length === 0) {
        const snapshot = this.engine.getSnapshot()
        const githubRepo = snapshot.aiConfig?.github_repo
        if (githubRepo) {
          const result = await fetchCommits(githubRepo, {
            token: this.githubToken || undefined,
            perPage: 50,
          })
          if (result.success && result.data.length > 0) {
            this.engine.setRecentGitCommits(result.data.map((c) => ({
              sha: c.sha,
              message: c.message,
              date: c.date instanceof Date ? c.date.toISOString() : '',
              url: c.url,
            })))
          }
        }
      }

      const result = this.engine.parseSyncCommits(content)

      if (!result.success || result.matches.length === 0) {
        new Notice('Could not parse commit matches from response.')
        return
      }

      // Mark already completed tasks
      const tasksPath = `${this.projectPath}/Tasks.md`
      const tasksFile = this.app.vault.getAbstractFileByPath(tasksPath)

      if (tasksFile && tasksFile instanceof TFile) {
        const tasksContent = await this.app.vault.read(tasksFile)
        this.engine.markAlreadyCompletedMatches(tasksContent)
      }

      const modal = new SyncCommitsModal(
        this.app,
        this.engine.getPendingSyncCommitMatches(),
        this.engine.getPendingUnmatchedCommits(),
        this.projectPath,
        (selections, confirmed) => this.handleSyncCommitsAction(selections, confirmed),
        { viewOnly: true }
      )
      modal.open()
    } catch (err) {
      console.error('Failed to open sync commits modal for history:', err)
      new Notice(`Failed to open matches: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  /**
   * Handle actions from the sync commits modal.
   */
  private async handleSyncCommitsAction(
    selections: SyncCommitSelection[],
    confirmed: boolean
  ): Promise<void> {
    if (!confirmed) return

    const actionsToApply = selections.filter((s) => s.action !== 'skip')

    if (actionsToApply.length === 0) {
      new Notice('No changes to apply.')
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

      const result = this.engine.applySyncCommitSelections(tasksContent, archiveContent, selections)

      await this.app.vault.modify(tasksFile, result.newTasksContent)

      if (result.newArchiveContent && archiveFile instanceof TFile) {
        await this.app.vault.modify(archiveFile, result.newArchiveContent)
      }

      const parts: string[] = []
      if (result.completedCount > 0) parts.push(`${result.completedCount} marked complete`)
      if (result.archivedCount > 0) parts.push(`${result.archivedCount} archived`)
      new Notice(`Tasks updated: ${parts.join(', ')}`)

      this.engine.clearSyncCommitsState()
      await this.callbacks.onSnapshotRefresh()
    } catch (err) {
      console.error('Failed to apply sync commits selections:', err)
      new Notice(`Failed to update tasks: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  // ============================================================================
  // Archive Completed Workflow
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
    }

    await this.callbacks.onSnapshotRefresh()
  }
}
