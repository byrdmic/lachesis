// Phase definitions for project intake
import type { PhaseDefinition } from './types'

// AI Conversation phase - AI handles all questions dynamically
export const aiConversationPhase: PhaseDefinition = {
  id: 'vision',
  name: 'Project Discovery',
  description: "Let's explore what you're building",
  summaryCheckQuestion: "Does this capture what you're building?",
  questions: [], // Empty - AI generates questions dynamically
}

// Finalize phase - wrap up and generate outputs
export const finalizePhase: PhaseDefinition = {
  id: 'finalize',
  name: 'Finalize',
  description: 'Review and generate project files',
  summaryCheckQuestion: 'Ready to generate your project structure?',
  questions: [],
}

// All phases in order
export const allPhases: PhaseDefinition[] = [aiConversationPhase, finalizePhase]

// Get phase by ID
export function getPhaseById(id: string): PhaseDefinition | undefined {
  return allPhases.find((p) => p.id === id)
}

// Topics for AI guidance - derived from Overview.md template sections.
export const DISCOVERY_TOPICS = [
  'elevator_pitch',
  'problem_statement',
  'target_users',
  'value_proposition',
  'scope_and_antigoals',
  'constraints',
] as const

export type DiscoveryTopic = (typeof DISCOVERY_TOPICS)[number]
