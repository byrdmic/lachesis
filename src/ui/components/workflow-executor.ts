// Workflow Executor Component
// Handles workflow detection, button rendering, and execution

import type { App } from 'obsidian'
import { Notice, TFile } from 'obsidian'
import type { WorkflowDefinition, WorkflowName } from '../../core/workflows/types'
import { getAllWorkflows, getWorkflowDefinition } from '../../core/workflows/definitions'
import type { ProjectSnapshot, ExpectedCoreFile } from '../../core/project/snapshot'
import { buildProjectSnapshot } from '../../core/project/snapshot-builder'
import {
  parsePotentialTasks,
  type PotentialTask,
  type ParsedPotentialTasks,
  type TaskUpdateAction,
  updateLogWithTaskActions,
  appendToFutureTasksSection,
} from '../../utils/potential-tasks-parser'
import { PotentialTasksModal, type TaskSelection } from '../potential-tasks-modal'
import {
  parseHarvestResponse,
  parseRoadmapSlices,
  applyHarvestSelections,
  detectMovedHarvestTasks,
  type HarvestedTask,
  type HarvestTaskSelection,
  type RoadmapSlice,
} from '../../utils/harvest-tasks-parser'
import {
  parseIdeasGroomResponse,
  applyIdeasGroomSelections,
  detectMovedIdeas,
  type GroomedIdeaTask,
  type GroomedIdeaSelection,
} from '../../utils/ideas-groom-parser'
import {
  parseSyncCommitsResponse,
  applyTaskCompletions,
  buildArchiveEntries,
  applyArchiveEntries,
  type CommitMatch,
  type UnmatchedCommit,
  type SyncCommitSelection,
  type GitCommit,
} from '../../utils/sync-commits-parser'
import {
  extractCompletedTasks,
  groupTasksBySlice,
  containsArchiveCompletedResponse,
  parseArchiveCompletedResponse,
  applyArchiveRemoval,
  buildArchiveEntries as buildArchiveCompletedEntries,
  applyArchiveAdditions,
  getAllTasks,
  type CompletedTask,
  type SliceGroup,
  type ArchiveSelection,
} from '../../utils/archive-completed-parser'
import { fetchCommits } from '../../github'
import { HarvestTasksModal } from '../harvest-tasks-modal'
import { IdeasGroomModal } from '../ideas-groom-modal'
import { SyncCommitsModal } from '../sync-commits-modal'
import { ArchiveCompletedModal } from '../archive-completed-modal'
import { GitLogModal } from '../git-log-modal'
import { InitSummaryInputModal } from '../init-summary-modal'
import { BatchDiffViewerModal, type BatchDiffAction } from '../batch-diff-viewer-modal'
import {
  parseBatchDiffResponse,
  containsBatchDiffResponse,
  type InitSummaryFile,
} from '../../utils/init-summary-parser'

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
  private snapshot: ProjectSnapshot
  private callbacks: WorkflowExecutorCallbacks
  private githubToken: string

  // State for pending tasks
  private pendingPotentialTasks: PotentialTask[] = []
  private parsedPotentialTasks: ParsedPotentialTasks | null = null
  private pendingHarvestedTasks: HarvestedTask[] = []
  private pendingGroomedIdeaTasks: GroomedIdeaTask[] = []
  private roadmapSlices: RoadmapSlice[] = []

  // State for sync-commits workflow
  private pendingSyncCommitMatches: CommitMatch[] = []
  private pendingUnmatchedCommits: UnmatchedCommit[] = []
  private recentGitCommits: GitCommit[] = []

  // State for archive-completed workflow
  private pendingArchiveCompletedTasks: CompletedTask[] = []
  private pendingSliceGroups: SliceGroup[] = []
  private pendingStandaloneTasks: CompletedTask[] = []

  constructor(
    app: App,
    projectPath: string,
    snapshot: ProjectSnapshot,
    callbacks: WorkflowExecutorCallbacks,
    githubToken?: string,
  ) {
    this.app = app
    this.projectPath = projectPath
    this.snapshot = snapshot
    this.callbacks = callbacks
    this.githubToken = githubToken ?? ''
  }

  /**
   * Update the snapshot reference.
   */
  setSnapshot(snapshot: ProjectSnapshot): void {
    this.snapshot = snapshot
  }

  /**
   * Render workflow buttons into the container.
   */
  renderWorkflowButtons(container: HTMLElement, onStartChat: () => void): void {
    // Start Chat button - triggers the opening message
    const startChatBtn = container.createEl('button', {
      text: 'Start Chat',
      cls: 'lachesis-workflow-button lachesis-start-chat-button',
    })
    startChatBtn.addEventListener('click', onStartChat)

    // Git Log button - show recent commits if GitHub repo is configured
    if (this.snapshot.aiConfig?.github_repo) {
      const gitLogBtn = container.createEl('button', {
        text: 'Git Log',
        cls: 'lachesis-workflow-button lachesis-git-log-button',
      })
      gitLogBtn.addEventListener('click', () => {
        const modal = new GitLogModal(
          this.app,
          this.snapshot.aiConfig!.github_repo!,
          this.githubToken
        )
        modal.open()
      })
    }

    // Workflow buttons
    for (const workflow of getAllWorkflows()) {
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
    const lowerMessage = message.toLowerCase()

    // Check for specific workflow keywords first
    // Title Entries workflow
    if (
      lowerMessage.includes('title entries') ||
      lowerMessage.includes('add titles') ||
      lowerMessage.includes('summarize log') ||
      lowerMessage.includes('title the log')
    ) {
      return getWorkflowDefinition('title-entries')
    }

    // Generate Tasks workflow
    if (
      lowerMessage.includes('generate tasks') ||
      lowerMessage.includes('extract tasks') ||
      lowerMessage.includes('find tasks')
    ) {
      return getWorkflowDefinition('generate-tasks')
    }

    // Groom Tasks workflow
    if (
      lowerMessage.includes('groom tasks') ||
      lowerMessage.includes('review tasks') ||
      lowerMessage.includes('review potential tasks') ||
      lowerMessage.includes('potential tasks') ||
      lowerMessage.includes('process tasks')
    ) {
      return getWorkflowDefinition('groom-tasks')
    }

    // Harvest Tasks workflow
    if (
      lowerMessage.includes('harvest tasks') ||
      lowerMessage.includes('find new tasks') ||
      lowerMessage.includes('discover tasks') ||
      lowerMessage.includes('suggest tasks')
    ) {
      return getWorkflowDefinition('harvest-tasks')
    }

    // Ideas Groom workflow
    if (
      lowerMessage.includes('groom ideas') ||
      lowerMessage.includes('ideas groom') ||
      lowerMessage.includes('extract tasks from ideas') ||
      lowerMessage.includes('ideas to tasks')
    ) {
      return getWorkflowDefinition('ideas-groom')
    }

    // Check for common workflow trigger patterns
    const workflowPatterns = [
      /run\s+(?:the\s+)?(\w+(?:[- ]\w+)?)\s+workflow/i,
      /execute\s+(?:the\s+)?(\w+(?:[- ]\w+)?)\s+workflow/i,
      /start\s+(?:the\s+)?(\w+(?:[- ]\w+)?)\s+workflow/i,
      /do\s+(?:a\s+)?(\w+(?:[- ]\w+)?)\s+(?:workflow|pass)/i,
    ]

    for (const pattern of workflowPatterns) {
      const match = message.match(pattern)
      if (match) {
        const workflowName = match[1].toLowerCase().replace(/\s+/g, '-')

        // Try to find workflow by name or display name
        for (const workflow of getAllWorkflows()) {
          if (
            workflow.name === workflowName ||
            workflow.displayName.toLowerCase() === match[1].toLowerCase() ||
            workflow.displayName.toLowerCase().replace(/\s+/g, '-') === workflowName
          ) {
            return workflow
          }
        }
      }
    }

    return null
  }

  /**
   * Trigger a workflow by display name.
   */
  triggerWorkflow(workflowDisplayName: string): void {
    // Find the workflow by display name
    const workflow = getAllWorkflows().find((w) => w.displayName === workflowDisplayName)
    if (!workflow) return

    // Check if this is a non-AI workflow
    if (!workflow.usesAI) {
      this.handleNonAIWorkflow(workflow)
      return
    }

    // Special handling for fill-overview: use focusedFile mechanism
    if (workflow.name === 'fill-overview') {
      this.callbacks.onSetFocusedFile(
        'Overview.md',
        `Help me fill in Overview.md. It currently only has template placeholders. Let's work through it section by section.`
      )
      return
    }

    // Special handling for roadmap-fill: use focusedFile mechanism
    if (workflow.name === 'roadmap-fill') {
      this.callbacks.onSetFocusedFile(
        'Roadmap.md',
        `Help me fill in Roadmap.md. I need to define milestones for my project from scratch. Let's work through it step by step.`
      )
      return
    }

    // Special handling for tasks-fill: use focusedFile mechanism
    if (workflow.name === 'tasks-fill') {
      this.callbacks.onSetFocusedFile(
        'Tasks.md',
        `Help me fill in Tasks.md. I need to create vertical slices and tasks aligned with my roadmap. Let's work through it step by step.`
      )
      return
    }

    // Special handling for init-from-summary: open summary input modal first
    if (workflow.name === 'init-from-summary') {
      const inputModal = new InitSummaryInputModal(
        this.app,
        (summary, confirmed) => {
          if (confirmed && summary.trim()) {
            // Trigger the AI workflow with the summary as the message
            this.callbacks.onTriggerAIWorkflow(
              workflow,
              `Initialize project from this design summary:\n\n${summary}`
            )
          }
        }
      )
      inputModal.open()
      return
    }

    // Standard AI workflow handling
    this.callbacks.onTriggerAIWorkflow(workflow, `Run the ${workflowDisplayName} workflow`)
  }

  /**
   * Handle workflows that don't require AI processing.
   * These workflows perform local operations immediately.
   */
  async handleNonAIWorkflow(workflow: WorkflowDefinition): Promise<void> {
    if (workflow.name === 'groom-tasks') {
      await this.handleGroomTasksWorkflow()
    }
    // Future non-AI workflows can be added here
  }

  /**
   * Handle the Groom Tasks workflow.
   * Parses Log.md for existing potential tasks and opens the review modal.
   */
  private async handleGroomTasksWorkflow(): Promise<void> {
    try {
      this.callbacks.onSetProcessing(true, 'Scanning Log.md for potential tasks...')

      // Read Log.md content
      const logPath = `${this.projectPath}/Log.md`
      const logFile = this.app.vault.getAbstractFileByPath(logPath)

      if (!logFile || !(logFile instanceof TFile)) {
        this.callbacks.onSetProcessing(false, 'Log.md not found')
        new Notice('Log.md not found in project')
        return
      }

      const content = await this.app.vault.read(logFile)
      const parsed = parsePotentialTasks(content)

      if (parsed.actionableTaskCount === 0) {
        this.callbacks.onSetProcessing(false, 'No potential tasks found')
        new Notice('No actionable potential tasks found in Log.md. Run "Generate Tasks" first to create some.')
        return
      }

      // Store parsed data for modal callback
      this.pendingPotentialTasks = parsed.allTasks
      this.parsedPotentialTasks = parsed

      // Add a message to the UI indicating what we're doing
      this.callbacks.onAddMessage(
        'assistant',
        `Found ${parsed.actionableTaskCount} potential task${parsed.actionableTaskCount > 1 ? 's' : ''} in Log.md. Opening review modal...`
      )

      // Open the modal directly
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
      this.pendingPotentialTasks,
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
    if (!confirmed || !this.parsedPotentialTasks) return

    // Group selections by action
    const rejects = selections.filter((s) => s.action === 'reject')
    const moves = selections.filter((s) => s.action === 'move-to-future')
    // 'keep' actions require no file changes

    // Convert to TaskUpdateAction format
    const actions: TaskUpdateAction[] = selections.map((s) => ({
      taskId: s.taskId,
      action: s.action,
    }))

    try {
      // Process Log.md updates if there are any rejections or moves
      if (rejects.length > 0 || moves.length > 0) {
        const logPath = `${this.projectPath}/Log.md`
        const logFile = this.app.vault.getAbstractFileByPath(logPath)

        if (logFile && logFile instanceof TFile) {
          const logContent = await this.app.vault.read(logFile)
          const result = updateLogWithTaskActions(logContent, actions, this.parsedPotentialTasks)
          await this.app.vault.modify(logFile, result.newContent)
        }
      }

      // Process Tasks.md additions if there are any moves
      if (moves.length > 0) {
        const tasksPath = `${this.projectPath}/Tasks.md`
        const tasksFile = this.app.vault.getAbstractFileByPath(tasksPath)

        if (tasksFile && tasksFile instanceof TFile) {
          const tasksContent = await this.app.vault.read(tasksFile)

          // Get task details for moved tasks
          const movedTasks = moves.map((m) => {
            const task = this.pendingPotentialTasks.find((t) => t.id === m.taskId)
            return {
              text: task?.text || '',
              sourceDate: task?.logEntryDate || null,
            }
          })

          const newTasksContent = appendToFutureTasksSection(tasksContent, movedTasks)
          await this.app.vault.modify(tasksFile, newTasksContent)
        }
      }

      // Clear pending tasks and refresh
      this.pendingPotentialTasks = []
      this.parsedPotentialTasks = null
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
   * Parses the JSON response and opens the review modal.
   */
  async handleHarvestTasksResponse(content: string): Promise<void> {
    try {
      // Parse the AI response as harvested tasks
      const harvestedTasks = parseHarvestResponse(content)

      if (harvestedTasks.length === 0) {
        new Notice('No new tasks found to harvest.')
        return
      }

      // Read Roadmap.md to get available slices for linking
      const roadmapPath = `${this.projectPath}/Roadmap.md`
      const roadmapFile = this.app.vault.getAbstractFileByPath(roadmapPath)

      if (roadmapFile && roadmapFile instanceof TFile) {
        const roadmapContent = await this.app.vault.read(roadmapFile)
        this.roadmapSlices = parseRoadmapSlices(roadmapContent)
      } else {
        // No roadmap file - slices will be empty but we can still place tasks
        this.roadmapSlices = []
      }

      this.pendingHarvestedTasks = harvestedTasks

      // Open the harvest tasks modal
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
      this.pendingHarvestedTasks,
      this.projectPath,
      this.roadmapSlices,
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

    // Count tasks to add vs discard
    const tasksToAdd = selections.filter((s) => s.destination !== 'discard')
    const tasksToDiscard = selections.filter((s) => s.destination === 'discard')

    if (tasksToAdd.length === 0 && tasksToDiscard.length === 0) {
      new Notice('No tasks to process.')
      return
    }

    try {
      // Read current Tasks.md content
      const tasksPath = `${this.projectPath}/Tasks.md`
      const tasksFile = this.app.vault.getAbstractFileByPath(tasksPath)

      if (!tasksFile || !(tasksFile instanceof TFile)) {
        new Notice('Tasks.md not found')
        return
      }

      const tasksContent = await this.app.vault.read(tasksFile)

      // Apply all selections to Tasks.md (including discards which go to Discarded section)
      const newContent = applyHarvestSelections(tasksContent, selections, this.pendingHarvestedTasks)

      await this.app.vault.modify(tasksFile, newContent)

      // Build notice message
      const parts: string[] = []
      if (tasksToAdd.length > 0) {
        parts.push(`${tasksToAdd.length} added`)
      }
      if (tasksToDiscard.length > 0) {
        parts.push(`${tasksToDiscard.length} discarded`)
      }
      new Notice(`Tasks: ${parts.join(', ')}`)

      // Clear pending state and refresh snapshot
      this.pendingHarvestedTasks = []
      this.roadmapSlices = []
      await this.callbacks.onSnapshotRefresh()
    } catch (err) {
      console.error('Failed to apply harvest task selections:', err)
      new Notice(`Failed to add tasks: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  /**
   * Open the harvest tasks modal for viewing history.
   * Detects which tasks have been moved by checking Tasks.md.
   * Allows acting on pending tasks that haven't been moved yet.
   */
  async openHarvestTasksModalForHistory(content: string): Promise<void> {
    try {
      let tasks = parseHarvestResponse(content)

      if (tasks.length === 0) {
        new Notice('Could not parse tasks from response.')
        return
      }

      // Read Tasks.md to detect which tasks have been moved
      const tasksPath = `${this.projectPath}/Tasks.md`
      const tasksFile = this.app.vault.getAbstractFileByPath(tasksPath)

      if (tasksFile && tasksFile instanceof TFile) {
        const tasksContent = await this.app.vault.read(tasksFile)
        tasks = detectMovedHarvestTasks(tasks, tasksContent)
      }

      // Read Roadmap.md for slice information
      const roadmapPath = `${this.projectPath}/Roadmap.md`
      const roadmapFile = this.app.vault.getAbstractFileByPath(roadmapPath)

      if (roadmapFile && roadmapFile instanceof TFile) {
        const roadmapContent = await this.app.vault.read(roadmapFile)
        this.roadmapSlices = parseRoadmapSlices(roadmapContent)
      } else {
        this.roadmapSlices = []
      }

      // Store tasks for the action callback
      this.pendingHarvestedTasks = tasks

      // Open modal in view-only mode but with action callback for pending tasks
      const modal = new HarvestTasksModal(
        this.app,
        tasks,
        this.projectPath,
        this.roadmapSlices,
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
   * Parses the JSON response and opens the review modal.
   */
  async handleIdeasGroomResponse(content: string): Promise<void> {
    try {
      // Parse the AI response as groomed idea tasks
      const groomedTasks = parseIdeasGroomResponse(content)

      if (groomedTasks.length === 0) {
        new Notice('No actionable ideas found to convert to tasks.')
        return
      }

      // Read Roadmap.md to get available slices for linking
      const roadmapPath = `${this.projectPath}/Roadmap.md`
      const roadmapFile = this.app.vault.getAbstractFileByPath(roadmapPath)

      if (roadmapFile && roadmapFile instanceof TFile) {
        const roadmapContent = await this.app.vault.read(roadmapFile)
        this.roadmapSlices = parseRoadmapSlices(roadmapContent)
      } else {
        // No roadmap file - slices will be empty but we can still place tasks
        this.roadmapSlices = []
      }

      this.pendingGroomedIdeaTasks = groomedTasks

      // Open the ideas groom modal
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
      this.pendingGroomedIdeaTasks,
      this.projectPath,
      this.roadmapSlices,
      (selections, confirmed) => this.handleIdeasGroomAction(selections, confirmed)
    )
    modal.open()
  }

  /**
   * Open the ideas groom modal for viewing history.
   * Detects which tasks have been moved by checking Tasks.md.
   * Allows acting on pending tasks that haven't been moved yet.
   */
  async openIdeasGroomModalForHistory(content: string): Promise<void> {
    try {
      let tasks = parseIdeasGroomResponse(content)

      if (tasks.length === 0) {
        new Notice('Could not parse ideas from response.')
        return
      }

      // Read Tasks.md to detect which ideas have been moved
      const tasksPath = `${this.projectPath}/Tasks.md`
      const tasksFile = this.app.vault.getAbstractFileByPath(tasksPath)

      if (tasksFile && tasksFile instanceof TFile) {
        const tasksContent = await this.app.vault.read(tasksFile)
        tasks = detectMovedIdeas(tasks, tasksContent)
      }

      // Read Roadmap.md for slice information
      const roadmapPath = `${this.projectPath}/Roadmap.md`
      const roadmapFile = this.app.vault.getAbstractFileByPath(roadmapPath)

      if (roadmapFile && roadmapFile instanceof TFile) {
        const roadmapContent = await this.app.vault.read(roadmapFile)
        this.roadmapSlices = parseRoadmapSlices(roadmapContent)
      } else {
        this.roadmapSlices = []
      }

      // Store tasks for the action callback
      this.pendingGroomedIdeaTasks = tasks

      // Open modal in view-only mode but with action callback for pending tasks
      const modal = new IdeasGroomModal(
        this.app,
        tasks,
        this.projectPath,
        this.roadmapSlices,
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

    // Filter out discarded tasks
    const tasksToApply = selections.filter((s) => s.destination !== 'discard')

    if (tasksToApply.length === 0) {
      new Notice('No tasks selected to add.')
      return
    }

    try {
      // Read current Tasks.md content
      const tasksPath = `${this.projectPath}/Tasks.md`
      const tasksFile = this.app.vault.getAbstractFileByPath(tasksPath)

      if (!tasksFile || !(tasksFile instanceof TFile)) {
        new Notice('Tasks.md not found')
        return
      }

      const tasksContent = await this.app.vault.read(tasksFile)

      // Apply the selections to Tasks.md
      const newContent = applyIdeasGroomSelections(
        tasksContent,
        tasksToApply,
        this.pendingGroomedIdeaTasks
      )

      await this.app.vault.modify(tasksFile, newContent)

      new Notice(`Added ${tasksToApply.length} task${tasksToApply.length > 1 ? 's' : ''} to Tasks.md`)

      // Clear pending state and refresh snapshot
      this.pendingGroomedIdeaTasks = []
      this.roadmapSlices = []
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
   * Set the recent git commits (called by modal after fetching).
   */
  setRecentGitCommits(commits: GitCommit[]): void {
    this.recentGitCommits = commits
  }

  /**
   * Handle the AI response from the sync-commits workflow.
   * Parses the JSON response and opens the review modal.
   */
  async handleSyncCommitsResponse(content: string): Promise<void> {
    try {
      // Parse the AI response using stored commits for lookup
      const parsed = parseSyncCommitsResponse(content, this.recentGitCommits)

      if (parsed.matches.length === 0) {
        new Notice('No commits matched any unchecked tasks.')
        return
      }

      this.pendingSyncCommitMatches = parsed.matches
      this.pendingUnmatchedCommits = parsed.unmatchedCommits

      // Open the sync commits modal
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
      this.pendingSyncCommitMatches,
      this.pendingUnmatchedCommits,
      this.projectPath,
      (selections, confirmed) => this.handleSyncCommitsAction(selections, confirmed)
    )
    modal.open()
  }

  /**
   * Open the sync commits modal for viewing history.
   * Detects which tasks have already been completed by checking Tasks.md.
   * Allows acting on pending tasks that haven't been completed yet.
   */
  async openSyncCommitsModalForHistory(content: string): Promise<void> {
    try {
      // We need commits data to parse the response properly
      // If we don't have cached commits, try to fetch them
      if (this.recentGitCommits.length === 0) {
        const githubRepo = this.snapshot.aiConfig?.github_repo
        if (githubRepo) {
          const result = await fetchCommits(githubRepo, {
            token: this.githubToken || undefined,
            perPage: 50,
          })
          if (result.success && result.data.length > 0) {
            this.recentGitCommits = result.data.map((c) => ({
              sha: c.sha,
              message: c.message,
              date: c.date instanceof Date ? c.date.toISOString() : '',
              url: c.url,
            }))
          }
        }
      }

      let parsed = parseSyncCommitsResponse(content, this.recentGitCommits)

      if (parsed.matches.length === 0) {
        new Notice('Could not parse commit matches from response.')
        return
      }

      // Read Tasks.md to detect which tasks have already been completed
      const tasksPath = `${this.projectPath}/Tasks.md`
      const tasksFile = this.app.vault.getAbstractFileByPath(tasksPath)

      if (tasksFile && tasksFile instanceof TFile) {
        const tasksContent = await this.app.vault.read(tasksFile)
        // Mark matches as already completed if the task is checked in Tasks.md
        parsed.matches = parsed.matches.map((match) => {
          // Check if task is already completed (has [x] in Tasks.md)
          const taskPattern = match.taskText.slice(0, 30).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
          const completedPattern = new RegExp(`^\\s*-\\s*\\[x\\]\\s+${taskPattern}`, 'im')
          if (completedPattern.test(tasksContent)) {
            return { ...match, alreadyCompleted: true }
          }
          return match
        })
      }

      // Store for the action callback
      this.pendingSyncCommitMatches = parsed.matches
      this.pendingUnmatchedCommits = parsed.unmatchedCommits

      // Open modal with viewOnly support
      const modal = new SyncCommitsModal(
        this.app,
        parsed.matches,
        parsed.unmatchedCommits,
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

    // Filter out skipped tasks
    const actionsToApply = selections.filter((s) => s.action !== 'skip')

    if (actionsToApply.length === 0) {
      new Notice('No changes to apply.')
      return
    }

    try {
      // Read current Tasks.md content
      const tasksPath = `${this.projectPath}/Tasks.md`
      const tasksFile = this.app.vault.getAbstractFileByPath(tasksPath)

      if (!tasksFile || !(tasksFile instanceof TFile)) {
        new Notice('Tasks.md not found')
        return
      }

      let tasksContent = await this.app.vault.read(tasksFile)

      // Apply task completions to Tasks.md
      tasksContent = applyTaskCompletions(
        tasksContent,
        actionsToApply,
        this.pendingSyncCommitMatches
      )

      await this.app.vault.modify(tasksFile, tasksContent)

      // Build and apply archive entries if any tasks are being archived
      const archiveSelections = actionsToApply.filter((s) => s.action === 'mark-archive')
      if (archiveSelections.length > 0) {
        const archivePath = `${this.projectPath}/Archive.md`
        const archiveFile = this.app.vault.getAbstractFileByPath(archivePath)

        if (archiveFile && archiveFile instanceof TFile) {
          const archiveContent = await this.app.vault.read(archiveFile)
          const archiveEntries = buildArchiveEntries(archiveSelections, this.pendingSyncCommitMatches)
          const newArchiveContent = applyArchiveEntries(archiveContent, archiveEntries)
          await this.app.vault.modify(archiveFile, newArchiveContent)
        }
      }

      const completedCount = actionsToApply.filter((s) => s.action === 'mark-complete').length
      const archivedCount = archiveSelections.length
      const parts: string[] = []
      if (completedCount > 0) parts.push(`${completedCount} marked complete`)
      if (archivedCount > 0) parts.push(`${archivedCount} archived`)
      new Notice(`Tasks updated: ${parts.join(', ')}`)

      // Clear pending state and refresh snapshot
      this.pendingSyncCommitMatches = []
      this.pendingUnmatchedCommits = []
      this.recentGitCommits = []
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
   * Parses completed tasks locally and groups them, then opens review modal.
   */
  async handleArchiveCompletedResponse(content: string): Promise<void> {
    try {
      // First, extract completed tasks locally from Tasks.md
      const tasksPath = `${this.projectPath}/Tasks.md`
      const tasksFile = this.app.vault.getAbstractFileByPath(tasksPath)

      if (!tasksFile || !(tasksFile instanceof TFile)) {
        new Notice('Tasks.md not found')
        return
      }

      const tasksContent = await this.app.vault.read(tasksFile)
      const completedTasks = extractCompletedTasks(tasksContent)

      if (completedTasks.length === 0) {
        new Notice('No completed tasks found to archive.')
        return
      }

      // Try to parse AI response for enriched data (summaries, etc.)
      let result: { sliceGroups: SliceGroup[]; standaloneTasks: CompletedTask[] }

      if (containsArchiveCompletedResponse(content)) {
        // Use AI-enriched parsing
        const parsed = parseArchiveCompletedResponse(content, completedTasks)
        result = {
          sliceGroups: parsed.sliceGroups,
          standaloneTasks: parsed.standaloneTasks,
        }
      } else {
        // Fall back to local grouping
        result = groupTasksBySlice(completedTasks)
      }

      this.pendingArchiveCompletedTasks = completedTasks
      this.pendingSliceGroups = result.sliceGroups
      this.pendingStandaloneTasks = result.standaloneTasks

      // Open the archive completed modal
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
      this.pendingSliceGroups,
      this.pendingStandaloneTasks,
      this.projectPath,
      (selections, confirmed) => this.handleArchiveCompletedAction(selections, confirmed)
    )
    modal.open()
  }

  /**
   * Open the archive completed modal for viewing from chat history.
   * Re-parses Tasks.md to detect which tasks have already been archived.
   */
  async openArchiveCompletedModalForHistory(content: string): Promise<void> {
    try {
      // Read current Tasks.md to get fresh completed tasks
      const tasksPath = `${this.projectPath}/Tasks.md`
      const tasksFile = this.app.vault.getAbstractFileByPath(tasksPath)

      if (!tasksFile || !(tasksFile instanceof TFile)) {
        new Notice('Tasks.md not found')
        return
      }

      const tasksContent = await this.app.vault.read(tasksFile)
      const completedTasks = extractCompletedTasks(tasksContent)

      if (completedTasks.length === 0) {
        new Notice('No completed tasks found. They may have already been archived.')
        return
      }

      // Try to parse AI response for enriched data (summaries, etc.)
      let result: { sliceGroups: SliceGroup[]; standaloneTasks: CompletedTask[] }

      if (containsArchiveCompletedResponse(content)) {
        // Use AI-enriched parsing
        const parsed = parseArchiveCompletedResponse(content, completedTasks)
        result = {
          sliceGroups: parsed.sliceGroups,
          standaloneTasks: parsed.standaloneTasks,
        }
      } else {
        // Fall back to local grouping
        result = groupTasksBySlice(completedTasks)
      }

      // Store for the action callback
      this.pendingArchiveCompletedTasks = completedTasks
      this.pendingSliceGroups = result.sliceGroups
      this.pendingStandaloneTasks = result.standaloneTasks

      // Open modal - viewOnly mode allows actions but shows it's from history
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

    // Filter to only archive actions
    const archiveSelections = selections.filter((s) => s.action === 'archive')

    if (archiveSelections.length === 0) {
      new Notice('No tasks selected for archiving.')
      return
    }

    try {
      // Read current Tasks.md content
      const tasksPath = `${this.projectPath}/Tasks.md`
      const tasksFile = this.app.vault.getAbstractFileByPath(tasksPath)

      if (!tasksFile || !(tasksFile instanceof TFile)) {
        new Notice('Tasks.md not found')
        return
      }

      let tasksContent = await this.app.vault.read(tasksFile)

      // Get all tasks for the removal function
      const allTasks = getAllTasks(this.pendingSliceGroups, this.pendingStandaloneTasks)

      // Remove archived tasks from Tasks.md
      tasksContent = applyArchiveRemoval(tasksContent, archiveSelections, allTasks)
      await this.app.vault.modify(tasksFile, tasksContent)

      // Build and apply archive entries
      const archivePath = `${this.projectPath}/Archive.md`
      const archiveFile = this.app.vault.getAbstractFileByPath(archivePath)

      if (archiveFile && archiveFile instanceof TFile) {
        const archiveContent = await this.app.vault.read(archiveFile)
        const archiveEntries = buildArchiveCompletedEntries(
          archiveSelections,
          this.pendingSliceGroups,
          this.pendingStandaloneTasks
        )
        const newArchiveContent = applyArchiveAdditions(archiveContent, archiveEntries)
        await this.app.vault.modify(archiveFile, newArchiveContent)
      }

      new Notice(`Archived ${archiveSelections.length} task${archiveSelections.length === 1 ? '' : 's'}`)

      // Clear pending state and refresh snapshot
      this.pendingArchiveCompletedTasks = []
      this.pendingSliceGroups = []
      this.pendingStandaloneTasks = []
      await this.callbacks.onSnapshotRefresh()
    } catch (err) {
      console.error('Failed to apply archive selections:', err)
      new Notice(`Failed to archive tasks: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  // ============================================================================
  // Init From Summary Workflow
  // ============================================================================

  /**
   * Handle the AI response from the init-from-summary workflow.
   * Parses the batch diffs and opens the review modal.
   */
  async handleInitFromSummaryResponse(content: string): Promise<void> {
    try {
      // Check if the response contains batch diffs
      if (!containsBatchDiffResponse(content)) {
        // No diffs found - AI is probably asking clarifying questions
        // Let the conversation continue naturally
        return
      }

      const result = parseBatchDiffResponse(content)

      if (result.diffs.size === 0) {
        new Notice('Could not parse diffs from response.')
        return
      }

      // Open the batch diff viewer modal
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
    const rejected = Array.from(results.values()).filter((s) => s === 'rejected').length

    if (accepted > 0) {
      new Notice(`Applied ${accepted} file${accepted === 1 ? '' : 's'}`)
    }

    // Refresh snapshot to reflect changes
    await this.callbacks.onSnapshotRefresh()
  }
}
