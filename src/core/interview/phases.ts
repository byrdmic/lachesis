// Phase definitions for project intake
import type { PhaseDefinition } from "./types.ts";

// Setup phase questions (collected in SetupPhase component now)
// These are kept for reference but no longer used directly
export const setupQuestions = [];

// AI Conversation phase - AI handles all questions dynamically
export const aiConversationPhase: PhaseDefinition = {
  id: "vision",
  name: "Project Discovery",
  description: "Let's explore what you're building",
  summaryCheckQuestion: "Does this capture what you're building?",
  questions: [], // Empty - AI generates questions dynamically
};

// Finalize phase - wrap up and generate outputs
export const finalizePhase: PhaseDefinition = {
  id: "finalize",
  name: "Finalize",
  description: "Review and generate project files",
  summaryCheckQuestion: "Ready to generate your project structure?",
  questions: [], // Handled directly in FinalizePhase component
};

// All phases in order
export const allPhases: PhaseDefinition[] = [
  aiConversationPhase,
  finalizePhase,
];

// Get phase by ID
export function getPhaseById(id: string): PhaseDefinition | undefined {
  return allPhases.find((p) => p.id === id);
}

// Topics for AI guidance (not rigid questions)
// The AI uses these as a checklist of areas to cover
export const DISCOVERY_TOPICS = [
  "core_purpose",
  "target_users",
  "problem_solved",
  "constraints",
  "success_criteria",
  "anti_goals",
  "first_move",
  "tech_considerations",
] as const;

export type DiscoveryTopic = (typeof DISCOVERY_TOPICS)[number];
