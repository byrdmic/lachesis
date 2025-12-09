// Core project types for Lachesis

// Freeform strings so the AI/user can provide any description
export type InterviewDepth = string
export type PlanningLevel = string

export type ProjectStatus = 'idea' | 'active' | 'paused' | 'done'
export type ReleasePhase =
  | 'seed'
  | 'explore'
  | 'build'
  | 'polish'
  | 'ship'
  | 'postmortem'

export type ProjectVision = {
  oneLinePitch: string
  description: string
  primaryAudience: string
  secondaryAudience?: string
  whyItMatters: string
  successLooksLike: string
  nonGoals: string[]
}

export type ProjectConstraints = {
  knownConstraints: string[]
  assumptions: string[]
  risks: string[]
  derailmentFactors: string[]
  antiGoals: string[] // "What do you not want this project to become?"
}

export type ProjectSolution = {
  approach: string
  primaryMechanism: string
  differentiation: string
  coreLoop: string
  excitement: string
}

export type ExecutionPlan = {
  firstMove: string
  secondMove?: string
  thirdMove?: string
  notYet: string[] // Things to intentionally postpone
}

export type SessionSetup = {
  planningLevel: PlanningLevel
  depth: InterviewDepth
}

export type ProjectDefinition = {
  name: string
  slug: string
  createdAt: string
  updatedAt: string
  status: ProjectStatus
  releasePhase: ReleasePhase
  setup: SessionSetup
  vision: ProjectVision
  constraints: ProjectConstraints
  solution: ProjectSolution
  execution: ExecutionPlan
  advisorsConfig: import('../../advisors/types.ts').AdvisorsConfig
  sessionLog: SessionLogEntry[]
}

export type SessionLogEntry = {
  phase: string
  question: string
  answer: string
  timestamp: string
}

// Helper to create a slug from a project name
export function createSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
}

// Helper to get current ISO timestamp
export function nowISO(): string {
  return new Date().toISOString()
}

// Helper to get current date string (YYYY-MM-DD)
export function todayDate(): string {
  return new Date().toISOString().split('T')[0] ?? ''
}
