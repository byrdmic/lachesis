// Types for project context packaging (used when loading existing projects)

/**
 * File categories expected in a Lachesis project
 */
export type FileCategory =
  | 'overview'
  | 'roadmap'
  | 'log'
  | 'idea'
  | 'archive'
  | 'advisors'
  | 'advisor_chat'
  | 'prompts'

/**
 * Health status of a file
 */
export type FileHealth = 'present' | 'missing' | 'weak'

/**
 * Information about a single file in the project
 */
export type ProjectFileInfo = {
  relativePath: string
  category: FileCategory | 'other'
  exists: boolean
  sizeBytes: number
  modifiedAt: string
  frontmatter?: Record<string, unknown>
  headSnippet?: string // First ~20 lines after frontmatter
  tailSnippet?: string // Last ~10 lines (for log-like files)
  health: FileHealth
  healthReason?: string
}

/**
 * Overall health signals for a project
 */
export type ProjectHealthSignals = {
  missingCategories: FileCategory[]
  weakFiles: { category: FileCategory; reason: string }[]
  overallHealth: 'healthy' | 'needs_attention' | 'incomplete'
}

/**
 * Complete context package for an existing project
 */
export type ProjectContextPackage = {
  projectName: string
  projectPath: string
  lastModified: string
  files: ProjectFileInfo[]
  health: ProjectHealthSignals
  currentStatus?: string
  currentPhase?: string
  currentMilestone?: string
  lastSessionSummary?: string
}

/**
 * Action types available after briefing
 */
export type LoadProjectActionType =
  | 'continue_planning'
  | 'start_building'
  | 'review_roadmap'
  | 'update_log'
  | 'open_obsidian'
  | 'custom'

/**
 * An action suggested by the AI briefing
 */
export type LoadProjectAction = {
  id: string
  label: string
  description: string
  actionType: LoadProjectActionType
}

/**
 * Structured response from AI briefing generation
 */
export type AIBriefingResponse = {
  greeting: string
  reorientation: string
  recentActivity: string
  healthAssessment: string
  recommendations: string[]
  question: string
  suggestedActions: LoadProjectAction[]
}
