// Project snapshot types for existing projects
// Captures a deterministic view of core files, their metadata, and template fill status.

export type ExpectedCoreFile =
  | 'Overview.md'
  | 'Roadmap.md'
  | 'Log.md'
  | 'Archive.md'
  | 'Ideas.md'
  | 'Tasks.md'

export const EXPECTED_CORE_FILES: ExpectedCoreFile[] = [
  'Overview.md',
  'Roadmap.md',
  'Log.md',
  'Archive.md',
  'Ideas.md',
  'Tasks.md',
]

export type TemplateStatus = 'missing' | 'template_only' | 'thin' | 'filled'

export type SnapshotFileEntry = {
  path: string
  exists: boolean
  sizeBytes?: number
  modifiedAt?: string
  frontmatter: Record<string, unknown>
  templateStatus: TemplateStatus
  templateFindings: string[]
}

export type SnapshotHealth = {
  missingFiles: ExpectedCoreFile[]
  thinOrTemplateFiles: {
    file: ExpectedCoreFile
    status: Exclude<TemplateStatus, 'filled' | 'missing'>
    reasons: string[]
  }[]
}

/**
 * Project readiness assessment for workflow gating.
 * Determines if a project has enough basis for advanced workflows.
 */
export type ProjectReadinessAssessment = {
  /** Whether the project is ready for advanced workflows */
  isReady: boolean
  /** Missing basics that must be addressed first */
  missingBasics: string[]
  /** Files in priority order that need attention */
  prioritizedFiles: ExpectedCoreFile[]
  /** Human-readable summary for the AI/user */
  gatingSummary: string
}

export type ProjectSnapshot = {
  projectName: string
  projectPath: string
  capturedAt: string
  expectedFiles: ExpectedCoreFile[]
  files: Record<ExpectedCoreFile, SnapshotFileEntry>
  health: SnapshotHealth
  /** Readiness assessment for workflow gating */
  readiness: ProjectReadinessAssessment
}
