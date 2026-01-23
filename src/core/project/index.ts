// Project module exports

// Snapshot types and builder
export {
  EXPECTED_CORE_FILES,
  type ExpectedCoreFile,
  type ProjectSnapshot,
  type ProjectReadinessAssessment,
  type SnapshotFileEntry,
  type SnapshotHealth,
  type TemplateStatus,
  type ProjectAIConfig,
} from './snapshot'

export {
  buildProjectSnapshot,
  buildProjectStatus,
  fetchProjectFileContents,
  formatFileContentsForModel,
  formatProjectSnapshotForModel,
} from './snapshot-builder'

// Status types
export type {
  MilestoneStatus,
  ParsedMilestone,
  ParsedSlice,
  ProjectStatus,
} from './status'

// Core project types
export {
  createSlug,
  createFolderName,
  nowISO,
  todayDate,
  type PlanningLevel,
  type ProjectStatus as LegacyProjectStatus,
  type ReleasePhase,
  type ProjectVision,
  type ProjectConstraints,
  type ProjectSolution,
  type ExecutionPlan,
  type SessionSetup,
  type SessionLogEntry,
} from './types'
