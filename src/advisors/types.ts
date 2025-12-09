// Advisor types - AI personas that assist with different aspects of a project

export type AdvisorArchetype =
  | 'architect'
  | 'product_strategist'
  | 'user_advocate'
  | 'execution_lead'
  | 'researcher'
  | 'risk_skeptic'
  | 'scribe'
  | 'growth'

export type Advisor = {
  id: string
  name: string // Display name, e.g., "The Architect"
  humanName?: string // Optional fun human name, e.g., "Ariadne"
  archetype: AdvisorArchetype
  model?: string // Optional for future AI wiring
  personality?: string // Short description
  keyGoal?: string // One-line goal
  focusAreas?: string[] // Bullet points of focus
}

export type AdvisorsConfig = {
  project: string
  createdAt: string
  updatedAt: string
  advisors: Advisor[]
}

// Factory to create an empty advisors config
export function createEmptyAdvisorsConfig(projectName: string): AdvisorsConfig {
  const now = new Date().toISOString()
  return {
    project: projectName,
    createdAt: now,
    updatedAt: now,
    advisors: [],
  }
}
