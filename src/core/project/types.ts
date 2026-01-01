// Core project types for Lachesis Obsidian plugin

export type PlanningLevel = string

export type ProjectStatus = 'planning' | 'building'
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
  antiGoals: string[]
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
  notYet: string[]
}

export type SessionSetup = {
  planningLevel: PlanningLevel
}

export type SessionLogEntry = {
  phase: string
  question: string
  answer: string
  timestamp: string
}

// Helper to create a slug from a project name (kebab-case)
export function createSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
}

// Helper to create a human-friendly folder name from a project name
export function createFolderName(name: string): string {
  return name
    .trim()
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// Helper to get current ISO timestamp
export function nowISO(): string {
  return new Date().toISOString()
}

// Helper to get current date string (YYYY-MM-DD)
export function todayDate(): string {
  return new Date().toISOString().split('T')[0] ?? ''
}
