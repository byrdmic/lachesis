/**
 * SYNC COMMITS: Match completed git commits to tasks and update their status.
 * AI-powered with modal confirmation.
 */

import type { WorkflowDefinition } from '../types'
import { PROJECT_FILES } from './constants'

export const syncCommitsWorkflow: WorkflowDefinition = {
  name: 'sync-commits',
  displayName: 'Tasks: Sync Commits',
  description: 'Match completed git commits to tasks and update their status',
  intent:
    'Analyze recent git commits to find which tasks have been completed. ' +
    'Match commit messages to unchecked tasks in Tasks.md based on semantic similarity, ' +
    'keywords, and context. Present matches with confidence levels (high/medium/low) for user review. ' +
    'User can choose to mark tasks as complete only, or mark complete AND archive with commit reference.',
  readFiles: [
    PROJECT_FILES.tasks,
    PROJECT_FILES.archive,
    PROJECT_FILES.overview,
    PROJECT_FILES.roadmap,
  ],
  writeFiles: [PROJECT_FILES.tasks, PROJECT_FILES.archive],
  risk: 'low',
  confirmation: 'preview',
  allowsDelete: false,
  allowsCrossFileMove: true,
  rules: [
    // Analysis rules
    'Analyze recent git commits for task completion signals',
    'Match commits to unchecked tasks (- [ ]) in Tasks.md',
    'Consider commit message title, body, and referenced files',
    'Look for keywords, feature names, and slice references in commits',

    // Confidence levels
    'Assign confidence level to each match:',
    '  - high: Direct match - commit explicitly addresses the task',
    '  - medium: Semantic match - commit is related but not explicit',
    '  - low: Possible match - some overlap but uncertain',

    // Output format
    'Output structured JSON with matches and unmatched commits',
    'Each match must include: commitSha, commitMessage, taskText, taskSection, confidence, reasoning',
    'Include summary with totalCommits, matchedCount, unmatchedCount',

    // What NOT to do
    'Do NOT update Log.md - skip log updates entirely',
    'Do NOT match commits to already-completed tasks (- [x])',
    'Do NOT invent matches - only match if there is clear evidence',
  ],
  usesAI: true,
  hidden: true,
}
