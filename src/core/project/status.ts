// Project status types for milestone progress and task tracking
// Extracted from Roadmap.md and Tasks.md on project load

export type MilestoneStatus = 'planned' | 'active' | 'done' | 'blocked' | 'cut'

/**
 * Represents the state when a milestone has been completed.
 * Used to prompt the user to plan the next phase.
 */
export type MilestoneTransitionState =
  | { status: 'none' }
  | {
      status: 'tasks_complete'
      /** The milestone whose tasks are all complete */
      milestone: ParsedMilestone
      /** Whether there's another planned milestone after this one */
      hasNextMilestone: boolean
      /** Next milestone to work on (if any) */
      nextMilestone: ParsedMilestone | null
    }
  | {
      status: 'milestone_complete'
      /** The milestone that was just completed */
      milestone: ParsedMilestone
      /** Whether there are still incomplete tasks in Current section */
      hasIncompleteTasks: boolean
      /** Number of incomplete tasks remaining */
      incompleteTasks: number
      /** Next milestone to work on (if any) */
      nextMilestone: ParsedMilestone | null
    }
  | { status: 'all_complete' }

export type ParsedMilestone = {
  /** Milestone identifier (e.g., "M1", "M2") */
  id: string
  /** Milestone title */
  title: string
  /** Current status */
  status: MilestoneStatus
}

export type ParsedSlice = {
  /** Slice identifier (e.g., "VS1", "VS2") */
  id: string
  /** Slice name/description */
  name: string
  /** Parent milestone identifier */
  milestoneId: string
}

export type ProjectStatus = {
  /** Currently active milestone (first with status 'active', or null) */
  currentMilestone: ParsedMilestone | null
  /** Currently active slice (from Current Focus section or first in active milestone) */
  activeSlice: ParsedSlice | null
  /** Number of completed tasks in Current section */
  tasksCompleted: number
  /** Total tasks in Current section */
  tasksTotal: number
  /** Status of the current milestone (convenience field) */
  milestoneStatus: MilestoneStatus | null
  /** All milestones found in Roadmap.md */
  allMilestones: ParsedMilestone[]
  /** All slices found in Roadmap.md */
  allSlices: ParsedSlice[]
  /** ISO timestamp when this status was computed */
  computedAt: string
  /** Transition state for milestone completion detection */
  transitionState: MilestoneTransitionState
}
