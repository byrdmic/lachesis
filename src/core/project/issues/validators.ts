// Issue validators - heading validation and issue detection

import * as fs from 'fs'
import * as path from 'path'
import type { ProjectIssue, IssueFile } from './types'
import type { ProjectSnapshot, ExpectedCoreFile } from '../snapshot'
import type { MilestoneTransitionState, ParsedMilestone } from '../status'
import {
  validateOverviewHeadings,
  validateRoadmapHeadings,
} from '../template-evaluator'
import {
  formatMissingHeadingsMessage,
  formatMissingHeadingsList,
  formatMissingFileMessage,
  formatTemplateOnlyMessage,
  formatThinContentMessage,
  formatConfigIssueMessage,
  formatTasksCompleteMessage,
  formatMilestoneCompleteMessage,
  formatMilestoneTasksRemainMessage,
  formatAllMilestonesCompleteMessage,
} from './formatters'

// ============================================================================
// Types
// ============================================================================

/**
 * Factory for creating fix actions. Allows the validator to create issues
 * without knowing the specific fix implementations.
 */
export type FixActionFactory = {
  createMissingFileFix: (fileName: ExpectedCoreFile) => () => Promise<void>
  createTemplateOnlyFix: (fileName: ExpectedCoreFile) => () => Promise<void>
  createThinFileFix: (fileName: ExpectedCoreFile) => () => Promise<void>
  createConfigFix: () => () => Promise<void>
  createHeadingsAIFix: (fileName: ExpectedCoreFile, missingHeadings: string[]) => () => Promise<void>
  createHeadingsReformatFix: (fileName: 'Overview.md' | 'Roadmap.md') => () => Promise<void>
  /** Create fix action for closing a milestone when all tasks are complete */
  createMarkMilestoneDoneFix: (milestone: ParsedMilestone) => () => Promise<void>
  /** Create fix action for planning the next milestone */
  createPlanNextMilestoneFix: (nextMilestone: ParsedMilestone | null) => () => Promise<void>
  /** Create fix action for reviewing remaining tasks when milestone is marked done */
  createReviewTasksFix: (incompleteTasks: number) => () => Promise<void>
  /** Create fix action for celebrating all milestones complete */
  createCelebrateFix: () => () => Promise<void>
}

// ============================================================================
// Heading Validation
// ============================================================================

/**
 * Check Overview.md heading validation using filesystem.
 * Returns an issue if headings are invalid, null otherwise.
 */
export function checkOverviewHeadings(
  basePath: string,
  projectPath: string,
  fixFactory: FixActionFactory
): ProjectIssue | null {
  try {
    const overviewPath = path.join(basePath, projectPath, 'Overview.md')

    if (!fs.existsSync(overviewPath)) return null

    const content = fs.readFileSync(overviewPath, 'utf-8')
    const validation = validateOverviewHeadings(content)

    if (!validation.isValid) {
      return {
        file: 'Overview.md',
        type: 'headings_invalid',
        message: formatMissingHeadingsMessage(validation.missingHeadings.length),
        details: formatMissingHeadingsList(validation.missingHeadings),
        fixLabel: 'Add Missing (AI)',
        fixAction: fixFactory.createHeadingsAIFix('Overview.md', validation.missingHeadings),
        secondaryFixLabel: 'Reformat File',
        secondaryFixAction: fixFactory.createHeadingsReformatFix('Overview.md'),
      }
    }

    return null
  } catch (err) {
    console.warn('Failed to validate Overview.md headings:', err)
    return null
  }
}

/**
 * Check Roadmap.md heading validation using filesystem.
 * Returns an issue if headings are invalid, null otherwise.
 */
export function checkRoadmapHeadings(
  basePath: string,
  projectPath: string,
  fixFactory: FixActionFactory
): ProjectIssue | null {
  try {
    const roadmapPath = path.join(basePath, projectPath, 'Roadmap.md')

    if (!fs.existsSync(roadmapPath)) return null

    const content = fs.readFileSync(roadmapPath, 'utf-8')
    const validation = validateRoadmapHeadings(content)

    if (!validation.isValid) {
      return {
        file: 'Roadmap.md',
        type: 'headings_invalid',
        message: formatMissingHeadingsMessage(validation.missingHeadings.length),
        details: formatMissingHeadingsList(validation.missingHeadings),
        fixLabel: 'Add Missing (AI)',
        fixAction: fixFactory.createHeadingsAIFix('Roadmap.md', validation.missingHeadings),
        secondaryFixLabel: 'Reformat File',
        secondaryFixAction: fixFactory.createHeadingsReformatFix('Roadmap.md'),
      }
    }

    return null
  } catch (err) {
    console.warn('Failed to validate Roadmap.md headings:', err)
    return null
  }
}

// ============================================================================
// Issue List Building
// ============================================================================

/**
 * Build the complete list of issues from a project snapshot.
 * Uses the fix factory to create fix actions for each issue.
 */
export function buildIssuesFromSnapshot(
  snapshot: ProjectSnapshot,
  basePath: string,
  fixFactory: FixActionFactory
): ProjectIssue[] {
  const issues: ProjectIssue[] = []

  // Check for config issues first (higher priority)
  if (snapshot.health.configIssues.length > 0) {
    const configMissing = !snapshot.aiConfig
    issues.push({
      file: '.ai/config.json',
      type: 'config',
      message: formatConfigIssueMessage(configMissing),
      fixLabel: configMissing ? 'Create Config' : 'Configure',
      fixAction: fixFactory.createConfigFix(),
    })
  }

  // Check prioritized files for issues
  for (const fileName of snapshot.readiness.prioritizedFiles) {
    const fileEntry = snapshot.files[fileName]

    if (!fileEntry.exists) {
      issues.push({
        file: fileName,
        type: 'missing',
        message: formatMissingFileMessage(fileName),
        fixLabel: 'Create File',
        fixAction: fixFactory.createMissingFileFix(fileName),
      })
    } else if (fileEntry.templateStatus === 'template_only') {
      issues.push({
        file: fileName,
        type: 'template_only',
        message: formatTemplateOnlyMessage(fileName),
        fixLabel: 'Fill with AI',
        fixAction: fixFactory.createTemplateOnlyFix(fileName),
      })
    } else if (fileEntry.templateStatus === 'thin') {
      issues.push({
        file: fileName,
        type: 'thin',
        message: formatThinContentMessage(fileName),
        fixLabel: 'Expand with AI',
        fixAction: fixFactory.createThinFileFix(fileName),
      })
    }
  }

  // Check Overview.md headings (only if file exists and isn't already flagged)
  const overviewEntry = snapshot.files['Overview.md']
  if (overviewEntry?.exists && overviewEntry.templateStatus !== 'missing') {
    const alreadyHasOverviewIssue = issues.some(
      (i) => i.file === 'Overview.md' && (i.type === 'missing' || i.type === 'template_only')
    )
    if (!alreadyHasOverviewIssue) {
      const headingIssue = checkOverviewHeadings(basePath, snapshot.projectPath, fixFactory)
      if (headingIssue) {
        issues.push(headingIssue)
      }
    }
  }

  // Check Roadmap.md headings (only if file exists and isn't already flagged)
  const roadmapEntry = snapshot.files['Roadmap.md']
  if (roadmapEntry?.exists && roadmapEntry.templateStatus !== 'missing') {
    const alreadyHasRoadmapIssue = issues.some(
      (i) => i.file === 'Roadmap.md' && (i.type === 'missing' || i.type === 'template_only')
    )
    if (!alreadyHasRoadmapIssue) {
      const headingIssue = checkRoadmapHeadings(basePath, snapshot.projectPath, fixFactory)
      if (headingIssue) {
        issues.push(headingIssue)
      }
    }
  }

  return issues
}

// ============================================================================
// Milestone Transition Issues
// ============================================================================

/**
 * Build issues from milestone transition state.
 * Returns issues for milestone completion, tasks remaining, or all complete states.
 */
export function buildMilestoneTransitionIssues(
  transitionState: MilestoneTransitionState,
  fixFactory: FixActionFactory
): ProjectIssue[] {
  const issues: ProjectIssue[] = []

  if (transitionState.status === 'none') {
    return issues
  }

  if (transitionState.status === 'all_complete') {
    issues.push({
      file: 'Roadmap.md',
      type: 'all_milestones_complete',
      message: formatAllMilestonesCompleteMessage(),
      fixLabel: 'Celebrate!',
      fixAction: fixFactory.createCelebrateFix(),
    })
    return issues
  }

  // status === 'tasks_complete' - all tasks done but milestone still active
  if (transitionState.status === 'tasks_complete') {
    const { milestone, nextMilestone } = transitionState
    issues.push({
      file: 'Roadmap.md',
      type: 'tasks_complete',
      message: formatTasksCompleteMessage(milestone.id, milestone.title),
      details: nextMilestone
        ? `Ready to close and move to ${nextMilestone.id}: "${nextMilestone.title}"`
        : 'No more planned milestones — consider wrapping up or planning new ones',
      fixLabel: 'Close Milestone',
      fixAction: fixFactory.createMarkMilestoneDoneFix(milestone),
      secondaryFixLabel: 'Plan Next Steps',
      secondaryFixAction: fixFactory.createPlanNextMilestoneFix(nextMilestone),
    })
    return issues
  }

  // status === 'milestone_complete'
  const { milestone, hasIncompleteTasks, incompleteTasks, nextMilestone } = transitionState

  if (hasIncompleteTasks) {
    // Milestone done but tasks remain - warning state
    issues.push({
      file: 'Roadmap.md',
      type: 'milestone_tasks_remain',
      message: formatMilestoneTasksRemainMessage(milestone.id, milestone.title, incompleteTasks),
      details: `${incompleteTasks} task${incompleteTasks > 1 ? 's' : ''} in Current section`,
      fixLabel: 'Review Tasks',
      fixAction: fixFactory.createReviewTasksFix(incompleteTasks),
      secondaryFixLabel: 'Plan Anyway',
      secondaryFixAction: fixFactory.createPlanNextMilestoneFix(nextMilestone),
    })
  } else {
    // Milestone done and all tasks complete - celebration state
    issues.push({
      file: 'Roadmap.md',
      type: 'milestone_complete',
      message: formatMilestoneCompleteMessage(milestone.id, milestone.title),
      details: nextMilestone
        ? `Ready to start ${nextMilestone.id}: "${nextMilestone.title}"`
        : 'No more planned milestones',
      fixLabel: 'Plan Next Phase',
      fixAction: fixFactory.createPlanNextMilestoneFix(nextMilestone),
    })
  }

  return issues
}
