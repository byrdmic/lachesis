// Phase definitions for project intake
import type { PhaseDefinition } from './types.ts'

// Setup phase questions are now gathered inside the AI prompt (no separate UI)
// These are kept for reference but no longer used directly
export const setupQuestions = []

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
  questions: [], // Handled directly in FinalizePhase component
}

// All phases in order
export const allPhases: PhaseDefinition[] = [aiConversationPhase, finalizePhase]

// Get phase by ID
export function getPhaseById(id: string): PhaseDefinition | undefined {
  return allPhases.find((p) => p.id === id)
}

// Topics for AI guidance - derived from Overview.md template sections.
// The AI uses these as a checklist of areas to cover.
export const DISCOVERY_TOPICS = [
  'elevator_pitch',      // What are you building, for whom, why?
  'problem_statement',   // What hurts, why, consequence?
  'target_users',        // Who, context, non-users?
  'value_proposition',   // Benefit, differentiator?
  'scope_and_antigoals', // In-scope, out-of-scope?
  'constraints',         // Time, tech, money, operational?
] as const

export type DiscoveryTopic = (typeof DISCOVERY_TOPICS)[number]
