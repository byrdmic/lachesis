// Workflow Engine
// Core execution logic for workflows, separated from UI bindings

import type { WorkflowDefinition, WorkflowName, CombinedWorkflowState, CombinedWorkflowStep } from '../../core/workflows/types'
import { getAllWorkflows, getWorkflowDefinition } from '../../core/workflows/definitions'
import type { ProjectSnapshot, ExpectedCoreFile } from '../../core/project/snapshot'
import {
  parsePotentialTasks,
  type PotentialTask,
  type ParsedPotentialTasks,
  type TaskUpdateAction,
  updateLogWithTaskActions,
  appendToFutureTasksSection,
} from '../../utils/potential-tasks-parser'
import type { TaskSelection } from '../potential-tasks-modal'
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
import {
  parsePromoteNextResponse,
  containsPromoteNextResponse,
  applyTaskPromotion,
  applyRoadmapChanges,
  hasTasksInCurrent,
  type SelectedTask,
  type CandidateTask,
  type PromoteSelection,
  type PromoteStatus,
  type RoadmapChanges,
} from '../../utils/promote-next-parser'
import {
  parseBatchDiffResponse,
  containsBatchDiffResponse,
  type InitSummaryFile,
} from '../../utils/init-summary-parser'
import type { DiffBlock } from '../../utils/diff'

// ============================================================================
// Types
// ============================================================================

export type WorkflowEngineCallbacks = {
  /** Called when a workflow needs AI processing */
  onTriggerAIWorkflow: (workflow: WorkflowDefinition, message: string) => void
  /** Called when a workflow sets a focused file (for fill workflows) */
  onSetFocusedFile: (file: ExpectedCoreFile, message: string) => void
  /** Called to add a message to the UI */
  onAddMessage: (role: 'assistant' | 'user', content: string) => void
  /** Called to set processing state */
  onSetProcessing: (processing: boolean, status: string) => void
}

/** Result from parsing potential tasks from Log.md */
export type GroomTasksParseResult = {
  success: boolean
  error?: string
  tasks: PotentialTask[]
  parsed: ParsedPotentialTasks | null
  actionableCount: number
}

/** Result from applying potential task actions */
export type GroomTasksApplyResult = {
  newLogContent: string | null
  newTasksContent: string | null
}

/** Result from parsing harvest tasks response */
export type HarvestTasksParseResult = {
  success: boolean
  error?: string
  tasks: HarvestedTask[]
}

/** Result from parsing sync commits response */
export type SyncCommitsParseResult = {
  success: boolean
  error?: string
  matches: CommitMatch[]
  unmatchedCommits: UnmatchedCommit[]
}

/** Result from applying sync commits */
export type SyncCommitsApplyResult = {
  newTasksContent: string
  newArchiveContent: string | null
  completedCount: number
  archivedCount: number
}

/** Result from parsing archive completed response */
export type ArchiveCompletedParseResult = {
  success: boolean
  error?: string
  sliceGroups: SliceGroup[]
  standaloneTasks: CompletedTask[]
  allTasks: CompletedTask[]
}

/** Result from applying archive completed */
export type ArchiveCompletedApplyResult = {
  newTasksContent: string
  newArchiveContent: string
  archivedCount: number
}

/** Result from parsing promote next response */
export type PromoteNextParseResult = {
  success: boolean
  status: PromoteStatus
  selectedTask: SelectedTask | null
  reasoning: string | null
  candidates: CandidateTask[]
  existingCurrentTask: string | null
  message: string | null
  roadmapChanges: RoadmapChanges | null
}

/** Result from applying promote next */
export type PromoteNextApplyResult = {
  newTasksContent: string
  newRoadmapContent: string | null
  roadmapUpdated: boolean
}

/** Result from parsing init-from-summary response */
export type InitSummaryParseResult = {
  success: boolean
  error?: string
  hasDiffs: boolean
  diffs: Map<InitSummaryFile, DiffBlock>
}

// ============================================================================
// Workflow Engine
// ============================================================================

export class WorkflowEngine {
  private projectPath: string
  private snapshot: ProjectSnapshot
  private callbacks: WorkflowEngineCallbacks

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

  // State for promote-next-task workflow
  private pendingSelectedTask: SelectedTask | null = null
  private pendingPromoteReasoning: string | null = null
  private pendingPromoteCandidates: CandidateTask[] = []
  private pendingPromoteStatus: PromoteStatus = 'no_tasks'
  private pendingExistingCurrentTask: string | null = null
  private pendingPromoteMessage: string | null = null
  private pendingRoadmapChanges: RoadmapChanges | null = null
  private awaitingPromoteKeyword: boolean = false

  // Keyword for promote-next-task confirmation
  static readonly PROMOTE_KEYWORD = 'PROMOTE'

  // State for combined workflow execution
  private combinedWorkflowState: CombinedWorkflowState | null = null

  constructor(
    projectPath: string,
    snapshot: ProjectSnapshot,
    callbacks: WorkflowEngineCallbacks,
  ) {
    this.projectPath = projectPath
    this.snapshot = snapshot
    this.callbacks = callbacks
  }

  // ============================================================================
  // Snapshot Management
  // ============================================================================

  setSnapshot(snapshot: ProjectSnapshot): void {
    this.snapshot = snapshot
  }

  getSnapshot(): ProjectSnapshot {
    return this.snapshot
  }

  getProjectPath(): string {
    return this.projectPath
  }

  // ============================================================================
  // Workflow Detection
  // ============================================================================

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
   * Determine how to trigger a workflow.
   * Returns an object describing what action the UI should take.
   */
  getWorkflowTriggerAction(workflow: WorkflowDefinition): {
    type: 'non-ai' | 'combined' | 'focused-file' | 'input-modal' | 'ai'
    focusedFile?: ExpectedCoreFile
    focusedMessage?: string
    aiMessage?: string
  } {
    // Non-AI workflows
    if (!workflow.usesAI) {
      return { type: 'non-ai' }
    }

    // Combined workflows
    if (workflow.combinedSteps && workflow.combinedSteps.length > 0) {
      return { type: 'combined' }
    }

    // Fill workflows use focused file mechanism
    if (workflow.name === 'fill-overview') {
      return {
        type: 'focused-file',
        focusedFile: 'Overview.md',
        focusedMessage: `Help me fill in Overview.md. It currently only has template placeholders. Let's work through it section by section.`,
      }
    }

    if (workflow.name === 'roadmap-fill') {
      return {
        type: 'focused-file',
        focusedFile: 'Roadmap.md',
        focusedMessage: `Help me fill in Roadmap.md. I need to define milestones for my project from scratch. Let's work through it step by step.`,
      }
    }

    if (workflow.name === 'tasks-fill') {
      return {
        type: 'focused-file',
        focusedFile: 'Tasks.md',
        focusedMessage: `Help me fill in Tasks.md. I need to create vertical slices and tasks aligned with my roadmap. Let's work through it step by step.`,
      }
    }

    // Init-from-summary needs input modal first
    if (workflow.name === 'init-from-summary') {
      return { type: 'input-modal' }
    }

    // Standard AI workflow
    return {
      type: 'ai',
      aiMessage: `Run the ${workflow.displayName} workflow`,
    }
  }

  // ============================================================================
  // Combined Workflow Execution
  // ============================================================================

  /**
   * Initialize a combined workflow.
   */
  initCombinedWorkflow(workflow: WorkflowDefinition): CombinedWorkflowState | null {
    if (!workflow.combinedSteps || workflow.combinedSteps.length === 0) return null

    const steps: CombinedWorkflowStep[] = workflow.combinedSteps.map((name) => ({
      workflowName: name,
      status: 'pending' as const,
    }))

    this.combinedWorkflowState = {
      combinedName: workflow.name,
      steps,
      currentStepIndex: 0,
    }

    return this.combinedWorkflowState
  }

  /**
   * Get the current step in a combined workflow.
   */
  getCurrentCombinedStep(): { step: CombinedWorkflowStep; workflow: WorkflowDefinition; index: number; total: number } | null {
    if (!this.combinedWorkflowState) return null

    const { steps, currentStepIndex } = this.combinedWorkflowState
    if (currentStepIndex >= steps.length) return null

    const step = steps[currentStepIndex]
    const workflow = getWorkflowDefinition(step.workflowName)

    return {
      step,
      workflow,
      index: currentStepIndex,
      total: steps.length,
    }
  }

  /**
   * Mark the current combined step as running.
   */
  markCurrentStepRunning(): void {
    const current = this.getCurrentCombinedStep()
    if (current) {
      current.step.status = 'running'
    }
  }

  /**
   * Mark the current combined step as completed and advance.
   */
  advanceCombinedWorkflow(): void {
    if (!this.combinedWorkflowState) return

    const { steps, currentStepIndex } = this.combinedWorkflowState

    // Mark current step as completed if still running
    if (currentStepIndex < steps.length && steps[currentStepIndex].status === 'running') {
      steps[currentStepIndex].status = 'completed'
    }

    // Move to next step
    this.combinedWorkflowState.currentStepIndex++
  }

  /**
   * Mark the current step as skipped with a reason.
   */
  skipCurrentStep(reason: string): void {
    const current = this.getCurrentCombinedStep()
    if (current) {
      current.step.status = 'skipped'
      current.step.skipReason = reason
    }
  }

  /**
   * Check if the combined workflow is complete.
   */
  isCombinedWorkflowComplete(): boolean {
    if (!this.combinedWorkflowState) return true
    return this.combinedWorkflowState.currentStepIndex >= this.combinedWorkflowState.steps.length
  }

  /**
   * Get summary of completed combined workflow.
   */
  getCombinedWorkflowSummary(): { displayName: string; completed: number; skipped: number } | null {
    if (!this.combinedWorkflowState) return null

    const { combinedName, steps } = this.combinedWorkflowState
    const completed = steps.filter((s) => s.status === 'completed').length
    const skipped = steps.filter((s) => s.status === 'skipped').length
    const combinedWorkflow = getWorkflowDefinition(combinedName)

    return { displayName: combinedWorkflow.displayName, completed, skipped }
  }

  /**
   * Clear combined workflow state.
   */
  clearCombinedWorkflowState(): void {
    this.combinedWorkflowState = null
  }

  /**
   * Check if a combined workflow is currently active.
   */
  isCombinedWorkflowActive(): boolean {
    return this.combinedWorkflowState !== null
  }

  /**
   * Get the current combined workflow state.
   */
  getCombinedWorkflowState(): CombinedWorkflowState | null {
    return this.combinedWorkflowState
  }

  // ============================================================================
  // Groom Tasks Workflow
  // ============================================================================

  /**
   * Parse Log.md content for potential tasks.
   */
  parseGroomTasks(logContent: string): GroomTasksParseResult {
    try {
      const parsed = parsePotentialTasks(logContent)
      this.pendingPotentialTasks = parsed.allTasks
      this.parsedPotentialTasks = parsed

      return {
        success: true,
        tasks: parsed.allTasks,
        parsed,
        actionableCount: parsed.actionableTaskCount,
      }
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
        tasks: [],
        parsed: null,
        actionableCount: 0,
      }
    }
  }

  /**
   * Apply potential task actions and return new file contents.
   */
  applyGroomTaskActions(
    logContent: string,
    tasksContent: string,
    selections: TaskSelection[]
  ): GroomTasksApplyResult {
    if (!this.parsedPotentialTasks) {
      return { newLogContent: null, newTasksContent: null }
    }

    const rejects = selections.filter((s) => s.action === 'reject')
    const moves = selections.filter((s) => s.action === 'move-to-future')

    const actions: TaskUpdateAction[] = selections.map((s) => ({
      taskId: s.taskId,
      action: s.action,
    }))

    let newLogContent: string | null = null
    let newTasksContent: string | null = null

    // Process Log.md updates
    if (rejects.length > 0 || moves.length > 0) {
      const result = updateLogWithTaskActions(logContent, actions, this.parsedPotentialTasks)
      newLogContent = result.newContent
    }

    // Process Tasks.md additions
    if (moves.length > 0) {
      const movedTasks = moves.map((m) => {
        const task = this.pendingPotentialTasks.find((t) => t.id === m.taskId)
        return {
          text: task?.text || '',
          sourceDate: task?.logEntryDate || null,
        }
      })
      newTasksContent = appendToFutureTasksSection(tasksContent, movedTasks)
    }

    return { newLogContent, newTasksContent }
  }

  /**
   * Clear groom tasks state.
   */
  clearGroomTasksState(): void {
    this.pendingPotentialTasks = []
    this.parsedPotentialTasks = null
  }

  /**
   * Get pending potential tasks.
   */
  getPendingPotentialTasks(): PotentialTask[] {
    return this.pendingPotentialTasks
  }

  // ============================================================================
  // Harvest Tasks Workflow
  // ============================================================================

  /**
   * Parse AI response for harvest tasks.
   */
  parseHarvestTasks(content: string): HarvestTasksParseResult {
    try {
      const tasks = parseHarvestResponse(content)
      this.pendingHarvestedTasks = tasks
      return { success: true, tasks }
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
        tasks: [],
      }
    }
  }

  /**
   * Parse roadmap content for slices.
   */
  parseRoadmapForSlices(roadmapContent: string): RoadmapSlice[] {
    this.roadmapSlices = parseRoadmapSlices(roadmapContent)
    return this.roadmapSlices
  }

  /**
   * Apply harvest task selections and return new content.
   */
  applyHarvestSelections(tasksContent: string, selections: HarvestTaskSelection[]): string {
    return applyHarvestSelections(tasksContent, selections, this.pendingHarvestedTasks)
  }

  /**
   * Detect which harvest tasks have already been moved.
   */
  detectMovedHarvestTasks(tasks: HarvestedTask[], tasksContent: string): HarvestedTask[] {
    const updated = detectMovedHarvestTasks(tasks, tasksContent)
    this.pendingHarvestedTasks = updated
    return updated
  }

  /**
   * Clear harvest tasks state.
   */
  clearHarvestTasksState(): void {
    this.pendingHarvestedTasks = []
    this.roadmapSlices = []
  }

  /**
   * Get pending harvested tasks.
   */
  getPendingHarvestedTasks(): HarvestedTask[] {
    return this.pendingHarvestedTasks
  }

  /**
   * Get roadmap slices.
   */
  getRoadmapSlices(): RoadmapSlice[] {
    return this.roadmapSlices
  }

  // ============================================================================
  // Ideas Groom Workflow
  // ============================================================================

  /**
   * Parse AI response for ideas groom.
   */
  parseIdeasGroom(content: string): { success: boolean; error?: string; tasks: GroomedIdeaTask[] } {
    try {
      const tasks = parseIdeasGroomResponse(content)
      this.pendingGroomedIdeaTasks = tasks
      return { success: true, tasks }
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
        tasks: [],
      }
    }
  }

  /**
   * Apply ideas groom selections and return new content.
   */
  applyIdeasGroomSelections(tasksContent: string, selections: GroomedIdeaSelection[]): string {
    return applyIdeasGroomSelections(tasksContent, selections, this.pendingGroomedIdeaTasks)
  }

  /**
   * Detect which ideas have already been moved.
   */
  detectMovedIdeas(tasks: GroomedIdeaTask[], tasksContent: string): GroomedIdeaTask[] {
    const updated = detectMovedIdeas(tasks, tasksContent)
    this.pendingGroomedIdeaTasks = updated
    return updated
  }

  /**
   * Clear ideas groom state.
   */
  clearIdeasGroomState(): void {
    this.pendingGroomedIdeaTasks = []
  }

  /**
   * Get pending groomed idea tasks.
   */
  getPendingGroomedIdeaTasks(): GroomedIdeaTask[] {
    return this.pendingGroomedIdeaTasks
  }

  // ============================================================================
  // Sync Commits Workflow
  // ============================================================================

  /**
   * Set recent git commits.
   */
  setRecentGitCommits(commits: GitCommit[]): void {
    this.recentGitCommits = commits
  }

  /**
   * Get recent git commits.
   */
  getRecentGitCommits(): GitCommit[] {
    return this.recentGitCommits
  }

  /**
   * Parse AI response for sync commits.
   */
  parseSyncCommits(content: string): SyncCommitsParseResult {
    try {
      const parsed = parseSyncCommitsResponse(content, this.recentGitCommits)
      this.pendingSyncCommitMatches = parsed.matches
      this.pendingUnmatchedCommits = parsed.unmatchedCommits
      return {
        success: true,
        matches: parsed.matches,
        unmatchedCommits: parsed.unmatchedCommits,
      }
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
        matches: [],
        unmatchedCommits: [],
      }
    }
  }

  /**
   * Mark matches as already completed based on Tasks.md content.
   */
  markAlreadyCompletedMatches(tasksContent: string): CommitMatch[] {
    this.pendingSyncCommitMatches = this.pendingSyncCommitMatches.map((match) => {
      const taskPattern = match.taskText.slice(0, 30).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const completedPattern = new RegExp(`^\\s*-\\s*\\[x\\]\\s+${taskPattern}`, 'im')
      if (completedPattern.test(tasksContent)) {
        return { ...match, alreadyCompleted: true }
      }
      return match
    })
    return this.pendingSyncCommitMatches
  }

  /**
   * Apply sync commit selections and return new content.
   */
  applySyncCommitSelections(
    tasksContent: string,
    archiveContent: string,
    selections: SyncCommitSelection[]
  ): SyncCommitsApplyResult {
    const actionsToApply = selections.filter((s) => s.action !== 'skip')

    // Apply task completions
    const newTasksContent = applyTaskCompletions(tasksContent, actionsToApply, this.pendingSyncCommitMatches)

    // Build archive entries for archived tasks
    const archiveSelections = actionsToApply.filter((s) => s.action === 'mark-archive')
    let newArchiveContent: string | null = null

    if (archiveSelections.length > 0) {
      const archiveEntries = buildArchiveEntries(archiveSelections, this.pendingSyncCommitMatches)
      newArchiveContent = applyArchiveEntries(archiveContent, archiveEntries)
    }

    const completedCount = actionsToApply.filter((s) => s.action === 'mark-complete').length
    const archivedCount = archiveSelections.length

    return {
      newTasksContent,
      newArchiveContent,
      completedCount,
      archivedCount,
    }
  }

  /**
   * Clear sync commits state.
   */
  clearSyncCommitsState(): void {
    this.pendingSyncCommitMatches = []
    this.pendingUnmatchedCommits = []
    this.recentGitCommits = []
  }

  /**
   * Get pending sync commit matches.
   */
  getPendingSyncCommitMatches(): CommitMatch[] {
    return this.pendingSyncCommitMatches
  }

  /**
   * Get pending unmatched commits.
   */
  getPendingUnmatchedCommits(): UnmatchedCommit[] {
    return this.pendingUnmatchedCommits
  }

  // ============================================================================
  // Archive Completed Workflow
  // ============================================================================

  /**
   * Extract completed tasks from Tasks.md content.
   */
  extractCompletedTasks(tasksContent: string): CompletedTask[] {
    const tasks = extractCompletedTasks(tasksContent)
    this.pendingArchiveCompletedTasks = tasks
    return tasks
  }

  /**
   * Parse archive completed response (uses AI or local grouping).
   */
  parseArchiveCompleted(content: string, completedTasks: CompletedTask[]): ArchiveCompletedParseResult {
    try {
      let result: { sliceGroups: SliceGroup[]; standaloneTasks: CompletedTask[] }

      if (containsArchiveCompletedResponse(content)) {
        const parsed = parseArchiveCompletedResponse(content, completedTasks)
        result = {
          sliceGroups: parsed.sliceGroups,
          standaloneTasks: parsed.standaloneTasks,
        }
      } else {
        result = groupTasksBySlice(completedTasks)
      }

      this.pendingSliceGroups = result.sliceGroups
      this.pendingStandaloneTasks = result.standaloneTasks

      return {
        success: true,
        sliceGroups: result.sliceGroups,
        standaloneTasks: result.standaloneTasks,
        allTasks: completedTasks,
      }
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
        sliceGroups: [],
        standaloneTasks: [],
        allTasks: [],
      }
    }
  }

  /**
   * Apply archive selections and return new content.
   */
  applyArchiveSelections(
    tasksContent: string,
    archiveContent: string,
    selections: ArchiveSelection[]
  ): ArchiveCompletedApplyResult {
    const archiveSelections = selections.filter((s) => s.action === 'archive')
    const allTasks = getAllTasks(this.pendingSliceGroups, this.pendingStandaloneTasks)

    // Remove archived tasks from Tasks.md
    const newTasksContent = applyArchiveRemoval(tasksContent, archiveSelections, allTasks)

    // Build and apply archive entries
    const archiveEntries = buildArchiveCompletedEntries(
      archiveSelections,
      this.pendingSliceGroups,
      this.pendingStandaloneTasks
    )
    const newArchiveContent = applyArchiveAdditions(archiveContent, archiveEntries)

    return {
      newTasksContent,
      newArchiveContent,
      archivedCount: archiveSelections.length,
    }
  }

  /**
   * Clear archive completed state.
   */
  clearArchiveCompletedState(): void {
    this.pendingArchiveCompletedTasks = []
    this.pendingSliceGroups = []
    this.pendingStandaloneTasks = []
  }

  /**
   * Get pending slice groups.
   */
  getPendingSliceGroups(): SliceGroup[] {
    return this.pendingSliceGroups
  }

  /**
   * Get pending standalone tasks.
   */
  getPendingStandaloneTasks(): CompletedTask[] {
    return this.pendingStandaloneTasks
  }

  // ============================================================================
  // Promote Next Task Workflow
  // ============================================================================

  /**
   * Check if Tasks.md current section has tasks.
   */
  checkHasTasksInCurrent(tasksContent: string): boolean {
    return hasTasksInCurrent(tasksContent)
  }

  /**
   * Parse AI response for promote next task.
   */
  parsePromoteNext(content: string): PromoteNextParseResult {
    try {
      const parsed = parsePromoteNextResponse(content)

      this.pendingPromoteStatus = parsed.status
      this.pendingSelectedTask = parsed.selectedTask ?? null
      this.pendingPromoteReasoning = parsed.reasoning ?? null
      this.pendingPromoteCandidates = parsed.candidates ?? []
      this.pendingExistingCurrentTask = parsed.existingCurrentTask ?? null
      this.pendingPromoteMessage = parsed.message ?? null
      this.pendingRoadmapChanges = parsed.roadmapChanges ?? null

      return {
        success: true,
        status: parsed.status,
        selectedTask: this.pendingSelectedTask,
        reasoning: this.pendingPromoteReasoning,
        candidates: this.pendingPromoteCandidates,
        existingCurrentTask: this.pendingExistingCurrentTask,
        message: this.pendingPromoteMessage,
        roadmapChanges: this.pendingRoadmapChanges,
      }
    } catch (err) {
      return {
        success: false,
        status: 'no_tasks',
        selectedTask: null,
        reasoning: null,
        candidates: [],
        existingCurrentTask: null,
        message: err instanceof Error ? err.message : 'Unknown error',
        roadmapChanges: null,
      }
    }
  }

  /**
   * Build the promote selection message for chat.
   */
  buildPromoteSelectionMessage(): string | null {
    if (!this.pendingSelectedTask) return null

    const task = this.pendingSelectedTask
    const sourceLabel = 'Later'

    let message = `**Task to Promote**\n\n`
    message += `- [ ] ${task.text}\n\n`
    message += `*From ${sourceLabel} section*`

    if (task.sliceLink) {
      message += ` | ${task.sliceLink}`
    }

    message += `\n\n`

    if (this.pendingPromoteReasoning) {
      message += `**Why this task:** ${this.pendingPromoteReasoning}\n\n`
    }

    if (this.pendingPromoteCandidates.length > 0) {
      message += `<details>\n<summary>Other candidates considered (${this.pendingPromoteCandidates.length})</summary>\n\n`
      for (const candidate of this.pendingPromoteCandidates) {
        message += `- ${candidate.text} *(Later, score: ${candidate.score}/5)*\n`
        if (candidate.note) {
          message += `  - ${candidate.note}\n`
        }
      }
      message += `\n</details>\n\n`
    }

    message += `---\n\n`
    message += `Say **${WorkflowEngine.PROMOTE_KEYWORD}** to move this task to Current, or **SKIP** to continue without promoting.`

    return message
  }

  /**
   * Set awaiting promote keyword state.
   */
  setAwaitingPromoteKeyword(awaiting: boolean): void {
    this.awaitingPromoteKeyword = awaiting
  }

  /**
   * Check if awaiting promote keyword.
   */
  isAwaitingPromoteKeyword(): boolean {
    return this.awaitingPromoteKeyword
  }

  /**
   * Check if user input is a promote keyword response.
   * Returns 'confirm' | 'skip' | 'other'.
   */
  checkPromoteKeywordInput(userInput: string): 'confirm' | 'skip' | 'other' {
    const input = userInput.trim().toUpperCase()

    if (input === WorkflowEngine.PROMOTE_KEYWORD || input === 'PROMOTE' || input === 'YES' || input === 'CONFIRM' || input === 'Y') {
      return 'confirm'
    }

    if (input === 'SKIP' || input === 'NO' || input === 'CANCEL') {
      return 'skip'
    }

    return 'other'
  }

  /**
   * Apply task promotion and return new content.
   */
  applyTaskPromotion(
    tasksContent: string,
    roadmapContent: string | null
  ): PromoteNextApplyResult {
    if (!this.pendingSelectedTask) {
      return {
        newTasksContent: tasksContent,
        newRoadmapContent: null,
        roadmapUpdated: false,
      }
    }

    const newTasksContent = applyTaskPromotion(tasksContent, this.pendingSelectedTask)

    let newRoadmapContent: string | null = null
    let roadmapUpdated = false

    if (roadmapContent && this.pendingRoadmapChanges?.shouldUpdateCurrentFocus) {
      newRoadmapContent = applyRoadmapChanges(roadmapContent, this.pendingRoadmapChanges)
      roadmapUpdated = true
    }

    return {
      newTasksContent,
      newRoadmapContent,
      roadmapUpdated,
    }
  }

  /**
   * Check if a task has already been promoted to Current.
   */
  checkTaskAlreadyPromoted(tasksContent: string): boolean {
    if (!this.pendingSelectedTask) return false

    const taskPattern = this.pendingSelectedTask.text.slice(0, 30).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const currentPattern = /^##\s*(?:Current|Now)/im
    const nextSectionPattern = /^##\s*(?:Later|Blocked)/im

    const currentMatch = tasksContent.match(currentPattern)
    if (currentMatch) {
      const currentStart = currentMatch.index!
      const nextMatch = tasksContent.slice(currentStart).match(nextSectionPattern)
      const currentEnd = nextMatch ? currentStart + nextMatch.index! : tasksContent.length
      const currentSection = tasksContent.slice(currentStart, currentEnd)

      return new RegExp(taskPattern).test(currentSection)
    }

    return false
  }

  /**
   * Clear promote next state.
   */
  clearPromoteNextState(): void {
    this.pendingSelectedTask = null
    this.pendingPromoteReasoning = null
    this.pendingPromoteCandidates = []
    this.pendingPromoteStatus = 'no_tasks'
    this.pendingExistingCurrentTask = null
    this.pendingPromoteMessage = null
    this.pendingRoadmapChanges = null
    this.awaitingPromoteKeyword = false
  }

  /**
   * Get pending selected task.
   */
  getPendingSelectedTask(): SelectedTask | null {
    return this.pendingSelectedTask
  }

  /**
   * Get pending promote status.
   */
  getPendingPromoteStatus(): PromoteStatus {
    return this.pendingPromoteStatus
  }

  /**
   * Get pending promote reasoning.
   */
  getPendingPromoteReasoning(): string | null {
    return this.pendingPromoteReasoning
  }

  /**
   * Get pending promote candidates.
   */
  getPendingPromoteCandidates(): CandidateTask[] {
    return this.pendingPromoteCandidates
  }

  /**
   * Get pending existing current task.
   */
  getPendingExistingCurrentTask(): string | null {
    return this.pendingExistingCurrentTask
  }

  /**
   * Get pending promote message.
   */
  getPendingPromoteMessage(): string | null {
    return this.pendingPromoteMessage
  }

  /**
   * Set pending promote message.
   */
  setPendingPromoteMessage(message: string | null): void {
    this.pendingPromoteMessage = message
  }

  // ============================================================================
  // Init From Summary Workflow
  // ============================================================================

  /**
   * Parse AI response for init-from-summary.
   */
  parseInitFromSummary(content: string): InitSummaryParseResult {
    if (!containsBatchDiffResponse(content)) {
      return {
        success: true,
        hasDiffs: false,
        diffs: new Map(),
      }
    }

    try {
      const result = parseBatchDiffResponse(content)
      return {
        success: true,
        hasDiffs: result.diffs.size > 0,
        diffs: result.diffs,
      }
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
        hasDiffs: false,
        diffs: new Map(),
      }
    }
  }
}
